// app/api/cycles/active/route.ts - Updated with improved error handling
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"
import mongoose from "mongoose"

// Helper function to sync positions from exchange
async function syncPositionsFromExchange(user: any): Promise<void> {
  try {
    // Get portfolio from exchange
    const portfolioData = await tradingProxy.getPortfolio(user.telegramId);
    
    if (!portfolioData || !portfolioData.holdings) {
      return;
    }
    
    // For each holding that's not a stablecoin and has value
    for (const holding of portfolioData.holdings) {
      if (holding.amount > 0 && !['USDT', 'USDC', 'BUSD', 'DAI'].includes(holding.token)) {
        // Check if we already have a cycle for this token
        const existingCycle = await models.Cycle.findOne({
          userId: user._id,
          token: holding.token,
          state: { $in: ["entry", "hold"] }
        });
        
        if (!existingCycle) {
          // Create a new cycle for this holding
          await models.Cycle.create({
            userId: user._id,
            token: holding.token,
            state: "hold",
            entryPrice: holding.averagePrice || holding.currentPrice,
            guidance: "Imported from exchange",
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          logger.info(`Created cycle for existing ${holding.token} position for user ${user.telegramId}`, {
            context: "PositionSync",
            userId: user.telegramId
          });
        }
      }
    }
  } catch (error) {
    logger.error(`Error syncing positions: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// GET endpoint to retrieve active cycles
export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if exchange is connected
    if (!user.exchangeConnected) {
      return NextResponse.json({ error: "Exchange not connected" }, { status: 400 })
    }

    // Try to sync missing positions from exchange
    await syncPositionsFromExchange(user);

    // Get active cycles (now including those synced from exchange)
    const cycles = await models.Cycle.find({
      userId: user._id,
      state: { $in: ["entry", "hold", "exit"] },
    }).sort({ updatedAt: -1 })
    
    // Get current prices for tokens in active cycles
    const enhancedCycles = []
    
    for (const cycle of cycles) {
      try {
        // Get current price using trading proxy
        const currentPrice = await tradingProxy.getPrice(sessionUser.id, `${cycle.token}USDT`).catch(() => null)
        
        // Get entry trade for quantity information
        const entryTrade = cycle.entryTrade ? 
          await models.Trade.findById(cycle.entryTrade) : 
          null
        
        // Calculate updated PnL based on current price
        const quantity = entryTrade ? entryTrade.amount : 0.4 // Default quantity if not found
        const pnlValue = currentPrice ? 
          (currentPrice - cycle.entryPrice) * quantity : 
          cycle.pnl || 0
          
        const pnlPercentage = currentPrice && cycle.entryPrice ?
          ((currentPrice - cycle.entryPrice) / cycle.entryPrice * 100) :
          cycle.pnlPercentage || 0
        
        enhancedCycles.push({
          ...cycle.toObject(),
          id: cycle._id.toString(), // Ensure ID is a string
          currentPrice: currentPrice || (cycle.entryPrice * 1.1), // Default to +10% if not available
          quantity,
          pnl: pnlValue,
          pnlPercentage
        })
      } catch (error) {
        logger.error(`Error enhancing cycle data for ${cycle.token}: ${error instanceof Error ? error.message : "Unknown error"}`)
        
        // Add the cycle without enhancements
        enhancedCycles.push({
          ...cycle.toObject(),
          id: cycle._id.toString(), // Ensure ID is a string
          currentPrice: cycle.entryPrice * 1.1, // Default to +10%
          quantity: 0.4,
          pnl: cycle.pnl || 0,
          pnlPercentage: cycle.pnlPercentage || 0
        })
      }
    }

    return NextResponse.json({ cycles: enhancedCycles })
  } catch (error) {
    logger.error(`Error fetching active cycles: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to fetch active cycles" }, { status: 500 })
  }
}

// POST endpoint for executing actions on cycles (primarily selling positions)
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();
    
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse request body with fallbacks for missing fields
    const body = await request.json();
    const cycleId = body.cycleId;
    const token = body.token;
    const percentage = body.percentage || 100;
    const userId = body.userId || sessionUser.id;
    const currentPrice = body.currentPrice;
    
    logger.info(`Processing sell request: token=${token}, percentage=${percentage}%`, {
      context: "SellPosition",
      userId
    });

    // Connect to database
    await connectToDatabase();

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if exchange is connected
    if (!user.exchangeConnected) {
      return NextResponse.json({ error: "Exchange not connected" }, { status: 400 });
    }

    // Validate required fields with better error messages
    if (!token) {
      return NextResponse.json({ error: "Token symbol is required" }, { status: 400 });
    }

    // If cycleId is missing, try to find an existing cycle for this token
    let cycle;
    if (!cycleId) {
      logger.info(`No cycle ID provided, looking for existing cycle for ${token}`, {
        context: "SellPosition",
        userId
      });
      
      cycle = await models.Cycle.findOne({
        userId: user._id,
        token: token,
        state: { $in: ["entry", "hold"] }
      });
      
      if (!cycle) {
        console.log(`No cycle found for ${token} and cycleId not provided`, {
          context: "SellPosition",
          userId
        });
        return NextResponse.json({ error: "Cycle ID is required or no existing cycle found" }, { status: 400 });
      }
      
      logger.info(`Found existing cycle for ${token}: ${cycle._id}`, {
        context: "SellPosition",
        userId
      });
    } else {
      // Verify the cycle ID is valid and belongs to this user
      try {
        if (!mongoose.isValidObjectId(cycleId)) {
          return NextResponse.json({ error: "Invalid cycle ID format" }, { status: 400 });
        }
        
        cycle = await models.Cycle.findOne({
          _id: cycleId,
          userId: user._id
        });
        
        if (!cycle) {
          return NextResponse.json({ error: "Cycle not found or does not belong to user" }, { status: 404 });
        }
      } catch (cycleError) {
        logger.error(`Error retrieving cycle: ${cycleError instanceof Error ? cycleError.message : "Unknown error"}`);
        return NextResponse.json({ error: "Failed to retrieve cycle" }, { status: 500 });
      }
    }

    // Validate the trading pair
    const symbol = `${token}USDT`;
    try {
      const isValid = await tradingProxy.validateSymbol(userId, symbol);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid trading pair' }, { status: 400 });
      }
    } catch (error) {
      logger.error(`Symbol validation error: ${error instanceof Error ? error.message : "Unknown error"}`);
      return NextResponse.json({ error: 'Failed to validate trading pair' }, { status: 400 });
    }

    // Get position details from portfolio
    try {
      const portfolio = await tradingProxy.getPortfolio(userId);
      const position = portfolio.holdings.find((h: any) => h.token === token);
      
      if (!position || !position.amount) {
        return NextResponse.json({ error: 'Position not found or zero balance' }, { status: 404 });
      }

      // Calculate sell amount
      const sellAmount = (parseFloat(position.amount) * (percentage / 100)).toFixed(8);
      logger.info(`Selling ${sellAmount} ${token} (${percentage}% of position)`, {
        context: "SellPosition",
        userId
      });

      // Get current price if not provided
      let effectivePrice = currentPrice;
      if (!effectivePrice) {
        try {
          effectivePrice = await tradingProxy.getPrice(userId, symbol);
        } catch (priceError) {
          logger.error(`Failed to get price: ${priceError instanceof Error ? priceError.message : "Unknown error"}`);
          return NextResponse.json({ error: 'Could not get current price' }, { status: 400 });
        }
      }

      // Execute the trade
      try {
        const trade = await tradingProxy.executeTrade(
          userId,
          symbol,
          'SELL',
          parseFloat(sellAmount)
        );

        // Record in database - create Trade record
        const tradeRecord = await models.Trade.create({
          userId: user._id,
          cycleId: cycle._id,
          type: "SELL",
          token: token,
          price: trade.price || effectivePrice,
          amount: parseFloat(sellAmount),
          status: "completed",
          autoExecuted: false,
          createdAt: new Date()
        });

        // Update cycle state
        if (percentage >= 100) {
          // Complete cycle if selling 100%
          cycle.exitTrade = tradeRecord._id;
          cycle.state = "exit";
          cycle.exitPrice = trade.price || effectivePrice;
          
          // Calculate profit/loss
          const entryAmount = parseFloat(sellAmount); // Approximation, ideally should come from entry trade
          cycle.pnl = ((trade.price || effectivePrice) - cycle.entryPrice) * entryAmount;
          cycle.pnlPercentage = ((trade.price || effectivePrice) - cycle.entryPrice) / cycle.entryPrice * 100;
          
          cycle.guidance = "Cycle completed via sell action";
        } else {
          // For partial sells, record as partial exit
          if (!cycle.partialExits) {
            cycle.partialExits = [];
          }
          
          const partialExit = {
            tradeId: tradeRecord._id,
            percentage: percentage,
            price: trade.price || effectivePrice,
            amount: parseFloat(sellAmount),
            timestamp: new Date()
          };
          
          cycle.partialExits.push(partialExit);
          cycle.state = "hold"; // Keep in hold state for partial sells
          cycle.guidance = `Partially sold ${percentage}% at ${formatCurrency(trade.price || effectivePrice)}`;
        }
        
        cycle.updatedAt = new Date();
        await cycle.save();

        // Return success response with trade details
        return NextResponse.json({ 
          success: true, 
          trade: {
            id: tradeRecord._id.toString(),
            token,
            price: trade.price || effectivePrice,
            amount: parseFloat(sellAmount),
            percentage,
            timestamp: new Date().toISOString()
          },
          cycle: {
            id: cycle._id.toString(),
            state: cycle.state
          }
        });
      } catch (tradeError) {
        logger.error(`Trade execution error: ${tradeError instanceof Error ? tradeError.message : "Unknown error"}`);
        return NextResponse.json(
          { error: tradeError instanceof Error ? tradeError.message : 'Trade execution failed' },
          { status: 400 }
        );
      }
    } catch (portfolioError) {
      logger.error(`Error fetching portfolio: ${portfolioError instanceof Error ? portfolioError.message : "Unknown error"}`);
      return NextResponse.json({ error: 'Failed to fetch portfolio data' }, { status: 500 });
    }
  } catch (error) {
    logger.error(`Cycle execution error: ${error instanceof Error ? error.message : "Unknown error"}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Helper function to format currency for guidance messages
function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}