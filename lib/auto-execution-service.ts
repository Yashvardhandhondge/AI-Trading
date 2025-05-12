// lib/auto-execution-service.ts
import { logger } from "@/lib/logger";
import { connectToDatabase, models, SignalDocument, UserDocument, PortfolioDocument } from "@/lib/db"; // Import UserDocument and SignalDocument
import { tradingProxy } from "@/lib/trading-proxy";
import { enhancedNotificationService } from "@/lib/enhanced-notification-service";
import mongoose from "mongoose"; // Import mongoose for Document type

// Define a type for the items in user.lastSignalTokens for clarity
interface LastSignalTokenItem {
  token: string;
  timestamp: Date;
}

// Define a type for portfolio holdings items for clarity
interface PortfolioHoldingItem {
  token: string;
  amount: number;
  averagePrice?: number;
  currentPrice?: number;
  value?: number;
  pnl?: number;
  pnlPercentage?: number;
}


export class AutoExecutionService {
  private static instance: AutoExecutionService;
  
  private constructor() {
    // Initialize service
  }
  
  public static getInstance(): AutoExecutionService {
    if (!AutoExecutionService.instance) {
      AutoExecutionService.instance = new AutoExecutionService();
    }
    return AutoExecutionService.instance;
  }
  
  /**
   * Process all pending signals that need auto-execution
   */
  public async processAutoExecutions(): Promise<{
    processed: number;
    successful: number;
    failed: number;
    details: any[];
  }> {
    try {
      logger.info("Starting auto-execution processing", { context: "AutoExecution" });
      
      await connectToDatabase();
      
      // Get current time
      const now = new Date();
      
      // Find signals that have expired but haven't been auto-executed
      const expiredSignals = await models.Signal.find({
        expiresAt: { $lte: now },
        autoExecuted: false
      }) as (mongoose.Document<unknown, {}, SignalDocument> & SignalDocument)[]; // Type assertion
      
      logger.info(`Found ${expiredSignals.length} signals to auto-execute`, { context: "AutoExecution" });
      
      if (expiredSignals.length === 0) {
        return { processed: 0, successful: 0, failed: 0, details: [] };
      }
      
      let successful = 0;
      let failed = 0;
      const details = [];
      
      // Process each expired signal
      for (const signal of expiredSignals) {
        try {
          // Mark signal as auto-executed to prevent duplicate processing
          // This is critical to prevent double-execution
          signal.autoExecuted = true;
          await signal.save();
          
          logger.info(`Processing auto-execution for ${signal.type} signal on ${signal.token}`, {
            context: "AutoExecution",
            data: {
              signalId: signal._id.toString(),
              token: signal.token,
              price: signal.price
            }
          });
          
          // Find eligible users for this signal
          const users = await this.findEligibleUsersForSignal(signal);
          
          logger.info(`Found ${users.length} eligible users for auto-execution`, {
            context: "AutoExecution",
            data: { signalId: signal._id.toString() }
          });
          
          // Process for each eligible user
          for (const user of users) {
            try {
              // Execute the trade
              const result = await this.executeTradeForUser(signal, user);
              
              if (result.success) {
                successful++;
                details.push({
                  userId: user.telegramId,
                  token: signal.token,
                  action: signal.type,
                  success: true,
                  amount: result.amount,
                  price: result.price
                });
              } else {
                failed++;
                details.push({
                  userId: user.telegramId,
                  token: signal.token,
                  action: signal.type,
                  success: false,
                  error: result.error
                });
              }
            } catch (userError) {
              logger.error(`Error executing trade for user ${user.telegramId}: ${userError instanceof Error ? userError.message : "Unknown error"}`);
              failed++;
              details.push({
                userId: user.telegramId,
                token: signal.token,
                action: signal.type,
                success: false,
                error: userError instanceof Error ? userError.message : "Unknown error"
              });
            }
          }
        } catch (signalError) {
          logger.error(`Error processing signal ${signal._id}: ${signalError instanceof Error ? signalError.message : "Unknown error"}`);
          failed++;
        }
      }
      
      return {
        processed: expiredSignals.length,
        successful,
        failed,
        details
      };
    } catch (error) {
      logger.error(`Auto-execution error: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Find users eligible for auto-execution of a signal
   */
  private async findEligibleUsersForSignal(signal: SignalDocument): Promise<UserDocument[]> {
    try {
      // Different criteria for BUY vs SELL signals
      if (signal.type === "BUY") {
        // For BUY signals, find users with matching risk level, exchange connected, and auto-trade enabled
        const eligibleUsers = await models.User.find({
          riskLevel: signal.riskLevel,
          exchangeConnected: true,
          autoTradeEnabled: true // Query for explicitly true, as schema defaults to true
        }) as UserDocument[];
        
        // Filter out users who have already received a signal for this token in the last 24 hours
        return eligibleUsers.filter(user => {
          const hasRecentSignal = user.lastSignalTokens.some(
            (item: LastSignalTokenItem) => // Use defined type
              item.token === signal.token &&
              new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000
          );
          
          return !hasRecentSignal;
        });
      } else if (signal.type === "SELL") {
        // For SELL signals, we need to check portfolio holdings
        const usersWithExchange = await models.User.find({
          exchangeConnected: true,
          autoTradeEnabled: true // Query for explicitly true
        }) as UserDocument[];
        
        const eligibleUsers: UserDocument[] = [];
        
        // Check each user's portfolio to see if they own the token
        for (const user of usersWithExchange) {
          const portfolio = await models.Portfolio.findOne({ userId: user._id }) as PortfolioDocument | null;
          
          if (portfolio && portfolio.holdings) {
            const hasToken = portfolio.holdings.some(
              (h: PortfolioHoldingItem) => h.token === signal.token && h.amount > 0 // Use defined type
            );
            
            if (hasToken) {
              eligibleUsers.push(user);
            }
          }
        }
        
        return eligibleUsers;
      }
      
      return [];
    } catch (error) {
      logger.error(`Error finding eligible users: ${error instanceof Error ? error.message : "Unknown error"}`);
      return [];
    }
  }
  
  /**
   * Execute a trade for a specific user
   */
  private async executeTradeForUser(signal: SignalDocument, user: UserDocument): Promise<{
    success: boolean;
    amount?: number;
    price?: number;
    error?: string;
  }> {
    try {
      logger.info(`Executing ${signal.type} for ${signal.token} for user ${user.telegramId}`, {
        context: "AutoExecution"
      });
      
      // Get user's portfolio
      const portfolio = await models.Portfolio.findOne({ userId: user._id }) as PortfolioDocument | null;
      
      if (!portfolio) {
        throw new Error("User portfolio not found");
      }
      
      let amount = 0;
      let symbol = `${signal.token}USDT`;
      
      // Calculate trade amount based on signal type
      if (signal.type === "BUY") {
        // Use 10% of total portfolio value
        const tradeValue = portfolio.totalValue * 0.1; // totalValue is now required number
        
        if (tradeValue <= 0) {
          throw new Error("Insufficient portfolio value");
        }
        
        // Calculate amount based on token price
        amount = tradeValue / signal.price;
        
        logger.info(`Auto-executing BUY for ${signal.token}, amount: ${amount}, value: ${tradeValue}`, {
          context: "AutoExecution",
          userId: user.telegramId
        });
      } else if (signal.type === "SELL") {
        // Find the holding for this token
        const holding = portfolio.holdings?.find((h: PortfolioHoldingItem) => h.token === signal.token); // Use defined type
        
        if (!holding || holding.amount <= 0) {
          throw new Error(`No holdings found for ${signal.token}`);
        }
        
        // Sell the entire holding
        amount = holding.amount;
        
        logger.info(`Auto-executing SELL for ${signal.token}, amount: ${amount}`, {
          context: "AutoExecution",
          userId: user.telegramId
        });
      }
      
      // Execute the trade via trading proxy
      const tradeResult = await tradingProxy.executeTrade(
        user.telegramId,
        symbol,
        signal.type,
        amount
      );
      
      // Create trade record in database
      const trade = await models.Trade.create({
        userId: user._id,
        signalId: signal._id,
        type: signal.type,
        token: signal.token,
        price: tradeResult.price || signal.price,
        amount,
        status: "completed",
        autoExecuted: true,
        createdAt: new Date()
      });
      
      // Update or create cycle based on trade type
      if (signal.type === "BUY") {
        // Create new cycle
        const cycle = await models.Cycle.create({
          userId: user._id,
          token: signal.token,
          entryTrade: trade._id,
          state: "entry",
          entryPrice: tradeResult.price || signal.price, // entryPrice is required
          guidance: "Hold until exit signal or 10% profit",
          createdAt: new Date(),
          updatedAt: new Date()
        });
        
        // Update trade with cycle ID
        trade.cycleId = cycle._id;
        await trade.save();
      } else if (signal.type === "SELL") {
        // Find active cycle for this token
        const cycle = await models.Cycle.findOne({
          userId: user._id,
          token: signal.token,
          state: { $in: ["entry", "hold"] }
        });
        
        if (cycle) {
          // Calculate PnL
          const pnl = ((tradeResult.price || signal.price) - cycle.entryPrice) * amount; // cycle.entryPrice is required number
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
      
      // Update user's last signal tokens for BUY signals
      if (signal.type === "BUY") {
        user.lastSignalTokens.push({
          token: signal.token,
          timestamp: new Date()
        });
        await user.save();
      }
      
      // Refresh portfolio data
      try {
        const portfolioData = await tradingProxy.getPortfolio(user.telegramId);
        
        // Update portfolio record
        portfolio.totalValue = portfolioData.totalValue;
        portfolio.freeCapital = portfolioData.freeCapital;
        portfolio.allocatedCapital = portfolioData.allocatedCapital;
        portfolio.holdings = portfolioData.holdings;
        portfolio.updatedAt = new Date();
        await portfolio.save();
      } catch (portfolioError) {
        logger.error(`Error updating portfolio after auto-trade: ${portfolioError instanceof Error ? portfolioError.message : "Unknown error"}`);
      }
      
      // Send notification to user about auto-execution
      await enhancedNotificationService.sendNotification({
        userId: user._id.toString(), // Convert ObjectId to string
        type: "trade",
        message: `Auto-executed ${signal.type} for ${signal.token} at $${tradeResult.price || signal.price}`,
        relatedId: trade._id.toString(), // Convert ObjectId to string
        priority: "high",
        data: {
          tradeId: trade._id.toString(),
          signalId: signal._id.toString(),
          token: signal.token,
          type: signal.type,
          amount,
          price: tradeResult.price || signal.price
        }
      });
      
      return {
        success: true,
        amount,
        price: tradeResult.price || signal.price
      };
    } catch (error) {
      logger.error(`Trade execution error: ${error instanceof Error ? error.message : "Unknown error"}`);
      
      // Send failure notification to user
      await enhancedNotificationService.sendNotification({
        userId: user._id.toString(), // Convert ObjectId to string
        type: "system",
        message: `Failed to auto-execute ${signal.type} for ${signal.token}: ${error instanceof Error ? error.message : "Unknown error"}`,
        priority: "high"
      });
      
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }
}

// Export singleton instance
export const autoExecutionService = AutoExecutionService.getInstance();