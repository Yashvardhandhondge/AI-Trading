// app/api/signals/[id]/[action]/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { tradingProxy } from "@/lib/trading-proxy"
import { logger } from "@/lib/logger"

export async function POST(request: NextRequest, { params }: { params: { id: string; action: string } }) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, action } = params

    if (!id || !action || !["accept", "skip"].includes(action)) {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get signal
    const signal = await models.Signal.findById(id)

    if (!signal) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 })
    }

    // If action is skip, just return success
    if (action === "skip") {
      logger.info(`User skipped signal: ${signal.type} for ${signal.token}`, {
        context: "SignalAction",
        userId: sessionUser.id
      })
      return NextResponse.json({ success: true })
    }

    // If action is accept, check if user has exchange connected
    if (action === "accept") {
      if (!user.exchangeConnected) {
        return NextResponse.json({ error: "Exchange not connected" }, { status: 400 })
      }

      // Check if user has already received a signal for this token in the last 24 hours
      const hasRecentSignal = user.lastSignalTokens.some(
        (item: any) =>
          item.token === signal.token &&
          new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000,
      )

      if (hasRecentSignal) {
        return NextResponse.json(
          {
            error: "You've already received a signal for this token in the last 24 hours",
          },
          { status: 400 },
        )
      }

      // Get portfolio
      const portfolio = await models.Portfolio.findOne({ userId: user._id })

      if (!portfolio) {
        return NextResponse.json({ error: "Portfolio not found" }, { status: 404 })
      }

      // For SELL signals, verify user has the token
      if (signal.type === "SELL") {
        const hasToken = portfolio.holdings.some((h: any) => h.token === signal.token && h.amount > 0)
        if (!hasToken) {
          return NextResponse.json({ error: "You don't own this token" }, { status: 400 })
        }
      }

      // Calculate trade amount and parameters
      let amount = 0
      let tradeParams: { symbol: string; side: "BUY" | "SELL"; quantity: number } = {
        symbol: `${signal.token}USDT`,
        side: "BUY",
        quantity: 0
      }

      if (signal.type === "BUY") {
        // Use 10% of total portfolio
        const tradeValue = portfolio.totalValue * 0.1

        // Calculate amount based on token price
        amount = tradeValue / signal.price

        tradeParams = {
          symbol: `${signal.token}USDT`,
          side: "BUY",
          quantity: amount,
        }
      } else if (signal.type === "SELL") {
        // Find the holding for this token
        const holding = portfolio.holdings.find((h: any) => h.token === signal.token)

        if (!holding || holding.amount <= 0) {
          return NextResponse.json({ error: "No holdings found for this token" }, { status: 400 })
        }

        // Sell the entire holding
        amount = holding.amount

        tradeParams = {
          symbol: `${signal.token}USDT`,
          side: "SELL",
          quantity: amount,
        }
      }

      try {
        // Execute the trade using the trading proxy
        const tradeResult = await tradingProxy.executeTrade(
          sessionUser.id,
          tradeParams.symbol,
          tradeParams.side,
          tradeParams.quantity
        )

        // Create trade record
        const trade = await models.Trade.create({
          userId: user._id,
          signalId: signal._id,
          type: signal.type,
          token: signal.token,
          price: tradeResult.price,
          amount,
          status: "completed",
          createdAt: new Date(),
        })

        // Update or create cycle
        if (signal.type === "BUY") {
          // Create new cycle
          const cycle = await models.Cycle.create({
            userId: user._id,
            token: signal.token,
            entryTrade: trade._id,
            state: "entry",
            entryPrice: tradeResult.price,
            guidance: "Hold until exit signal or 10% profit",
            createdAt: new Date(),
            updatedAt: new Date(),
          })

          // Update trade with cycle ID
          trade.cycleId = cycle._id
          await trade.save()
        } else if (signal.type === "SELL") {
          // Find active cycle for this token
          const cycle = await models.Cycle.findOne({
            userId: user._id,
            token: signal.token,
            state: { $in: ["entry", "hold"] },
          })

          if (cycle) {
            // Update cycle
            cycle.exitTrade = trade._id
            cycle.state = "exit"
            cycle.exitPrice = tradeResult.price
            cycle.pnl = (tradeResult.price - cycle.entryPrice) * amount
            cycle.pnlPercentage = ((tradeResult.price - cycle.entryPrice) / cycle.entryPrice) * 100
            cycle.guidance = "Cycle completed"
            cycle.updatedAt = new Date()
            await cycle.save()

            // Update trade with cycle ID
            trade.cycleId = cycle._id
            await trade.save()
          }
        }

        // Update user's last signal tokens
        user.lastSignalTokens.push({
          token: signal.token,
          timestamp: new Date(),
        })
        await user.save()

        // Update portfolio with fresh data from exchange
        try {
          const portfolioData = await tradingProxy.getPortfolio(sessionUser.id)
          
          portfolio.totalValue = portfolioData.totalValue
          portfolio.freeCapital = portfolioData.freeCapital
          portfolio.allocatedCapital = portfolioData.allocatedCapital
          portfolio.holdings = portfolioData.holdings
          portfolio.updatedAt = new Date()
          await portfolio.save()
        } catch (portfolioError) {
          logger.error(`Error updating portfolio after trade: ${portfolioError instanceof Error ? portfolioError : "Unknown error"}`)
        }

        // Create notification
        await models.Notification.create({
          userId: user._id,
          type: "trade",
          message: `Executed ${signal.type} for ${signal.token} at ${signal.price}`,
          relatedId: trade._id,
          createdAt: new Date(),
        })
        
        logger.info(`Successfully executed ${signal.type} for ${signal.token}`, {
          context: "SignalAction",
          userId: sessionUser.id,
          data: { 
            token: signal.token, 
            price: tradeResult.price, 
            amount 
          }
        })

        return NextResponse.json({ success: true, trade })
      } catch (tradeError) {
        const errorMessage = tradeError instanceof Error ? tradeError : "Unknown error"
        logger.error(`Error executing trade: ${errorMessage}`)
        
        return NextResponse.json(
          {
            error: "Exchange API error. Please check your connection and try again.",
            details: errorMessage
          },
          { status: 503 },
        )
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    logger.error(`Error processing signal action: ${errorMessage}`)

    // Handle specific API errors
    if (error instanceof Error && error.message.includes("API")) {
      return NextResponse.json(
        {
          error: "Exchange API error. Please check your connection and try again.",
        },
        { status: 503 },
      )
    }

    return NextResponse.json({ error: "Failed to process signal action" }, { status: 500 })
  }
}