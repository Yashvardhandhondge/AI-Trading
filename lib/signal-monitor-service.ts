// lib/signal-monitor-service.ts
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"

export class SignalMonitorService {
  private static instance: SignalMonitorService
  private checkInterval: number = 30 * 1000 // 30 seconds
  private lastCheckTime: number = Date.now()
  
  private constructor() {}
  
  public static getInstance(): SignalMonitorService {
    if (!SignalMonitorService.instance) {
      SignalMonitorService.instance = new SignalMonitorService()
    }
    return SignalMonitorService.instance
  }
  
  /**
   * Check for new signals and create notifications for eligible users
   */
  public async checkForNewSignals(): Promise<void> {
    try {
      await connectToDatabase()
      
      // Get signals created since last check
      const newSignals = await models.Signal.find({
        createdAt: { 
          $gte: new Date(this.lastCheckTime),
          $lte: new Date() // Only signals up to current time
        },
        expiresAt: { $gt: new Date() } // Only active signals
      })
      
      if (newSignals.length === 0) {
        return
      }
      
      logger.info(`Found ${newSignals.length} new signals to process`)
      
      // Process each signal
      for (const signal of newSignals) {
        await this.createNotificationsForSignal(signal)
      }
      
      // Update last check time
      this.lastCheckTime = Date.now()
      
    } catch (error) {
      logger.error(`Error checking for new signals: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }
  
  /**
   * Create notifications for users who should receive a signal
   */
  private async createNotificationsForSignal(signal: any): Promise<void> {
    try {
      let eligibleUsers = []
      
      if (signal.type === "BUY") {
        // For BUY signals, find users with matching risk level
        eligibleUsers = await models.User.find({
          riskLevel: signal.riskLevel,
          exchangeConnected: true
        })
      } else if (signal.type === "SELL") {
        // For SELL signals, find users who own this token
        const usersWithExchange = await models.User.find({ 
          exchangeConnected: true 
        })
        
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
      }
      
      // Create notifications for eligible users
      const notifications = []
      for (const user of eligibleUsers) {
        notifications.push({
          userId: user._id,
          type: "signal",
          message: `New ${signal.type} signal for ${signal.token} at ${signal.price}`,
          relatedId: signal._id,
          createdAt: new Date(),
          read: false
        })
      }
      
      if (notifications.length > 0) {
        await models.Notification.insertMany(notifications)
        logger.info(`Created ${notifications.length} notifications for signal ${signal._id}`)
      }
      
    } catch (error) {
      logger.error(`Error creating notifications: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }
  
  /**
   * Start monitoring for new signals
   */
  public startMonitoring(): void {
    // Initial check
    this.checkForNewSignals()
    
    // Set up periodic checks
    setInterval(() => {
      this.checkForNewSignals()
    }, this.checkInterval)
    
    logger.info("Signal monitoring service started")
  }
}

export const signalMonitorService = SignalMonitorService.getInstance()