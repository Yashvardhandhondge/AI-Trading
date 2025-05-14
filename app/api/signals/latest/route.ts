// app/api/signals/latest/route.ts - Updated to fetch signals from last 30 minutes
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const sinceParam = searchParams.get("since")
    
    // Default to 30 minutes ago for tradeable signals
    const defaultTime = Date.now() - 30 * 60 * 1000
    const since = sinceParam ? parseInt(sinceParam) : defaultTime
    
    // Create a date from the timestamp
    const sinceDate = new Date(since)
    
    // Fetch active signals from the database
    const dbSignals = await models.Signal.find({
      createdAt: { $gte: sinceDate },
      expiresAt: { $gt: new Date() }, // Only active signals
      price: { $gt: 0 } // Only signals with valid prices
    }).sort({ createdAt: -1 })
    
    if (!dbSignals || dbSignals.length === 0) {
      return NextResponse.json({ signals: [] })
    }
    
    // Extract user's current holdings if exchange is connected
    let userHoldings: string[] = []
    if (user.exchangeConnected) {
      const portfolio = await models.Portfolio.findOne({ userId: user._id })
      if (portfolio && portfolio.holdings) {
        userHoldings = portfolio.holdings
          .filter((h: any) => h.amount > 0)
          .map((h: any) => h.token)
      }
    }
    
    // Filter signals based on user's risk level and holdings
    const filteredSignals = dbSignals
      .map((signal: any) => {
        const plainSignal = signal.toObject()
        
        return {
          ...plainSignal,
          id: plainSignal._id.toString(),
          createdAt: new Date(plainSignal.createdAt).toISOString(),
          expiresAt: new Date(plainSignal.expiresAt).toISOString()
        }
      })
      .filter((signal: any) => {
        // For BUY signals, filter by risk level
        if (signal.type === "BUY") {
          return signal.riskLevel === user.riskLevel
        }
        // For SELL signals, only include them if user owns the token
        else if (signal.type === "SELL") {
          return userHoldings.includes(signal.token)
        }
        return false
      })
    
    return NextResponse.json({ signals: filteredSignals })
  } catch (error) {
    logger.error(`Error fetching latest signals: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to fetch latest signals" }, { status: 500 })
  }
}