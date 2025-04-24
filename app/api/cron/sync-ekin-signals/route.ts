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
        // For SELL signals, only notify users who have the token
        if (appSignal.type === "BUY") {
          // Create notifications for eligible users based on risk level
          const eligibleUsers = await models.User.find({
            riskLevel: appSignal.riskLevel,
          })

          for (const user of eligibleUsers) {
            // Check if user has already received a signal for this token in the last 24 hours
            const hasRecentSignal = user.lastSignalTokens.some(
              (item:any) =>
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
            }
          }
        } else if (appSignal.type === "SELL") {
          // For SELL signals, find users who have this token in their portfolio
          const usersWithToken = await models.User.find({ exchangeConnected: true })

          for (const user of usersWithToken) {
            // Check if user has the token in their portfolio
            const portfolio = await models.Portfolio.findOne({ userId: user._id })

            if (portfolio && portfolio.holdings) {
              const hasToken = portfolio.holdings.some((h:any) => h.token === appSignal.token)

              if (hasToken) {
                // Check if user has already received a signal for this token in the last 24 hours
                const hasRecentSignal = user.lastSignalTokens.some(
                  (item:any) =>
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
                }
              }
            }
          }
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
