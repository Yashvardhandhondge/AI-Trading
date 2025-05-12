// app/api/signals/[id]/[action]/route.ts

import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { tradingProxy } from "@/lib/trading-proxy"
import { logger } from "@/lib/logger"
import mongoose from "mongoose"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; action: string }> }
) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id, action } = await params

    // Validate ID and action
    if (!id || !action || !["accept", "accept-partial", "skip"].includes(action)) {
      logger.error(`Invalid parameters for signal action: ID=${id}, action=${action}`)
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 })
    }

    // Log the incoming request
    logger.info(`Processing signal action: ${action} for ID=${id}`, {
      context: "SignalAction", 
      userId: sessionUser.id
    })

    const requestBody = await request.json().catch(() => ({}))
    const percentage = requestBody.percentage

    if (action === "accept-partial" && (!percentage || percentage <= 0 || percentage >= 100)) {
      return NextResponse.json({ error: "Invalid percentage for partial sell" }, { status: 400 })
    }

    await connectToDatabase()

    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if the ID is a valid MongoDB ObjectId before querying
    // This is a critical fix for the error that was occurring
    let signal
    
    if (mongoose.isValidObjectId(id)) {
      // If it's a valid ObjectId, query directly
      signal = await models.Signal.findById(id)
    } else {
      // If not, it might be a temporary ID or invalid - log and handle accordingly
      logger.warn(`Non-MongoDB ObjectId format received: ${id}`, {
        context: "SignalAction",
        userId: sessionUser.id
      })
      
      // For temporary IDs with format like temp_BUY_BTC_50000_timestamp
      if (id.startsWith('temp_')) {
        // Extract parameters from the temporary ID
        const parts = id.split('_')
        if (parts.length >= 4) {
          const type = parts[1]
          const token = parts[2]
          
          // Try to find a matching signal
          signal = await models.Signal.findOne({
            type,
            token,
            expiresAt: { $gt: new Date() } // Only active signals
          }).sort({ createdAt: -1 }) // Get the most recent one
          
          if (signal) {
            logger.info(`Found matching signal for temporary ID: ${id} → ${signal._id}`, {
              context: "SignalAction",
              userId: sessionUser.id
            })
          }
        }
      }
    }

    if (!signal) {
      // If we still can't find a valid signal, try to create one
      if (action !== "skip") {
        logger.info(`Signal not found, attempting to create from temp ID: ${id}`, {
          context: "SignalAction",
          userId: sessionUser.id
        })
        
        try {
          // Parse the temp ID format (if it follows the expected pattern)
          if (id.startsWith('temp_')) {
            const parts = id.split('_')
            if (parts.length >= 4) {
              const type = parts[1] as "BUY" | "SELL"
              const token = parts[2]
              const price = parseFloat(parts[3])
              
              if (type && token && !isNaN(price)) {
                // Determine risk level based on user's preference
                const riskLevel = user.riskLevel || "medium"
                
                // Calculate expiration time (10 minutes from now)
                const expiresAt = new Date()
                expiresAt.setMinutes(expiresAt.getMinutes() + 10)
                
                // Create a new signal
                signal = await models.Signal.create({
                  type,
                  token,
                  price,
                  riskLevel,
                  createdAt: new Date(),
                  expiresAt,
                  autoExecuted: false
                })
                
                logger.info(`Created new signal from temp ID: ${id} → ${signal._id}`, {
                  context: "SignalAction",
                  userId: sessionUser.id
                })
              }
            }
          }
        } catch (createError) {
          logger.error(`Error creating signal from temp ID: ${createError instanceof Error ? createError.message : "Unknown error"}`)
        }
      }
      
      // If we still don't have a valid signal, return an error
      if (!signal) {
        logger.error(`Signal not found with ID: ${id}`)
        return NextResponse.json({ error: "Signal not found" }, { status: 404 })
      }
    }

    if (action === "skip") {
      logger.info(`User skipped signal: ${signal.type} for ${signal.token}`, {
        context: "SignalAction",
        userId: sessionUser.id,
      })
      return NextResponse.json({ success: true })
    }

    if (action === "accept" || action === "accept-partial") {
      if (!user.exchangeConnected) {
        return NextResponse.json({ error: "Exchange not connected" }, { status: 400 })
      }

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

      const portfolio = await models.Portfolio.findOne({ userId: user._id })

      if (!portfolio) {
        return NextResponse.json({ error: "Portfolio not found" }, { status: 404 })
      }

      let amount = 0
      let tradeParams: { symbol: string; side: "BUY" | "SELL"; quantity: number } = {
        symbol: `${signal.token}USDT`,
        side: "BUY",
        quantity: 0,
      }

      if (signal.type === "BUY") {
        const tradeValue = (portfolio.totalValue ?? 0) * 0.1
        amount = tradeValue / signal.price

        tradeParams = {
          symbol: `${signal.token}USDT`,
          side: "BUY",
          quantity: amount,
        }
      } else if (signal.type === "SELL") {
        const holding = (portfolio.holdings ?? []).find((h: any) => h.token === signal.token)

        if (!holding || !holding.amount || holding.amount <= 0) {
          return NextResponse.json({ error: "No holdings found for this token" }, { status: 400 })
        }

        if (action === "accept-partial" && percentage) {
          amount = holding.amount * (percentage / 100)
          amount = Math.min(amount, holding.amount)

          logger.info(`Executing partial sell (${percentage}%) for ${signal.token}`, {
            context: "SignalAction",
            userId: sessionUser.id,
            data: {
              totalAmount: holding.amount,
              sellAmount: amount,
              percentage,
            },
          })
        } else {
          amount = holding.amount
        }

        tradeParams = {
          symbol: `${signal.token}USDT`,
          side: "SELL",
          quantity: amount,
        }
      }

      try {
        logger.info(`Executing trade via proxy: ${tradeParams.side} ${tradeParams.symbol} ${tradeParams.quantity}`, {
          context: "SignalAction",
          userId: sessionUser.id
        })
        
        const tradeResult = await tradingProxy.executeTrade(
          sessionUser.id,
          tradeParams.symbol,
          tradeParams.side,
          tradeParams.quantity,
        )

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

        if (signal.type === "BUY") {
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

          trade.cycleId = cycle._id
          await trade.save()
        } else if (signal.type === "SELL") {
          const cycle = await models.Cycle.findOne({
            userId: user._id,
            token: signal.token,
            state: { $in: ["entry", "hold"] },
          })

          if (cycle) {
            if (action === "accept-partial") {
              cycle.updatedAt = new Date()
              cycle.guidance = `Partially sold ${percentage}% of position at ${tradeResult.price}`
              await cycle.save()
            } else {
              cycle.exitTrade = trade._id
              cycle.state = "exit"
              cycle.exitPrice = tradeResult.price
              cycle.pnl = (tradeResult.price - cycle.entryPrice) * amount
              cycle.pnlPercentage = ((tradeResult.price - cycle.entryPrice) / cycle.entryPrice) * 100
              cycle.guidance = "Cycle completed"
              cycle.updatedAt = new Date()
              await cycle.save()
            }

            trade.cycleId = cycle._id
            await trade.save()
          }
        }

        user.lastSignalTokens.push({
          token: signal.token,
          timestamp: new Date(),
        })
        await user.save()

        try {
          const portfolioData = await tradingProxy.getPortfolio(sessionUser.id)

          portfolio.totalValue = portfolioData.totalValue
          portfolio.freeCapital = portfolioData.freeCapital
          portfolio.allocatedCapital = portfolioData.allocatedCapital
          portfolio.holdings = portfolioData.holdings
          portfolio.updatedAt = new Date()
          await portfolio.save()
        } catch (portfolioError) {
          logger.error(`Error updating portfolio after trade: ${portfolioError instanceof Error ? portfolioError.message : "Unknown error"}`)
        }

        await models.Notification.create({
          userId: user._id,
          type: "trade",
          message:
            action === "accept-partial"
              ? `Executed ${signal.type} for ${percentage}% of ${signal.token} at ${signal.price}`
              : `Executed ${signal.type} for ${signal.token} at ${signal.price}`,
          relatedId: trade._id,
          createdAt: new Date(),
        })

        const actionType = action === "accept-partial" ? "partial sell" : signal.type
        logger.info(`Successfully executed ${actionType} for ${signal.token}`, {
          context: "SignalAction",
          userId: sessionUser.id,
          data: {
            tradeId: trade._id,
            amount,
            partial: action === "accept-partial",
            percentage: action === "accept-partial" ? percentage : undefined,
          },
        })

        return NextResponse.json({ success: true, trade })
      } catch (tradeError) {
        logger.error(`Error executing trade: ${tradeError instanceof Error ? tradeError.message : "Unknown error"}`)

        return NextResponse.json(
          {
            error: "Exchange API error. Please check your connection and try again.",
            details: tradeError instanceof Error ? tradeError.message : "Unknown error",
          },
          { status: 503 },
        )
      }
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    logger.error(`Error processing signal action: ${errorMessage}`)

    if (error instanceof Error && error.message.includes("API")) {
      return NextResponse.json(
        { error: "Exchange API error. Please check your connection and try again." },
        { status: 503 },
      )
    }

    return NextResponse.json({ error: "Failed to process signal action" }, { status: 500 })
  }
}