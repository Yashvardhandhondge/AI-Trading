// app/api/signals/list/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { EkinApiService } from "@/lib/ekin-api"
import { logger } from "@/lib/logger"
import { getAnyMockSignal } from "@/lib/mock-signals"

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

    // Extract user's current holdings (tokens they own) if exchange is connected
    let userHoldings: string[] = []
    if (user.exchangeConnected) {
      const portfolio = await models.Portfolio.findOne({ userId: user._id })
      if (portfolio && portfolio.holdings) {
        userHoldings = portfolio.holdings
          .filter((h: any) => h.amount > 0)  // Only include tokens with non-zero amounts
          .map((h: any) => h.token)
        
        logger.info(`User has holdings in tokens: ${userHoldings.join(', ')}`, { 
          context: "SignalFiltering", 
          userId: user._id.toString() 
        })
      }
    }

    // Get active signals from database
    const signals = await models.Signal.find({
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 }).limit(10)  // Get up to 10 active signals

    if (signals && signals.length > 0) {
      logger.info(`Found ${signals.length} active signals`, {
        context: "SignalsList",
        userId: user._id.toString()
      })
      
      // For SELL signals, only include ones for tokens the user owns
      const filteredSignals = signals.filter(signal => {
        if (signal.type === "SELL") {
          return userHoldings.includes(signal.token)
        }
        return true // Keep all BUY signals
      })
      
      return NextResponse.json({ signals: filteredSignals })
    }
    
    // If no signals in database, try to get from Ekin API
    try {
      // Fetch fresh signals from Ekin API
      const ekinSignals = await EkinApiService.getSignals()
      logger.info(`Fetched ${ekinSignals.length} signals from Ekin API`, { 
        context: "SignalsList"
      })

      // Filter and convert to app signal format
      const appSignals = ekinSignals.filter(signal => {
        // For SELL signals, only include ones for tokens the user owns
        if (signal.type === "SELL") {
          return userHoldings.includes(signal.symbol)
        }
        return true // Keep all BUY signals
      }).map(signal => EkinApiService.convertToAppSignal(signal))

      if (appSignals.length > 0) {
        // Store signals in database for future reference
        for (const signal of appSignals) {
          // Check if signal already exists
          const existingSignal = await models.Signal.findOne({
            token: signal.token,
            price: signal.price,
            expiresAt: { $gt: new Date() },
          })
          
          if (!existingSignal) {
            await models.Signal.create(signal)
            logger.info(`Stored new ${signal.type} signal for ${signal.token} in database`, {
              context: "SignalsList"
            })
          }
        }
        
        return NextResponse.json({ signals: appSignals })
      }
    } catch (error) {
      logger.error(
        "Error fetching from Ekin API, falling back to database or mock signals:",
        error instanceof Error ? error : new Error(String(error)),
        {
          context: "SignalsList",
          userId: user._id.toString()
        },
      )
    }
    
    // If no signals from database or Ekin API, create a few mock signals
    // This ensures users always have some signals to interact with
    const mockSignals = []
    
    // Create BUY signal based on user's risk level
    const buySignal = getAnyMockSignal(user.riskLevel as "low" | "medium" | "high")
    if (buySignal) mockSignals.push(buySignal)
    
    // Create SELL signal for a token the user owns (if any)
    if (userHoldings.length > 0) {
      const randomToken = userHoldings[Math.floor(Math.random() * userHoldings.length)]
      const sellSignal = getAnyMockSignal("medium", [randomToken])
      if (sellSignal) mockSignals.push(sellSignal)
    }
    
    // Add another BUY signal with different token
    const tokens = ["ETH", "DOT", "ADA", "SOL", "AVAX"]
    const randomToken = tokens[Math.floor(Math.random() * tokens.length)]
    const anotherBuySignal = getAnyMockSignal(user.riskLevel as "low" | "medium" | "high")
    if (anotherBuySignal) {
      anotherBuySignal.token = randomToken
      anotherBuySignal.id = `mock-buy-${randomToken}-${Date.now()}`
      mockSignals.push(anotherBuySignal)
    }
    
    logger.info(`Generated ${mockSignals.length} mock signals`, {
      context: "SignalsList"
    })
    
    return NextResponse.json({ signals: mockSignals })
  } catch (error) {
    logger.error("Error fetching signals list:", error instanceof Error ? error : new Error(String(error)), {
      context: "SignalsList",
    })
    return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 })
  }
}