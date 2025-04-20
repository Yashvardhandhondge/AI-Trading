import { NextResponse } from "next/server"
import { connectToDatabase, models } from "@/lib/db"
import { ExchangeService } from "@/lib/exchange"

// This endpoint will be called by a cron job every minute
export async function POST() {
  try {
    // Connect to database
    await connectToDatabase()

    // Find expired signals that haven't been auto-executed
    const expiredSignals = await models.Signal.find({
      expiresAt: { $lt: new Date() },
      autoExecuted: false,
    })

    if (expiredSignals.length === 0) {
      return NextResponse.json({ message: "No expired signals to process" })
    }

    const results = []

    // Process each expired signal
    for (const signal of expiredSignals) {
      // Mark signal as auto-executed to prevent duplicate processing
      signal.autoExecuted = true
      await signal.save()

      // Find users who should receive this signal based on risk level
      const users = await models.User.find({
        riskLevel: signal.riskLevel,
        exchangeConnected: true,
      })

      // Process for each eligible user
      for (const user of users) {
        try {
          // Check if user has already received a signal for this token in the last 24 hours
          const hasRecentSignal = user.lastSignalTokens.some(
            (item) =>
              item.token === signal.token &&
              new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000,
          )

          if (hasRecentSignal) {
            continue // Skip this user
          }

          // Initialize exchange service
          const exchangeService = new ExchangeService(user.exchange, {
            apiKey: user.apiKey,
            apiSecret: user.apiSecret,
          })

          // Get portfolio
          const portfolio = await models.Portfolio.findOne({ userId: user._id })

          if (!portfolio) {
            continue // Skip if no portfolio
          }

          // Calculate trade amount and parameters
          let amount = 0
          let tradeParams = {}

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
            const holding = portfolio.holdings.find((h) => h.token === signal.token)

            if (!holding || holding.amount <= 0) {
              continue // Skip if no holdings
            }

            // Sell the entire holding
            amount = holding.amount

            tradeParams = {
              symbol: `${signal.token}USDT`,
              side: "SELL",
              quantity: amount,
            }
          }

          // Execute the trade
          const tradeResult = await exchangeService.executeTrade(tradeParams)

          // Create trade record
          const trade = await models.Trade.create({
            userId: user._id,
            signalId: signal._id,
            type: signal.type,
            token: signal.token,
            price: tradeResult.price,
            amount,
            status: "completed",
            autoExecuted: true,
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

          // Update portfolio
          await exchangeService.getPortfolio().then(async (portfolioData) => {
            portfolio.totalValue = portfolioData.totalValue
            portfolio.freeCapital = portfolioData.freeCapital
            portfolio.allocatedCapital = portfolioData.allocatedCapital
            portfolio.holdings = portfolioData.holdings
            portfolio.updatedAt = new Date()
            await portfolio.save()
          })

          // Create notification
          await models.Notification.create({
            userId: user._id,
            type: "trade",
            message: `Auto-executed ${signal.type} for ${signal.token} at ${signal.price}`,
            relatedId: trade._id,
            createdAt: new Date(),
          })

          results.push({
            userId: user.telegramId,
            signal: signal.token,
            action: signal.type,
            success: true,
          })
        } catch (userError) {
          console.error(`Error processing auto-execution for user ${user.telegramId}:`, userError)
          results.push({
            userId: user.telegramId,
            signal: signal.token,
            action: signal.type,
            success: false,
            error: userError.message,
          })
        }
      }
    }

    return NextResponse.json({ success: true, processed: expiredSignals.length, results })
  } catch (error) {
    console.error("Error in auto-execution:", error)
    return NextResponse.json({ error: "Auto-execution failed" }, { status: 500 })
  }
}
