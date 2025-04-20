import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { ExchangeService } from "@/lib/exchange"

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

    if (!user.exchangeConnected) {
      return NextResponse.json({ error: "Exchange not connected" }, { status: 400 })
    }

    // Get portfolio data
    let portfolio = await models.Portfolio.findOne({ userId: user._id })

    if (!portfolio) {
      // Initialize portfolio
      const exchangeService = new ExchangeService(user.exchange, {
        apiKey: user.apiKey,
        apiSecret: user.apiSecret,
      })

      const portfolioData = await exchangeService.getPortfolio()

      portfolio = await models.Portfolio.create({
        userId: user._id,
        totalValue: portfolioData.totalValue,
        freeCapital: portfolioData.freeCapital,
        allocatedCapital: portfolioData.allocatedCapital,
        holdings: portfolioData.holdings,
        updatedAt: new Date(),
      })
    }

    return NextResponse.json(portfolio)
  } catch (error) {
    console.error("Error fetching portfolio:", error)
    return NextResponse.json({ error: "Failed to fetch portfolio data" }, { status: 500 })
  }
}
