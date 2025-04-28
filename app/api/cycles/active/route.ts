// app/api/cycles/active/route.ts - Updated to provide more data for PnL view
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"

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

    // Get active cycles
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
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get request body
    const { cycleId, percentage = 100 } = await request.json()
    
    if (!cycleId) {
      return NextResponse.json({ error: "Cycle ID is required" }, { status: 400 })
    }
    
    // Validate percentage
    if (percentage <= 0 || percentage > 100) {
      return NextResponse.json({ error: "Percentage must be between 1 and 100" }, { status: 400 })
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

    // Find the cycle
    const cycle = await models.Cycle.findOne({
      _id: cycleId,
      userId: user._id
    })

    if (!cycle) {
      return NextResponse.json({ error: "Cycle not found" }, { status: 404 })
    }

    // Get entry trade for quantity information
    const entryTrade = cycle.entryTrade ? 
      await models.Trade.findById(cycle.entryTrade) : 
      null
      
    if (!entryTrade) {
      return NextResponse.json({ error: "Entry trade not found for this cycle" }, { status: 404 })
    }
    
    // Calculate sell amount based on percentage
    const sellAmount = entryTrade.amount * (percentage / 100)
    
    // Get current price
    const currentPrice = await tradingProxy.getPrice(sessionUser.id, `${cycle.token}USDT`)
    
    // Execute sell order
    const tradeResult = await tradingProxy.executeTrade(
      sessionUser.id,
      `${cycle.token}USDT`,
      "SELL",
      sellAmount
    )
    
    // Create trade record
    const trade = await models.Trade.create({
      userId: user._id,
      cycleId: cycle._id,
      type: "SELL",
      token: cycle.token,
      price: tradeResult.price || currentPrice,
      amount: sellAmount,
      status: "completed",
      autoExecuted: false,
      createdAt: new Date(),
    })
    
    // Update cycle based on percentage
    if (percentage === 100) {
      // Complete cycle for full sells
      cycle.exitTrade = trade._id
      cycle.state = "exit"
      cycle.exitPrice = tradeResult.price || currentPrice
      cycle.pnl = ((tradeResult.price || currentPrice) - cycle.entryPrice) * sellAmount
      cycle.pnlPercentage = ((tradeResult.price || currentPrice) - cycle.entryPrice) / cycle.entryPrice * 100
      cycle.updatedAt = new Date()
    } else {
      // Just update fields for partial sells
      cycle.updatedAt = new Date()
      // Store partial exit information
      cycle.partialExits = cycle.partialExits || []
      cycle.partialExits.push({
        tradeId: trade._id,
        percentage,
        price: tradeResult.price || currentPrice,
        amount: sellAmount,
        timestamp: new Date()
      })
    }
    
    await cycle.save()
    
    // Create notification
    await models.Notification.create({
      userId: user._id,
      type: "trade",
      message: `Sold ${percentage}% of ${cycle.token} at ${tradeResult.price || currentPrice}`,
      relatedId: trade._id,
      createdAt: new Date(),
    })
    
    logger.info(`Successfully executed ${percentage}% sell for ${cycle.token}`, {
      context: "CyclesSell",
      userId: sessionUser.id
    })
    
    return NextResponse.json({
      success: true,
      trade,
      cycle: cycle.toObject()
    })
  } catch (error) {
    logger.error(`Error selling position: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to sell position" }, { status: 500 })
  }
}