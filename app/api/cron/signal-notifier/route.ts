/**
 * Signal Notifier Cron Job
 * 
 * This endpoint should be called by a cron job every 5 minutes to:
 * 1. Check for new signals that haven't been notified
 * 2. Send notifications to eligible users
 */

import { NextResponse } from "next/server"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"

// How recently a signal should have been created to be notified (in minutes)
const RECENT_SIGNAL_THRESHOLD_MINUTES = 15

export async function POST() {
  try {
    logger.info("Starting signal notifier job", { context: "CronJob" })

    // Connect to database
    await connectToDatabase()

    // Find recent signals that are still active
    const recentDate = new Date()
    recentDate.setMinutes(recentDate.getMinutes() - RECENT_SIGNAL_THRESHOLD_MINUTES)
    
    const activeSignals = await models.Signal.find({
      // Find signals created within threshold AND still active (not expired)
      createdAt: { $gte: recentDate },
      expiresAt: { $gt: new Date() }
    }).sort({ createdAt: -1 })

    logger.info(`Found ${activeSignals.length} recent active signals to check for notifications`, {
      context: "SignalNotifier"
    })

    if (activeSignals.length === 0) {
      return NextResponse.json({ message: "No recent active signals found" })
    }

    const results = []
    let totalNotified = 0

    // Process each signal
    for (const signal of activeSignals) {
      // Get users eligible for this signal
      const eligibleUsers = await findEligibleUsers(signal)
      
      logger.info(
        `Found ${eligibleUsers.length} eligible users for ${signal.type} signal on ${signal.token}`,
        { context: "SignalNotifier", data: { signal: `${signal.type}_${signal.token}` } }
      )

      // Send notifications to eligible users who haven't been notified yet
      const signalResult = {
        signal: `${signal.type}_${signal.token}`,
        usersNotified: 0
      }

      for (const user of eligibleUsers) {
        // Check if the user has already received a notification for this signal
        const existingNotification = await models.Notification.findOne({
          userId: user._id,
          relatedId: signal._id,
          type: "signal"
        })

        if (existingNotification) {
          logger.debug(`User ${user._id} already notified about signal ${signal._id}`, { 
            context: "SignalNotifier" 
          })
          continue
        }

        // Create notification message
        const message = `New ${signal.type} signal for ${signal.token} at ${signal.price}`
  

        // Update user's last seen tokens for this signal type if it's a BUY
        if (signal.type === "BUY") {
          // Add to last signal tokens only if not already there
          const hasRecentSignal = user.lastSignalTokens.some(
            (item: any) =>
              item.token === signal.token &&
              new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000
          )

          if (!hasRecentSignal) {
            user.lastSignalTokens.push({
              token: signal.token,
              timestamp: new Date()
            })
            await user.save()
          }
        }

        signalResult.usersNotified++
        totalNotified++
      }

      results.push(signalResult)
    }

    logger.info(`Signal notifier job completed. Notified ${totalNotified} users about ${results.length} signals`, {
      context: "SignalNotifier"
    })

    return NextResponse.json({ 
      success: true, 
      totalSignals: activeSignals.length,
      totalUsersNotified: totalNotified,
      results 
    })
  } catch (error) {
    logger.error(`Error in signal notifier: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Signal notifier failed" }, { status: 500 })
  }
}

/**
 * Find users eligible to receive a notification for this signal
 */
async function findEligibleUsers(signal: any): Promise<any[]> {
  try {
    // For BUY signals: filter by risk level
    if (signal.type === "BUY") {
      // Find users with matching risk level who have exchange connected (for best experience)
      return await models.User.find({
        riskLevel: signal.riskLevel,
        // Don't require exchange connected, but it's better UX if they have it
        //$or: [{ exchangeConnected: true }, { exchangeConnected: { $exists: false } }]
      })
    } 
    // For SELL signals: only notify users who own this token
    else if (signal.type === "SELL") {
      // First, find users with connected exchanges
      const usersWithExchange = await models.User.find({ 
        exchangeConnected: true 
      })
      
      const eligibleUsers = []
      
      // Then check each user's portfolio to see if they own the token
      for (const user of usersWithExchange) {
        const portfolio = await models.Portfolio.findOne({ userId: user._id })
        
        if (portfolio && portfolio.holdings) {
          const hasToken = portfolio.holdings.some((h: any) => 
            h.token === signal.token && h.amount > 0
          )
          
          if (hasToken) {
            eligibleUsers.push(user)
          }
        }
      }
      
      return eligibleUsers
    }
    
    // Default case
    return []
  } catch (error) {
    logger.error(`Error finding eligible users: ${error instanceof Error ? error.message : "Unknown error"}`)
    return []
  }
}