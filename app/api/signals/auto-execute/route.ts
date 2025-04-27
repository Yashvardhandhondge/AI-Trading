// app/api/signals/auto-execute/route.ts
import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase, models } from "@/lib/db";
import { tradingProxy } from "@/lib/trading-proxy";
import { logger } from "@/lib/logger";

// Define interfaces for type safety
interface UserTradeResult {
  userId: number;
  success: boolean;
  amount?: number;
  price?: number;
  error?: string;
}

interface SignalExecutionResult {
  signal: string;
  price?: number;
  usersProcessed: number;
  successCount: number;
  failCount: number;
  userResults: UserTradeResult[];
  error?: string;
  success?: boolean;
}

// Security validation function to prevent unauthorized execution requests
const validateRequest = (req: NextRequest): boolean => {
  // In production, you should use a more secure authorization mechanism
  // This is a simple example that can be enhanced with API keys or other auth methods
  const authHeader = req.headers.get("Authorization");
  
  // Skip validation in development environment for testing
  if (process.env.NODE_ENV === "development") {
    return true;
  }
  
  if (!authHeader) {
    return false;
  }
  
  // For cron jobs, use a shared secret from environment variables
  const secretKey = process.env.AUTO_EXECUTION_SECRET || "cycle-trader-auto-execution";
  const validToken = `Bearer ${secretKey}`;
  
  return authHeader === validToken;
};

// Set a timeout to prevent hanging requests
const withTimeout = <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timeoutId: NodeJS.Timeout;
  
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  
  return Promise.race([
    promise,
    timeoutPromise
  ]).finally(() => clearTimeout(timeoutId));
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const requestId = `auto-exec-${startTime}-${Math.random().toString(36).substring(2, 10)}`;
  
  // Initialize logging
  logger.info(`Auto-execution request started (ID: ${requestId})`, {
    context: "AutoExecutionCron",
    data: { requestId }
  });
  
  try {
    // Skip validation in development for easier testing
    if (process.env.NODE_ENV !== "development") {
      // Validate the request for security
      if (!validateRequest(request)) {
        logger.warn(`Unauthorized auto-execution request (ID: ${requestId})`, {
          context: "AutoExecutionCron"
        });
        
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
    
    // Connect to database
    await connectToDatabase();
    
    // Find expired signals that haven't been auto-executed
    const now = new Date();
    const expiredSignals = await models.Signal.find({
      expiresAt: { $lte: now },
      autoExecuted: false,
    });

    logger.info(`Found ${expiredSignals.length} expired signals to auto-execute`, {
      context: "AutoExecution"
    });
    
    if (expiredSignals.length === 0) {
      return NextResponse.json({ 
        message: "No expired signals to process",
        timestamp: new Date().toISOString(),
        requestId
      });
    }
    
    const results: SignalExecutionResult[] = [];
    let totalSuccessful = 0;
    let totalFailed = 0;

    // Process each expired signal with a timeout to prevent hanging requests
    for (const signal of expiredSignals) {
      try {
        // Mark signal as auto-executed to prevent duplicate processing
        signal.autoExecuted = true;
        await signal.save();
        
        logger.info(`Processing auto-execution for ${signal.type} signal on ${signal.token}`, {
          context: "AutoExecution",
          data: { signalId: signal._id.toString() }
        });

        // Find users who should receive this signal based on risk level and other criteria
        const users = await findEligibleUsers(signal);

        logger.info(`Found ${users.length} eligible users for auto-execution of ${signal.token}`, {
          context: "AutoExecution"
        });

        const signalResult: SignalExecutionResult = {
          signal: `${signal.type}_${signal.token}`,
          price: signal.price,
          usersProcessed: 0,
          successCount: 0,
          failCount: 0,
          userResults: []
        };

        // Process for each eligible user
        for (const user of users) {
          try {
            // Check if user has already received a signal for this token in the last 24 hours
            const hasRecentSignal = user.lastSignalTokens.some(
              (item: any) =>
                item.token === signal.token &&
                new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000,
            );

            if (hasRecentSignal) {
              logger.info(`Skipping user ${user.telegramId} - recent signal for ${signal.token}`, {
                context: "AutoExecution"
              });
              continue; // Skip this user
            }

            // Get portfolio
            const portfolio = await models.Portfolio.findOne({ userId: user._id });

            if (!portfolio) {
              logger.info(`Skipping user ${user.telegramId} - no portfolio found`, {
                context: "AutoExecution"
              });
              continue; // Skip if no portfolio
            }

            // Calculate trade amount and parameters
            let amount = 0;
            let symbol = "";

            if (signal.type === "BUY") {
              // Use 10% of total portfolio
              const tradeValue = portfolio.totalValue * 0.1;

              // Calculate amount based on token price
              amount = tradeValue / signal.price;
              symbol = `${signal.token}USDT`;
              
              logger.info(`Auto-executing BUY for ${symbol}, amount: ${amount}, value: ${tradeValue}`, {
                context: "AutoExecution",
                userId: user.telegramId
              });
            } else if (signal.type === "SELL") {
              // Find the holding for this token
              const holding = portfolio.holdings.find((h: any) => h.token === signal.token);

              if (!holding || holding.amount <= 0) {
                logger.info(`Skipping user ${user.telegramId} - no holdings for ${signal.token}`, {
                  context: "AutoExecution"
                });
                continue; // Skip if no holdings
              }

              // Sell the entire holding
              amount = holding.amount;
              symbol = `${signal.token}USDT`;
              
              logger.info(`Auto-executing SELL for ${symbol}, amount: ${amount}`, {
                context: "AutoExecution",
                userId: user.telegramId
              });
            }

            try {
              // Execute the trade using the trading proxy
              const tradeResult = await withTimeout(
                tradingProxy.executeTrade(
                  user.telegramId,
                  symbol,
                  signal.type as "BUY" | "SELL",
                  amount
                ),
                30000 // 30-second timeout for trade execution
              );

              // Create trade record
              const trade = await models.Trade.create({
                userId: user._id,
                signalId: signal._id,
                type: signal.type,
                token: signal.token,
                price: tradeResult.price || signal.price,
                amount,
                status: "completed",
                autoExecuted: true,
                createdAt: new Date(),
              });

              // Update or create cycle
              if (signal.type === "BUY") {
                // Create new cycle
                const cycle = await models.Cycle.create({
                  userId: user._id,
                  token: signal.token,
                  entryTrade: trade._id,
                  state: "entry",
                  entryPrice: tradeResult.price || signal.price,
                  guidance: "Hold until exit signal or 10% profit",
                  createdAt: new Date(),
                  updatedAt: new Date(),
                });

                // Update trade with cycle ID
                trade.cycleId = cycle._id;
                await trade.save();
              } else if (signal.type === "SELL") {
                // Find active cycle for this token
                const cycle = await models.Cycle.findOne({
                  userId: user._id,
                  token: signal.token,
                  state: { $in: ["entry", "hold"] },
                });

                if (cycle) {
                  // Calculate PnL
                  const pnl = ((tradeResult.price || signal.price) - cycle.entryPrice) * amount;
                  const pnlPercentage = ((tradeResult.price || signal.price) - cycle.entryPrice) / cycle.entryPrice * 100;
                  
                  // Update cycle
                  cycle.exitTrade = trade._id;
                  cycle.state = "exit";
                  cycle.exitPrice = tradeResult.price || signal.price;
                  cycle.pnl = pnl;
                  cycle.pnlPercentage = pnlPercentage;
                  cycle.guidance = "Cycle completed";
                  cycle.updatedAt = new Date();
                  await cycle.save();

                  // Update trade with cycle ID
                  trade.cycleId = cycle._id;
                  await trade.save();
                }
              }

              // Update user's last signal tokens
              user.lastSignalTokens.push({
                token: signal.token,
                timestamp: new Date(),
              });
              await user.save();

              // Update portfolio
              try {
                const portfolioData = await tradingProxy.getPortfolio(user.telegramId);
                
                portfolio.totalValue = portfolioData.totalValue;
                portfolio.freeCapital = portfolioData.freeCapital;
                portfolio.allocatedCapital = portfolioData.allocatedCapital;
                portfolio.holdings = portfolioData.holdings;
                portfolio.updatedAt = new Date();
                await portfolio.save();
              } catch (portfolioError) {
                logger.error(`Error updating portfolio after auto-trade: ${portfolioError instanceof Error ? portfolioError.message : "Unknown error"}`);
              }

              // Create notification
              await models.Notification.create({
                userId: user._id,
                type: "trade",
                message: `Auto-executed ${signal.type} for ${signal.token} at ${signal.price}`,
                relatedId: trade._id,
                createdAt: new Date(),
              });

              signalResult.userResults.push({
                userId: user.telegramId,
                success: true,
                amount,
                price: tradeResult.price || signal.price
              });
              
              signalResult.successCount++;
              totalSuccessful++;
              
              logger.info(`Auto-execution successful for user ${user.telegramId}, ${signal.type} ${signal.token}`, {
                context: "AutoExecution"
              });
            } catch (tradeError) {
              const errorMessage = tradeError instanceof Error ? tradeError.message : "Unknown error";
              logger.error(`Error executing auto-trade: ${errorMessage}`);
              
              signalResult.userResults.push({
                userId: user.telegramId,
                success: false,
                error: errorMessage
              });
              
              signalResult.failCount++;
              totalFailed++;
              
              // Create error notification for user
              await models.Notification.create({
                userId: user._id,
                type: "system",
                message: `Failed to auto-execute ${signal.type} for ${signal.token}: ${errorMessage}`,
                createdAt: new Date(),
              });
            }
            
            signalResult.usersProcessed++;
          } catch (userError) {
            const errorMessage = userError instanceof Error ? userError.message : "Unknown error";
            logger.error(`Error processing auto-execution for user ${user.telegramId}: ${errorMessage}`);
            
            signalResult.userResults.push({
              userId: user.telegramId,
              success: false,
              error: errorMessage
            });
            
            signalResult.failCount++;
            totalFailed++;
          }
        }

        results.push(signalResult);
      } catch (signalError) {
        const errorMessage = signalError instanceof Error ? signalError.message : "Unknown error";
        logger.error(`Error processing signal ${signal._id}: ${errorMessage}`);
        
        results.push({
          signal: `${signal.type}_${signal.token}`,
          usersProcessed: 0,
          successCount: 0,
          failCount: 1,
          userResults: [],
          error: errorMessage,
          success: false
        });
        
        totalFailed++;
      }
    }

    const duration = Date.now() - startTime;
    
    logger.info(`Auto-execution completed in ${duration}ms (ID: ${requestId})`, {
      context: "AutoExecution",
      data: {
        processed: expiredSignals.length,
        successful: totalSuccessful,
        failed: totalFailed,
        duration
      }
    });

    return NextResponse.json({ 
      success: true, 
      processed: expiredSignals.length, 
      successful: totalSuccessful,
      failed: totalFailed,
      duration: `${duration}ms`,
      requestId,
      results 
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    logger.error(`Auto-execution failed after ${duration}ms (ID: ${requestId}): ${errorMessage}`);
    
    return NextResponse.json({ 
      success: false, 
      error: errorMessage,
      duration: `${duration}ms`,
      requestId
    }, { status: 500 });
  }
}

/**
 * Find users eligible for a signal based on various criteria
 */
async function findEligibleUsers(signal: any): Promise<any[]> {
  try {
    // For BUY signals: filter by risk level
    if (signal.type === "BUY") {
      // Find users with matching risk level who have exchange connected
      return await models.User.find({
        riskLevel: signal.riskLevel,
        exchangeConnected: true,
        // Only include users who have auto-trading enabled or not explicitly disabled
        $or: [
          { autoTradeEnabled: true },
          { autoTradeEnabled: { $exists: false }}
        ]
      });
    } 
    // For SELL signals: only notify users who own this token
    else if (signal.type === "SELL") {
      // First, find users with connected exchanges
      const usersWithExchange = await models.User.find({ 
        exchangeConnected: true,
        // Only include users who have auto-trading enabled or not explicitly disabled
        $or: [
          { autoTradeEnabled: true },
          { autoTradeEnabled: { $exists: false }}
        ]
      });
      
      const eligibleUsers = [];
      
      // Then check each user's portfolio to see if they own the token
      for (const user of usersWithExchange) {
        const portfolio = await models.Portfolio.findOne({ userId: user._id });
        
        if (portfolio && portfolio.holdings) {
          const hasToken = portfolio.holdings.some((h: any) => 
            h.token === signal.token && h.amount > 0
          );
          
          if (hasToken) {
            eligibleUsers.push(user);
          }
        }
      }
      
      return eligibleUsers;
    }
    
    // Default case
    return [];
  } catch (error) {
    logger.error(`Error finding eligible users: ${error instanceof Error ? error.message : "Unknown error"}`);
    return [];
  }
}