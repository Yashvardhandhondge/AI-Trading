/**
 * Notification Service for Cycle Trader
 * 
 * This service handles sending notifications through Telegram Bot API
 * and managing notification delivery.
 */

import { logger } from "@/lib/logger"
import { connectToDatabase, models } from "@/lib/db"

interface NotificationOptions {
  userId: string | number
  message: string
  type: "signal" | "trade" | "cycle" | "system"
  relatedId?: string
}

export class NotificationService {
  private static instance: NotificationService
  private telegramBotToken: string
  
  private constructor() {
    // Get token from environment variables
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || ""
    if (!this.telegramBotToken) {
      logger.warn("Telegram bot token not found in environment variables")
    }
  }
  
  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService()
    }
    return NotificationService.instance
  }
  
  /**
   * Create a notification in the database
   */
  public async createNotification(options: NotificationOptions): Promise<boolean> {
    try {
      await connectToDatabase()
      
      // Get internal user ID from Telegram ID if needed
      let internalUserId = options.userId
      
      if (typeof options.userId === 'number' || !options.userId.includes('-')) {
        // This is likely a Telegram ID, need to get the internal user ID
        const user = await models.User.findOne({ telegramId: options.userId })
        if (!user) {
          throw new Error(`User with Telegram ID ${options.userId} not found`)
        }
        internalUserId = user._id
      }
      
      // Create the notification in database
      await models.Notification.create({
        userId: internalUserId,
        type: options.type,
        message: options.message,
        relatedId: options.relatedId,
        read: false,
        createdAt: new Date()
      })
      
      logger.info(`Created ${options.type} notification for user ${options.userId}`, {
        context: "Notifications",
        data: { message: options.message }
      })
      
      // Try to send via Telegram API if it's a signal
      if (options.type === "signal") {
        await this.sendTelegramNotification(options.userId, options.message)
      }
      
      return true
    } catch (error) {
      logger.error(`Error creating notification: ${error instanceof Error ? error.message : "Unknown error"}`)
      return false
    }
  }
  
  /**
   * Send a notification via Telegram Bot API
   */
  private async sendTelegramNotification(userId: string | number, message: string): Promise<boolean> {
    try {
      // Skip if no token
      if (!this.telegramBotToken) {
        logger.warn("Cannot send Telegram notification: No bot token configured")
        return false
      }
      
      // Get Telegram chat ID
      let telegramId = userId
      
      if (typeof userId !== 'number' && userId.includes('-')) {
        // This is likely an internal user ID, need to get the Telegram ID
        const user = await models.User.findById(userId)
        if (!user) {
          throw new Error(`User with ID ${userId} not found`)
        }
        telegramId = user.telegramId
      }
      
      // Prepare the message with a call to action
      const fullMessage = `🔔 ${message}\n\nOpen Cycle Trader to take action within 10 minutes.`
      
      // Send message via Telegram Bot API
      const response = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: telegramId,
          text: fullMessage,
          parse_mode: 'HTML',
          disable_notification: false
        })
      })
      
      if (!response.ok) {
        const error = await response.json()
        throw new Error(`Telegram API error: ${JSON.stringify(error)}`)
      }
      
      logger.info(`Sent Telegram notification to user ${telegramId}`, {
        context: "Notifications"
      })
      
      return true
    } catch (error) {
      logger.error(`Error sending Telegram notification: ${error instanceof Error ? error.message : "Unknown error"}`)
      return false
    }
  }
  
  /**
   * Mark a notification as read
   */
  public async markAsRead(notificationId: string): Promise<boolean> {
    try {
      await connectToDatabase()
      
      const notification = await models.Notification.findById(notificationId)
      
      if (!notification) {
        throw new Error(`Notification with ID ${notificationId} not found`)
      }
      
      notification.read = true
      await notification.save()
      
      logger.info(`Marked notification ${notificationId} as read`, {
        context: "Notifications"
      })
      
      return true
    } catch (error) {
      logger.error(`Error marking notification as read: ${error instanceof Error ? error.message : "Unknown error"}`)
      return false
    }
  }
  
  /**
   * Get unread notifications for a user
   */
  public async getUnreadNotifications(userId: string | number, limit = 10): Promise<any[]> {
    try {
      await connectToDatabase()
      
      // Get internal user ID from Telegram ID if needed
      let internalUserId = userId
      
      if (typeof userId === 'number' || !userId.includes('-')) {
        // This is likely a Telegram ID, need to get the internal user ID
        const user = await models.User.findOne({ telegramId: userId })
        if (!user) {
          throw new Error(`User with Telegram ID ${userId} not found`)
        }
        internalUserId = user._id
      }
      
      // Get unread notifications
      const notifications = await models.Notification.find({
        userId: internalUserId,
        read: false
      }).sort({ createdAt: -1 }).limit(limit)
      
      return notifications
    } catch (error) {
      logger.error(`Error getting unread notifications: ${error instanceof Error ? error.message : "Unknown error"}`)
      return []
    }
  }
}

// Export a singleton instance
export const notificationService = NotificationService.getInstance()