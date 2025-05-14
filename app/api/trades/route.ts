// app/api/trades/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { tradingProxy } from "@/lib/trading-proxy"
import { logger } from "@/lib/logger"

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    logger.info(`Fetching trades for user ${sessionUser.id}`)

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // If exchange is not connected, return empty trades
    if (!user.exchangeConnected) {
      return NextResponse.json({
        trades: [],
        count: 0,
        message: "Exchange not connected"
      })
    }

    try {
      // Get trades from proxy
      const trades = await tradingProxy.getUserTrades(sessionUser.id)
      
      logger.info(`Fetched ${trades.length} trades for user ${sessionUser.id}`)
      
      return NextResponse.json({
        trades: trades,
        count: trades.length,
        source: 'binance'
      })
    } catch (proxyError) {
      logger.error(`Error fetching trades from proxy: ${proxyError instanceof Error ? proxyError.message : "Unknown error"}`)
      
      // Return empty array instead of throwing
      return NextResponse.json({
        trades: [],
        count: 0,
        error: proxyError instanceof Error ? proxyError.message : "Failed to fetch trades"
      })
    }
  } catch (error) {
    logger.error(`Error in trades endpoint: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ 
      error: "Failed to fetch trades",
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 })
  }
}