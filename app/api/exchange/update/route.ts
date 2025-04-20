import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models, encryptApiKey } from "@/lib/db"
import { ExchangeService } from "@/lib/exchange"

const API_SECRET_KEY = process.env.API_SECRET_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

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

    // Connect to database
    await connectToDatabase()

    // Get current user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // If API credentials are provided, validate them
    if (apiKey && apiSecret) {
      try {
        const exchangeService = new ExchangeService(exchange, { apiKey, apiSecret })
        const isValid = await exchangeService.validateConnection()

        if (!isValid) {
          return NextResponse.json({ error: "Invalid API credentials" }, { status: 400 })
        }

        // Encrypt API credentials
        const encryptedApiKey = encryptApiKey(apiKey, API_SECRET_KEY)
        const encryptedApiSecret = encryptApiKey(apiSecret, API_SECRET_KEY)

        // Update user exchange settings
        user.exchange = exchange
        user.apiKey = encryptedApiKey
        user.apiSecret = encryptedApiSecret
        user.exchangeConnected = true
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Could not connect to exchange"
        return NextResponse.json(
          {
            error: `Connection failed: ${errorMessage}`,
          },
          { status: 400 },
        )
      }
    } else {
      // Only update exchange type
      user.exchange = exchange
    }

    user.updatedAt = new Date()
    await user.save()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating exchange:", error)
    return NextResponse.json({ error: "Failed to update exchange" }, { status: 500 })
  }
}
