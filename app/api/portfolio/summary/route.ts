// app/api/portfolio/summary/route.ts
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

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // If exchange is not connected, return 0 values
    if (!user.exchangeConnected) {
      return NextResponse.json({
        totalValue: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
      })
    }

    try {
      // Try to get portfolio data from proxy
      const portfolioData = await tradingProxy.getPortfolio(sessionUser.id)
      
      return NextResponse.json({
        totalValue: portfolioData.totalValue || 0,
        realizedPnl: portfolioData.realizedPnl || 0,
        unrealizedPnl: portfolioData.unrealizedPnl || 0,
      })
    } catch (proxyError) {
      logger.error(`Error fetching portfolio from proxy: ${proxyError instanceof Error ? proxyError.message : "Unknown error"}`)
      
      // Try to get portfolio from database as fallback
      const portfolio = await models.Portfolio.findOne({ userId: user._id })
      
      if (!portfolio) {
        return NextResponse.json({
          totalValue: 0,
          realizedPnl: 0,
          unrealizedPnl: 0,
        })
      }
      
      return NextResponse.json({
        totalValue: portfolio.totalValue || 0,
        realizedPnl: portfolio.realizedPnl || 0,
        unrealizedPnl: portfolio.unrealizedPnl || 0,
      })
    }
  } catch (error) {
    logger.error(`Error fetching portfolio summary: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to fetch portfolio summary" }, { status: 500 })
  }
}