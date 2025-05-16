
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

    // Get risk level from query or use user default
    const searchParams = request.nextUrl.searchParams
    const riskLevel = searchParams.get("riskLevel") as "low" | "medium" | "high" | null || user.riskLevel || "medium"
    
    // Fetch active signals (within 10 minutes of creation) for the user's risk level
    const now = new Date()
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)
    
    // Find signals created within the last 10 minutes
    const activeSentSignal = await models.Signal.findOne({
      createdAt: { $gte: tenMinutesAgo },
      riskLevel,
      type: "BUY", // Start with BUY signals
    }).sort({ createdAt: -1 })

    // If no active BUY signal, check for SELL signals
    // For SELL signals, we need to check if the user owns the token
    if (!activeSentSignal) {
      // Check for SELL signals if the user has connected their exchange
      if (user.exchangeConnected) {
        // Get user's portfolio to check holdings
        const portfolio = await models.Portfolio.findOne({ userId: user._id })
        
        if (portfolio && portfolio.holdings) {
          // Get tokens the user owns
          const userTokens = portfolio.holdings
            .filter((h: any) => h.amount > 0)
            .map((h: any) => h.token)
          
          if (userTokens.length > 0) {
            // Find SELL signals for tokens the user owns
            const activeSellSignal = await models.Signal.findOne({
              createdAt: { $gte: tenMinutesAgo },
              type: "SELL",
              token: { $in: userTokens }
            }).sort({ createdAt: -1 })
            
            if (activeSellSignal) {
              // Format the signal data for response
              const now = new Date()
              const createdAt = new Date(activeSellSignal.createdAt)
              const tenMinutesLater = new Date(createdAt.getTime() + 10 * 60 * 1000)
              const canExecute = now < tenMinutesLater
              
              const signalData = {
                ...activeSellSignal.toObject(),
                id: activeSellSignal._id.toString(),
                createdAt: activeSellSignal.createdAt.toISOString(),
                expiresAt: activeSellSignal.expiresAt.toISOString(),
                canExecute
              }
              
              return NextResponse.json({ signal: signalData })
            }
          }
        }
      }
      
      // No active signals
      return NextResponse.json({ signal: null })
    }

    
    const createdAt = new Date(activeSentSignal.createdAt)
    const tenMinutesLater = new Date(createdAt.getTime() + 10 * 60 * 1000)
    const canExecute = now < tenMinutesLater
    
    const signalData = {
      ...activeSentSignal.toObject(),
      id: activeSentSignal._id.toString(),
      createdAt: activeSentSignal.createdAt.toISOString(),
      expiresAt: activeSentSignal.expiresAt.toISOString(),
      canExecute
    }

    return NextResponse.json({ signal: signalData })
  } catch (error) {
    logger.error(`Error fetching active signals: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to fetch active signals" }, { status: 500 })
  }
}