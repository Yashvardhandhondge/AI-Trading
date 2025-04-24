import { NextResponse } from "next/server"
import { connectToDatabase, models } from "@/lib/db"
import { EkinApiService } from "@/lib/ekin-api"
import { logger } from "@/lib/logger"

// This endpoint will be called by a cron job every hour
export async function POST() {
  try {
    logger.info("Starting Ekin signals sync", { context: "CronJob" })

    // Connect to database
    await connectToDatabase()

    // Fetch signals from Ekin API
    const ekinSignals = await EkinApiService.getSignals()

    logger.info(`Fetched ${ekinSignals.length} signals from Ekin API`, { context: "CronJob" })

    // Convert to app signal format and store in database
    const results = []

    for (const ekinSignal of ekinSignals) {
      const appSignal = EkinApiService.convertToAppSignal(ekinSignal)

      // Check if signal already exists
      const existingSignal = await models.Signal.findOne({
        token: appSignal.token,
        price: appSignal.price,
        expiresAt: { $gt: new Date() },
      })

      if (!existingSignal) {
        // Create new signal
        const signal = await models.Signal.create(appSignal)
        results.push({
          token: signal.token,
          type: signal.type,
          created: true,
          id: signal._id.toString(),
        })

        // For BUY signals, notify users based on risk level
        if (appSignal.type === "BUY") {
          // Create notifications for eligible users based on risk level
          const eligibleUsers = await models.User.find({
            riskLevel: appSignal.riskLevel,
          })

          logger.info(`Found ${eligibleUsers.length} users matching risk level ${appSignal.riskLevel} for BUY signal`, {
            context: "CronJob",
            signalType: "BUY",
            token: appSignal.token
          })

          for (const user of eligibleUsers) {
            // Check if user has already received a signal for this token in the last 24 hours
            const hasRecentSignal = user.lastSignalTokens.some(
              (item: any) =>
                item.token === appSignal.token &&
                new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000,
            )

            if (!hasRecentSignal) {
              await models.Notification.create({
                userId: user._id,
                type: "signal",
                message: `New ${appSignal.type} signal for ${appSignal.token} at ${appSignal.price}`,
                relatedId: signal._id,
                createdAt: new Date(),
              })

              logger.info(`Created BUY notification for user ${user._id} for token ${appSignal.token}`, {
                context: "CronJob"
              })
            } else {
              logger.info(`Skipped BUY notification for user ${user._id} - already received signal for ${appSignal.token} in last 24h`, {
                context: "CronJob"
              })
            }
          }
        } 
        // For SELL signals, only notify users who have this token in their portfolio
        else if (appSignal.type === "SELL") {
          // Only find users who have exchange connected - they're the only ones who can own tokens
          const usersWithConnectedExchange = await models.User.find({ exchangeConnected: true })
          
          logger.info(`Processing SELL signal for ${appSignal.token} - checking ${usersWithConnectedExchange.length} users with connected exchanges`, {
            context: "CronJob",
            signalType: "SELL",
            token: appSignal.token
          })

          let notifiedUsers = 0;
          for (const user of usersWithConnectedExchange) {
            // Check if user has the token in their portfolio
            const portfolio = await models.Portfolio.findOne({ userId: user._id })

            if (portfolio && portfolio.holdings) {
              // Only consider non-zero holdings
              const hasToken = portfolio.holdings.some((h: any) => 
                h.token === appSignal.token && h.amount > 0
              )

              if (hasToken) {
                // Check if user has already received a signal for this token in the last 24 hours
                const hasRecentSignal = user.lastSignalTokens.some(
                  (item: any) =>
                    item.token === appSignal.token &&
                    new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000,
                )

                if (!hasRecentSignal) {
                  await models.Notification.create({
                    userId: user._id,
                    type: "signal",
                    message: `New ${appSignal.type} signal for ${appSignal.token} at ${appSignal.price}`,
                    relatedId: signal._id,
                    createdAt: new Date(),
                  })
                  
                  notifiedUsers++;
                  logger.info(`Created SELL notification for user ${user._id} who owns ${appSignal.token}`, {
                    context: "CronJob"
                  })
                } else {
                  logger.info(`Skipped SELL notification for user ${user._id} - already received signal for ${appSignal.token} in last 24h`, {
                    context: "CronJob"
                  })
                }
              } else {
                logger.info(`User ${user._id} doesn't own ${appSignal.token}, skipping SELL notification`, {
                  context: "CronJob"
                })
              }
            } else {
              logger.info(`User ${user._id} has no portfolio or holdings, skipping SELL notification`, {
                context: "CronJob"
              })
            }
          }
          
          logger.info(`Notified ${notifiedUsers} users about SELL signal for ${appSignal.token}`, {
            context: "CronJob",
            signalType: "SELL",
            token: appSignal.token
          })
        }
      } else {
        results.push({
          token: appSignal.token,
          type: appSignal.type,
          created: false,
          reason: "Signal already exists",
        })
      }
    }

    logger.info(`Sync completed. Created ${results.filter((r) => r.created).length} new signals`, {
      context: "CronJob",
    })

    return NextResponse.json({
      success: true,
      processed: ekinSignals.length,
      created: results.filter((r) => r.created).length,
      results,
    })
  } catch (error) {
    logger.error("Error in Ekin signals sync:", error instanceof Error ? error : new Error(String(error)), {
      context: "CronJob",
    })
    return NextResponse.json({ error: "Sync failed" }, { status: 500 })
  }
}