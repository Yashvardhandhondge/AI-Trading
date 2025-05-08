// app/api/portfolio/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { tradingProxy } from "@/lib/trading-proxy"
import { logger } from "@/lib/logger"

export async function GET(request: NextRequest) {
  try {
    console.log("[DEBUG API] Portfolio request received");

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

    if (!user.exchangeConnected) {
      return NextResponse.json({ error: "Exchange not connected" }, { status: 400 })
    }

    // Get portfolio data using the trading proxy
    try {
      console.log("[DEBUG API] Fetching portfolio from proxy...");

      // Check if portfolio exists in database
      let portfolio = await models.Portfolio.findOne({ userId: user._id })

      if (!portfolio) {
        // Initialize portfolio using the trading proxy
        const portfolioData = await tradingProxy.getPortfolio(sessionUser.id)

        // Create portfolio document from the data received from trading proxy
        portfolio = await models.Portfolio.create({
          userId: user._id,
          totalValue: portfolioData.totalValue,
          freeCapital: portfolioData.freeCapital,
          allocatedCapital: portfolioData.allocatedCapital,
          holdings: portfolioData.holdings,
          updatedAt: new Date(),
        })
        
        logger.info("Created new portfolio for user", {
          context: "Portfolio",
          userId: sessionUser.id
        })
      } else {
        // Optionally refresh portfolio data if it's stale
        const lastUpdate = new Date(portfolio.updatedAt).getTime()
        const now = Date.now()
        const fiveMinutes = 5 * 60 * 1000
        
        if (now - lastUpdate > fiveMinutes) {
          try {
            const portfolioData = await tradingProxy.getPortfolio(sessionUser.id)
            
            // Update the portfolio with fresh data
            portfolio.totalValue = portfolioData.totalValue
            portfolio.freeCapital = portfolioData.freeCapital
            portfolio.allocatedCapital = portfolioData.allocatedCapital
            portfolio.holdings = portfolioData.holdings
            portfolio.updatedAt = new Date()
            await portfolio.save()
            
            logger.info("Updated portfolio with fresh data", {
              context: "Portfolio",
              userId: sessionUser.id
            })
          } catch (error) {
            logger.warn(`Failed to update portfolio data: ${error instanceof Error ? error.message : "Unknown error"}`, {
              context: "Portfolio",
              userId: sessionUser.id
            })
            // Continue with existing portfolio data
          }
        }
      }

      return NextResponse.json(portfolio)
    } catch (error) {
      const errorMessage = error instanceof Error ? error : "Unknown error"
      logger.error(`Failed to fetch portfolio data: ${errorMessage}`)
      
      return NextResponse.json({ error: "Failed to fetch portfolio data" }, { status: 500 })
    }
  } catch (error) {
    logger.error(`Error in portfolio endpoint: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to fetch portfolio data" }, { status: 500 })
  }
}