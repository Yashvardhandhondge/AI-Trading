// app/api/signals/auto-execute/route.ts
import { NextResponse } from "next/server"
import { connectToDatabase, models } from "@/lib/db"
import { tradingProxy } from "@/lib/trading-proxy"
import { logger } from "@/lib/logger"

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

      logger.info(`Auto-executing signal ${signal.type} for ${signal.token} for ${users.length} users`, {
        context: "AutoExecute"
      })

      // Process for each eligible user
      for (const user of users) {
        try {
          // Check if user has already received a signal for this token in the last 24 hours
          const hasRecentSignal = user.lastSignalTokens.some(
            (item: any) =>
              item.token === signal.token &&
              new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000,
          )

          if (hasRecentSignal) {
            logger.info(`Skipping user ${user.telegramId} - recent signal for ${signal.token}`, {
              context: "AutoExecute"
            })
            continue // Skip this user
          }

          // Get portfolio
          const portfolio = await models.Portfolio.findOne({ userId: user._id })

          if (!portfolio) {
            logger.info(`Skipping user ${user.telegramId} - no portfolio found`, {
              context: "AutoExecute"
            })
            continue // Skip if no portfolio
          }

          // Calculate trade amount and parameters
          let amount = 0
          let symbol = ""

          if (signal.type === "BUY") {
            // Use 10% of total portfolio
            const tradeValue = portfolio.totalValue * 0.1

            // Calculate amount based on token price
            amount = tradeValue / signal.price
            symbol = `${signal.token}USDT`
            
            logger.info(`Auto-executing BUY for ${symbol}, amount: ${amount}, value: ${tradeValue}`, {
              context: "AutoExecute",
              userId: user.telegramId
            })
          } else if (signal.type === "SELL") {
            // Find the holding for this token
            const holding = portfolio.holdings.find((h: any) => h.token === signal.token)

            if (!holding || holding.amount <= 0) {
              logger.info(`Skipping user ${user.telegramId} - no holdings for ${signal.token}`, {
                context: "AutoExecute"
              })
              continue // Skip if no holdings
            }

            // Sell the entire holding
            amount = holding.amount
            symbol = `${signal.token}USDT`
            
            logger.info(`Auto-executing SELL for ${symbol}, amount: ${amount}`, {
              context: "AutoExecute",
              userId: user.telegramId
            })
          }

          try {
            // Execute the trade using the trading proxy
            const tradeResult = await tradingProxy.executeTrade(
              user.telegramId,
              symbol,
              signal.type,
              amount
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
            try {
              const portfolioData = await tradingProxy.getPortfolio(user.telegramId)
              
              portfolio.totalValue = portfolioData.totalValue
              portfolio.freeCapital = portfolioData.freeCapital
              portfolio.allocatedCapital = portfolioData.allocatedCapital
              portfolio.holdings = portfolioData.holdings
              portfolio.updatedAt = new Date()
              await portfolio.save()
            } catch (portfolioError) {
              logger.error(`Error updating portfolio after auto-trade: ${portfolioError instanceof Error ? portfolioError : "Unknown error"}`)
            }

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
            
            logger.info(`Auto-execution successful for user ${user.telegramId}, ${signal.type} ${signal.token}`, {
              context: "AutoExecute"
            })
          } catch (tradeError) {
            const errorMessage = tradeError instanceof Error ? tradeError : "Unknown error"
            logger.error(`Error executing auto-trade: ${errorMessage}`)
            
            results.push({
              userId: user.telegramId,
              signal: signal.token,
              action: signal.type,
              success: false,
              error: errorMessage,
            })
          }
        } catch (userError) {
          const errorMessage = userError instanceof Error ? userError : "Unknown error"
          logger.error(`Error processing auto-execution for user ${user.telegramId}: ${errorMessage}`)
          
          results.push({
            userId: user.telegramId,
            signal: signal.token,
            action: signal.type,
            success: false,
            error: errorMessage,
          })
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      processed: expiredSignals.length, 
      results 
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    logger.error(`Error in auto-execution: ${errorMessage}`)
    return NextResponse.json({ error: "Auto-execution failed" }, { status: 500 })
  }
}