// app/api/cycles/active/route.ts - Updated to provide more data for PnL view
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"

// app/api/cycles/active/route.ts - Improved syncPositionsFromExchange function
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

// Add a new endpoint to sell positions
export async function POST(request: Request) {
  try {
    const { cycleId, token, percentage, userId, currentPrice } = await request.json();

    if (!cycleId || !token || !userId) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    // Validate the trading pair
    const symbol = `${token}USDT`;
    try {
      const isValid = await tradingProxy.validateSymbol(userId, symbol);
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid trading pair' }, { status: 400 });
      }
    } catch (error) {
      logger.error(`Symbol validation error: ${error}`);
      return NextResponse.json({ error: 'Failed to validate trading pair' }, { status: 400 });
    }

    // Get position details
    const portfolio = await tradingProxy.getPortfolio(userId);
    const position = portfolio.holdings.find((h: any) => h.token === token);
    
    if (!position || !position.amount) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    }

    // Calculate sell amount
    const sellAmount = (position.amount * (percentage / 100)).toFixed(8);

    // Execute the trade
    try {
      const trade = await tradingProxy.executeTrade(
        userId,
        symbol,
        'SELL',
        parseFloat(sellAmount),
        currentPrice
      );

      return NextResponse.json({ success: true, trade });
    } catch (error) {
      logger.error(`Trade execution error: ${error}`);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Trade execution failed' },
        { status: 400 }
      );
    }
  } catch (error) {
    logger.error(`Cycle execution error: ${error}`);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}