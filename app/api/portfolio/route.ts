// app/api/portfolio/route.ts
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

    await connectToDatabase()
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    if (!user.exchangeConnected) {
      return NextResponse.json({ error: "Exchange not connected" }, { status: 400 })
    }

    // Try to get fresh data with timeout
    try {
      const portfolioData = await Promise.race([
        tradingProxy.getPortfolio(sessionUser.id),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 10000)
        )
      ]);

      // Update database with fresh data
      let portfolio = await models.Portfolio.findOne({ userId: user._id })

      if (!portfolio) {
        portfolio = await models.Portfolio.create({
          userId: user._id,
          ...portfolioData,
          updatedAt: new Date(),
        })
      } else {
        portfolio = await models.Portfolio.findOneAndUpdate(
          { userId: user._id },
          { ...portfolioData, updatedAt: new Date() },
          { new: true }
        )
      }

      return NextResponse.json(portfolio)
    } catch (error) {
      logger.warn(`Failed to fetch fresh portfolio data: ${error instanceof Error ? error.message : 'Unknown error'}`)
      
      // Return cached data if available
      const cachedPortfolio = await models.Portfolio.findOne({ userId: user._id })
      
      if (cachedPortfolio) {
        return NextResponse.json({
          ...cachedPortfolio.toObject(),
          _cached: true,
          _cacheAge: Date.now() - (cachedPortfolio.updatedAt ?? new Date()).getTime()
        })
      }
      
      throw error;
    }
  } catch (error) {
    logger.error(`Error in portfolio endpoint: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return NextResponse.json({ error: "Failed to fetch portfolio data" }, { status: 500 })
  }
}