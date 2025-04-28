// app/api/cron/sync-telegram-signals/route.ts
import { NextResponse } from "next/server"
import { connectToDatabase, models } from "@/lib/db"
import { EkinApiService } from "@/lib/ekin-api"
import { logger } from "@/lib/logger"

// This endpoint will be called by a cron job to sync signals from Telegram
// The cron job should be set up to run every 5 minutes
export async function POST(request: Request) {
  try {
    // Validate authorization header - simple token-based auth for cron
    const authHeader = request.headers.get("Authorization")
    const expectedToken = process.env.CRON_SECRET || "cycletrader-cron-secret"
    
    if (authHeader !== `Bearer ${expectedToken}` && process.env.NODE_ENV === "production") {
      logger.warn("Unauthorized cron job attempt", { context: "SignalSync" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    logger.info("Starting Telegram signal sync job", { context: "SignalSync" })
    
    // Connect to database
    await connectToDatabase()
    
    // 1. Fetch signals from Ekin API (which gets them from Telegram)
    const ekinSignals = await EkinApiService.getSignals()
    
    logger.info(`Fetched ${ekinSignals.length} signals from Ekin API`, { context: "SignalSync" })
    
    if (!ekinSignals || ekinSignals.length === 0) {
      return NextResponse.json({ message: "No signals found from Ekin API" })
    }
    
    // 2. Process each signal from Ekin and store it in our database
    const results = []
    let newSignalsCount = 0
    
    for (const ekinSignal of ekinSignals) {
      try {
        // Convert Ekin signal to our app format
        const appSignal = EkinApiService.convertToAppSignal(ekinSignal)
        
        // Check if we already have this signal in the database
        const existingSignal = await models.Signal.findOne({
          token: appSignal.token,
          type: appSignal.type,
          price: appSignal.price,
          expiresAt: { $gt: new Date() } // Only check active signals
        })
        
        if (existingSignal) {
          // Signal already exists in database, skip
          results.push({
            token: appSignal.token,
            type: appSignal.type,
            action: "skipped",
            reason: "Already exists in database"
          })
          continue
        }
        
        // Create new signal in database
        const newSignal = await models.Signal.create({
          type: appSignal.type,
          token: appSignal.token,
          price: appSignal.price,
          riskLevel: appSignal.riskLevel,
          createdAt: new Date(),
          expiresAt: appSignal.expiresAt,
          autoExecuted: false,
          link: ekinSignal.link,
          positives: ekinSignal.positives,
          warnings: ekinSignal.warnings,
          warning_count: ekinSignal.warning_count
        })
        
        newSignalsCount++
        
        results.push({
          token: appSignal.token,
          type: appSignal.type,
          id: newSignal._id.toString(),
          action: "created"
        })
        
        logger.info(`Created new ${appSignal.type} signal for ${appSignal.token}`, {
          context: "SignalSync",
          data: {
            token: appSignal.token,
            price: appSignal.price,
            riskLevel: appSignal.riskLevel
          }
        })
        
        // 3. Create notifications for eligible users based on the signal type and risk level
        
        // For BUY signals - users with matching risk level
        if (appSignal.type === "BUY") {
          const eligibleUsers = await models.User.find({
            riskLevel: appSignal.riskLevel
          })
          
          logger.info(`Found ${eligibleUsers.length} users for BUY signal with risk level ${appSignal.riskLevel}`, {
            context: "SignalSync"
          })
          
          // Create notifications for eligible users who haven't received a signal for this token today
          for (const user of eligibleUsers) {
            // Check if user has already received a signal for this token in the last 24 hours
            const hasRecentSignal = user.lastSignalTokens && user.lastSignalTokens.some(
              (item: any) =>
                item.token === appSignal.token &&
                new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000,
            )
            
            if (!hasRecentSignal) {
              await models.Notification.create({
                userId: user._id,
                type: "signal",
                message: `New ${appSignal.type} signal for ${appSignal.token} at ${appSignal.price}`,
                relatedId: newSignal._id,
                createdAt: new Date(),
              })
              
              logger.info(`Created notification for user ${user._id} for BUY signal on ${appSignal.token}`, {
                context: "SignalSync"
              })
              
              // Record that we've sent this token to this user to avoid duplicates
              if (!user.lastSignalTokens) {
                user.lastSignalTokens = []
              }
              
              user.lastSignalTokens.push({
                token: appSignal.token,
                timestamp: new Date()
              })
              
              await user.save()
            }
          }
        }
        
        // For SELL signals - users who own this token
        else if (appSignal.type === "SELL") {
          // Only notify users who have exchange connected - they're the ones who can own tokens
          const usersWithExchange = await models.User.find({
            exchangeConnected: true
          })
          
          logger.info(`Checking ${usersWithExchange.length} users with connected exchanges for SELL signal on ${appSignal.token}`, {
            context: "SignalSync"
          })
          
          let notifiedCount = 0
          
          for (const user of usersWithExchange) {
            // Find user's portfolio to check if they own this token
            const portfolio = await models.Portfolio.findOne({ userId: user._id })
            
            if (portfolio && portfolio.holdings) {
              // Check if user has this token
              const hasToken = portfolio.holdings.some((h: any) => 
                h.token === appSignal.token && h.amount > 0
              )
              
              if (hasToken) {
                await models.Notification.create({
                  userId: user._id,
                  type: "signal",
                  message: `New ${appSignal.type} signal for ${appSignal.token} at ${appSignal.price}`,
                  relatedId: newSignal._id,
                  createdAt: new Date(),
                })
                
                notifiedCount++
                
                logger.info(`Created notification for user ${user._id} for SELL signal on ${appSignal.token}`, {
                  context: "SignalSync"
                })
              }
            }
          }
          
          logger.info(`Notified ${notifiedCount} users who own ${appSignal.token} about SELL signal`, {
            context: "SignalSync"
          })
        }
      } catch (signalError) {
        const errorMessage = signalError instanceof Error ? signalError.message : "Unknown error"
        logger.error(`Error processing signal for ${ekinSignal.symbol}: ${errorMessage}`)
        
        results.push({
          token: ekinSignal.symbol,
          type: ekinSignal.type,
          action: "error",
          error: errorMessage
        })
      }
    }
    
    logger.info(`Signal sync completed - Created ${newSignalsCount} new signals`, {
      context: "SignalSync"
    })
    
    return NextResponse.json({
      success: true,
      processed: ekinSignals.length,
      created: newSignalsCount,
      results
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    logger.error(`Error in Telegram signal sync: ${errorMessage}`)
    
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 })
  }
}