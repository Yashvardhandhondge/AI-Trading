import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models, encryptApiKey } from "@/lib/db"
import { ExchangeService } from "@/lib/exchange"

const API_SECRET_KEY = process.env.API_SECRET_KEY || "3205bd9c55cf46effe51835123d875a22b82f5e2ca85842500aed88d65692b20"

if (!API_SECRET_KEY) {
  throw new Error('API_SECRET_KEY environment variable is not defined');
}

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { exchange, apiKey, apiSecret } = await request.json()

    if (!exchange || !["binance", "btcc"].includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange" }, { status: 400 })
    }

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "API key and secret are required" }, { status: 400 })
    }

    // Validate exchange connection
    const exchangeService = new ExchangeService(exchange, { apiKey, apiSecret })

    try {
      const isValid = await exchangeService.validateConnection()

      if (!isValid) {
        return NextResponse.json({ error: "Invalid API credentials" }, { status: 400 })
      }
    } catch (error) {
      return NextResponse.json(
        {
          error: `Connection failed: ${error instanceof Error ? error.message : "Could not connect to exchange"}`,
        },
        { status: 400 },
      )
    }

    // Connect to database
    await connectToDatabase()

    // Encrypt API credentials
    const encryptedApiKey = encryptApiKey(apiKey, API_SECRET_KEY)
    const encryptedApiSecret = encryptApiKey(apiSecret, API_SECRET_KEY)

    // Update user exchange settings
    await models.User.findOneAndUpdate(
      { telegramId: sessionUser.id },
      {
        exchange,
        apiKey: encryptedApiKey,
        apiSecret: encryptedApiSecret,
        exchangeConnected: true,
        updatedAt: new Date(),
      },
    )

    // Initialize portfolio if it doesn't exist
    const user = await models.User.findOne({ telegramId: sessionUser.id })
    const portfolio = await models.Portfolio.findOne({ userId: user._id })

    if (!portfolio) {
      // Fetch initial portfolio data
      const portfolioData = await exchangeService.getPortfolio()

      await models.Portfolio.create({
        userId: user._id,
        totalValue: portfolioData.totalValue,
        freeCapital: portfolioData.freeCapital,
        allocatedCapital: portfolioData.allocatedCapital,
        holdings: portfolioData.holdings,
        updatedAt: new Date(),
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error connecting exchange:", error)
    return NextResponse.json({ error: "Failed to connect exchange" }, { status: 500 })
  }
}
