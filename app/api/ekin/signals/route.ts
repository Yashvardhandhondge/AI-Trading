import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { EkinApiService } from "@/lib/ekin-api"
import { logger } from "@/lib/logger"
import { getAnyMockSignal } from "@/lib/mock-signals"

// Define types for signals
interface Signal {
  id: string
  type: "BUY" | "SELL"
  token: string
  price: number
  riskLevel: "low" | "medium" | "high"
  createdAt: string | Date
  expiresAt: string | Date
  autoExecuted: boolean
  link?: string
  positives?: string[]
  warnings?: string[]
  warning_count?: number
}

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
      } else {
        logger.info("User has no holdings or portfolio not found", { 
          context: "SignalFiltering", 
          userId: user._id.toString() 
        })
      }
    } else {
      logger.info("User has not connected exchange, will show only BUY signals", { 
        context: "SignalFiltering", 
        userId: user._id.toString() 
      })
    }

    let signalFound = false;
    
    // Try to get signals from Ekin API first
    try {
      // Fetch fresh signals from Ekin API
      const ekinSignals = await EkinApiService.getSignals()
      logger.info(`Fetched ${ekinSignals.length} signals from Ekin API`, { 
        context: "SignalFiltering"
      })

      // Filter signals:
      // - For BUY signals: show based on risk level
      // - For SELL signals: only show if user has exchange connected AND has the token in portfolio
      const filteredSignals = ekinSignals.filter((signal) => {
        // For BUY signals, filter by risk level - always show regardless of exchange connection
        if (signal.type === "BUY") {
          const signalRiskLevel = EkinApiService.getRiskLevel(signal.risk)
          return signalRiskLevel === user.riskLevel
        }
        // For SELL signals, only show if user has exchange connected AND owns the token
        else if (signal.type === "SELL") {
          if (!user.exchangeConnected) return false

          const hasToken = userHoldings.includes(signal.symbol)
          if (hasToken) {
            logger.info(`SELL signal for ${signal.symbol} matches user holdings`, {
              context: "SignalFiltering",
              userId: user._id.toString(),
            })
            return true
          } else {
            logger.info(`SELL signal for ${signal.symbol} filtered out - user doesn't own this token`, {
              context: "SignalFiltering",
              userId: user._id.toString(),
            })
            return false
          }
        }
        return false
      })

      logger.info(`Filtered to ${filteredSignals.length} signals matching user criteria`, { 
        context: "SignalFiltering",
        userId: user._id.toString()
      })

      // If no signals match, get the closest BUY signal
      if (filteredSignals.length === 0) {
        const buySignals = ekinSignals.filter(s => s.type === "BUY")

        if (buySignals.length > 0) {
          const riskMapping: Record<string, number> = { low: 20, medium: 50, high: 80 }
          const userRiskLevel = (user.riskLevel as string) || "medium"
          const targetRisk = riskMapping[userRiskLevel] || 50

          const closestSignal = buySignals.reduce((prev, curr) =>
            Math.abs(curr.risk - targetRisk) < Math.abs(prev.risk - targetRisk) ? curr : prev,
          )

          logger.info(`No exact matches, selected closest BUY signal for ${closestSignal.symbol}`, {
            context: "SignalFiltering",
            userId: user._id.toString()
          })

          // Convert to app signal format
          const appSignal = EkinApiService.convertToAppSignal(closestSignal)

          // Check if this signal already exists in the database
          let signal = await models.Signal.findOne({
            token: appSignal.token,
            price: appSignal.price,
            expiresAt: { $gt: new Date() },
          })

          // If not, create it
          if (!signal) {
            signal = await models.Signal.create(appSignal)
            logger.info(`Created new signal in database for ${appSignal.token}`, {
              context: "SignalFiltering",
              userId: user._id.toString()
            })
          }

          signalFound = true;
          return NextResponse.json({ signal })
        }
      } else if (filteredSignals.length > 0) {
        // Get the best signal
        const bestSignal = filteredSignals[0]
        logger.info(`Selected best signal for ${bestSignal.symbol} (${bestSignal.type})`, {
          context: "SignalFiltering",
          userId: user._id.toString()
        })

        // Convert to app signal format
        const appSignal = EkinApiService.convertToAppSignal(bestSignal)

        // Check if this signal already exists in the database
        let signal = await models.Signal.findOne({
          token: appSignal.token,
          price: appSignal.price,
          expiresAt: { $gt: new Date() },
        })

        // If not, create it
        if (!signal) {
          signal = await models.Signal.create(appSignal)
          logger.info(`Created new signal in database for ${appSignal.token}`, {
            context: "SignalFiltering",
            userId: user._id.toString()
          })
        }

        signalFound = true;
        return NextResponse.json({ signal })
      }
    } catch (error) {
      logger.error(
        "Error fetching from Ekin API, falling back to database or mock signals:",
        error instanceof Error ? error : new Error(String(error)),
        {
          context: "SignalFiltering",
          userId: user._id.toString()
        },
      )
      // Fall back to database if Ekin API fails
    }

    // If no signal found from Ekin API, try to get from database
    if (!signalFound) {
      // Build query for finding relevant signals
      const query: Record<string, any> = {
        expiresAt: { $gt: new Date() },
      }

      if (user.exchangeConnected) {
        const portfolio = await models.Portfolio.findOne({ userId: user._id })
        if (portfolio && portfolio.holdings && portfolio.holdings.length > 0) {
          const userTokens = portfolio.holdings
            .filter((h: any) => h.amount > 0)  // Only include tokens with positive amounts
            .map((h: any) => h.token)

          logger.info(`Filtering database signals based on user holdings: ${userTokens.join(', ')}`, {
            context: "SignalFiltering",
            userId: user._id.toString()
          })

          // Either match risk level for BUY signals or match tokens for SELL signals
          query.$or = [
            { type: "BUY", riskLevel: user.riskLevel },
            { type: "SELL", token: { $in: userTokens } },
          ]
        } else {
          // If no holdings, only show BUY signals
          query.type = "BUY"
          query.riskLevel = user.riskLevel
          
          logger.info(`No user holdings found, only showing BUY signals with risk level ${user.riskLevel}`, {
            context: "SignalFiltering",
            userId: user._id.toString()
          })
        }
      } else {
        // If exchange not connected, only show BUY signals
        query.type = "BUY"
        query.riskLevel = user.riskLevel
        
        logger.info(`Exchange not connected, only showing BUY signals with risk level ${user.riskLevel}`, {
          context: "SignalFiltering",
          userId: user._id.toString()
        })
      }

      const signal = await models.Signal.findOne(query).sort({ createdAt: -1 })
      
      if (signal) {
        logger.info(`Found signal in database: ${signal.type} signal for ${signal.token}`, {
          context: "SignalFiltering",
          userId: user._id.toString()
        })
        return NextResponse.json({ signal })
      } else {
        logger.info("No active signals found in database, using mock signals as fallback", {
          context: "SignalFiltering",
          userId: user._id.toString()
        })
        
        // FALLBACK TO MOCK SIGNALS when no real signals are available
        // This ensures users always see a signal even when APIs are down
        const mockSignal = getAnyMockSignal(
          user.riskLevel as "low" | "medium" | "high", 
          user.exchangeConnected ? userHoldings : undefined
        )
        
        if (mockSignal) {
          logger.info(`Returning mock ${mockSignal.type} signal for ${mockSignal.token}`, {
            context: "SignalFiltering",
            userId: user._id.toString()
          })
          
          // Store the mock signal in the database so it behaves like a real signal
          // and can be referenced by ID in later actions
          let signal = await models.Signal.findOne({
            token: mockSignal.token,
            type: mockSignal.type,
            expiresAt: { $gt: new Date() },
          })
          
          if (!signal) {
            // Ensure all required fields are present for the database model
            const dbMockSignal: Signal = {
              ...mockSignal,
              autoExecuted: false,
              createdAt: new Date(),
              expiresAt: new Date(mockSignal.expiresAt)
            };
            
            signal = await models.Signal.create(dbMockSignal)
          }
          
          return NextResponse.json({ signal })
        }
      }
    }

    // If we got here, no signals were found at all
    return NextResponse.json({ signal: null })
  } catch (error) {
    logger.error("Error fetching active signal:", error instanceof Error ? error : new Error(String(error)), {
      context: "SignalFiltering",
    })
    return NextResponse.json({ error: "Failed to fetch active signal" }, { status: 500 })
  }
}