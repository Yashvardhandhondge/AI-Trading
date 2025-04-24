import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { EkinApiService, type EkinSignal } from "@/lib/ekin-api"
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

    // Check if we should use Ekin API
    const useEkinApi = true // You can make this configurable

    if (useEkinApi) {
      try {
        // Fetch fresh signals from Ekin API
        const ekinSignals = await EkinApiService.getSignals()

        // Get user portfolio to check holdings (if exchange is connected)
        let userHoldings: string[] = []
        if (user.exchangeConnected) {
          const portfolio = await models.Portfolio.findOne({ userId: user._id })
          if (portfolio && portfolio.holdings) {
            interface Holding {
              token: string;
              // Add other potential properties if needed
            }

                        userHoldings = portfolio.holdings.map((h: Holding) => h.token)
          }
        }

        // Filter signals:
        // - For BUY signals: show based on risk level
        // - For SELL signals: only show if user has the token in portfolio
        const filteredSignals = ekinSignals.filter((signal) => {
          // For BUY signals, filter by risk level
          if (signal.type === "BUY" || EkinApiService.getRiskLevel(signal.risk) === "low") {
            const signalRiskLevel = EkinApiService.getRiskLevel(signal.risk)
            return signalRiskLevel === user.riskLevel
          }
          // For SELL signals, only show if user has the token
          else {
            return userHoldings.includes(signal.symbol)
          }
        })

        // If no signals match, get the closest one (only for BUY signals)
        if (filteredSignals.length === 0) {
          const buySignals = ekinSignals.filter(
            (s) => s.type === "BUY" || EkinApiService.getRiskLevel(s.risk) === "low",
          )

          if (buySignals.length > 0) {
            const riskMapping = { low: 20, medium: 50, high: 80 }
            const targetRisk = riskMapping[(user.riskLevel || "medium") as 'low' | 'medium' | 'high']

            const closestSignal = buySignals.reduce((prev, curr) =>
              Math.abs(curr.risk - targetRisk) < Math.abs(prev.risk - targetRisk) ? curr : prev,
            )

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
            }

            return NextResponse.json({ signal })
          }
        } else if (filteredSignals.length > 0) {
          // Get the best signal
          const bestSignal = filteredSignals[0]

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
          }

          return NextResponse.json({ signal })
        }
      } catch (error) {
        logger.error(
          "Error fetching from Ekin API, falling back to database:",
          error instanceof Error ? error : new Error(String(error)),
          {
            context: "ActiveSignals",
          },
        )
        // Fall back to database if Ekin API fails
      }
    }

    // Get active signal from database (fallback)
    // For BUY signals, filter by risk level
    // For SELL signals, only show if user has the token
    const query: any = {
      expiresAt: { $gt: new Date() },
    }

    if (user.exchangeConnected) {
      const portfolio = await models.Portfolio.findOne({ userId: user._id })
      if (portfolio && portfolio.holdings && portfolio.holdings.length > 0) {
        const userTokens = portfolio.holdings.map((h:any) => h.token)

        // Either match risk level for BUY signals or match tokens for SELL signals
        query.$or = [
          { type: "BUY", riskLevel: user.riskLevel },
          { type: "SELL", token: { $in: userTokens } },
        ]
      } else {
        // If no holdings, only show BUY signals
        query.type = "BUY"
        query.riskLevel = user.riskLevel
      }
    } else {
      // If exchange not connected, only show BUY signals
      query.type = "BUY"
      query.riskLevel = user.riskLevel
    }

    const signal = await models.Signal.findOne(query).sort({ createdAt: -1 })

    return NextResponse.json({ signal })
  } catch (error) {
    logger.error("Error fetching active signal:", error instanceof Error ? error : new Error(String(error)), {
      context: "ActiveSignals",
    })
    return NextResponse.json({ error: "Failed to fetch active signal" }, { status: 500 })
  }
}
