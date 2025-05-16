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
    
    // Default to 24 hours ago for showing more historical signals
    const defaultTime = Date.now() - 24 * 60 * 60 * 1000 // 24 hours instead of 30 minutes
    const since = sinceParam ? parseInt(sinceParam) : defaultTime
    
    // Create a date from the timestamp
    const sinceDate = new Date(since)
    
    // Fetch active signals from the database - include expired ones too
    const dbSignals = await models.Signal.find({
      createdAt: { $gte: sinceDate },
      price: { $gt: 0 } // Only signals with valid prices
    }).sort({ createdAt: -1 })
    
    if (!dbSignals || dbSignals.length === 0) {
      logger.info("No signals found in the database for the specified time period")
      return NextResponse.json({ signals: [] })
    }
    
    logger.info(`Found ${dbSignals.length} signals in the database`)
    
    // Extract user's current holdings if exchange is connected
    let userHoldings: string[] = []
    if (user.exchangeConnected) {
      const portfolio = await models.Portfolio.findOne({ userId: user._id })
      if (portfolio && portfolio.holdings) {
        userHoldings = portfolio.holdings
          .filter((h: any) => h.amount > 0)
          .map((h: any) => h.token)
        
        logger.info(`User has holdings in: ${userHoldings.join(', ')}`)
      }
    }
    
    // Filter signals based on user's risk level and holdings
    const filteredSignals = dbSignals
      .map((signal: any) => {
        const plainSignal = signal.toObject()
        const now = new Date()
        const createdAt = new Date(plainSignal.createdAt)
        const tenMinutesLater = new Date(createdAt.getTime() + 10 * 60 * 1000)
        const canExecute = now < tenMinutesLater
        
        return {
          ...plainSignal,
          id: plainSignal._id.toString(),
          createdAt: createdAt.toISOString(),
          expiresAt: plainSignal.expiresAt.toISOString(),
          canExecute: canExecute // Add this flag for frontend
        }
      })
      .filter((signal: any) => {
        // Show all signals that match user's risk level
        if (signal.type === "BUY") {
          return signal.riskLevel === user.riskLevel
        }
        // For SELL signals, only include them if user owns the token
        else if (signal.type === "SELL") {
          return userHoldings.includes(signal.token)
        }
        return false
      })
    
    logger.info(`Returning ${filteredSignals.length} filtered signals`)
    
    return NextResponse.json({ signals: filteredSignals })
  } catch (error) {
    logger.error(`Error fetching latest signals: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to fetch latest signals" }, { status: 500 })
  }
}