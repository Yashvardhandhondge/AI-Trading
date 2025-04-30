// lib/enhanced-notification-service.ts - Fixed to prevent duplicate notifications
import { logger } from "@/lib/logger";
import { connectToDatabase, models } from "@/lib/db";

type NotificationType = "signal" | "trade" | "cycle" | "system";

interface NotificationOptions {
  userId: string | number;
  message: string;
  type: NotificationType;
  relatedId?: string;
  priority?: "low" | "medium" | "high";
  data?: any;
}

/**
 * Notification registry to prevent duplicate notifications
 * Maps signal IDs to timestamp when last notified
 */
const notificationRegistry: Map<string, number> = new Map();

// How long to wait before allowing re-notification for the same signal (in milliseconds)
const NOTIFICATION_COOLDOWN = 30 * 60 * 1000; // 30 minutes

export class EnhancedNotificationService {
  private static instance: EnhancedNotificationService;
  private telegramBotToken: string;
  
  private constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
    
    if (!this.telegramBotToken) {
      logger.warn("Telegram bot token not found in environment variables");
    }
    
    // Set up a cleanup interval for the notification registry
    if (typeof window !== 'undefined') {
      setInterval(() => this.cleanupNotificationRegistry(), 15 * 60 * 1000); // Every 15 minutes
    }
  }
  
  /**
   * Clean up old entries from the notification registry
   */
  private cleanupNotificationRegistry(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    notificationRegistry.forEach((timestamp, key) => {
      if (now - timestamp > NOTIFICATION_COOLDOWN) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => notificationRegistry.delete(key));
    
    if (keysToDelete.length > 0) {
      logger.debug(`Cleaned up ${keysToDelete.length} old notification entries`, {
        context: "NotificationService"
      });
    }
  }
  
  public static getInstance(): EnhancedNotificationService {
    if (!EnhancedNotificationService.instance) {
      EnhancedNotificationService.instance = new EnhancedNotificationService();
    }
    return EnhancedNotificationService.instance;
  }
  
  /**
   * Check if we should send a notification based on cooldown and deduplication
   */
  private shouldSendNotification(options: NotificationOptions): boolean {
    // If there's no relatedId (like for a signal), always allow the notification
    if (!options.relatedId) {
      return true;
    }
    
    // Create a unique key for this notification
    const notificationKey = `${options.userId}_${options.type}_${options.relatedId}`;
    
    // Check if we've sent this notification recently
    const lastNotified = notificationRegistry.get(notificationKey);
    if (lastNotified) {
      const now = Date.now();
      const timeSinceLastNotification = now - lastNotified;
      
      // Don't send if we're within the cooldown period
      if (timeSinceLastNotification < NOTIFICATION_COOLDOWN) {
        logger.debug(`Skipping duplicate notification: ${options.message} (sent ${Math.floor(timeSinceLastNotification / 1000)}s ago)`, {
          context: "NotificationService",
          userId: options.userId
        });
        return false;
      }
    }
    
    // Record this notification in the registry
    notificationRegistry.set(notificationKey, Date.now());
    return true;
  }
  
  /**
   * Verify price information in signals before notifying
   */
  private verifySignalPrice(options: NotificationOptions): NotificationOptions {
    try {
      // Only process signal notifications with data
      if (options.type !== "signal" || !options.data) {
        return options;
      }
      
      const { price, token } = options.data;
      
      // Check for invalid or suspicious price values
      if (price === undefined || price === null || price === 0 || price === "0" || price === "$0.00") {
        // Price is suspicious, modify the message to be more generic
        const modifiedMessage = options.message.replace(/at \$0\.00|at \$0|at 0/i, `for ${token}`);
        
        logger.warn(`Corrected invalid price in signal notification for ${token}`, {
          context: "NotificationService",
          userId: options.userId,
          data: { originalPrice: price }
        });
        
        return {
          ...options,
          message: modifiedMessage
        };
      }
      
      return options;
    } catch (e) {
      // If any error occurs during price verification, return the original options
      return options;
    }
  }
  
  /**
   * Send notification through all available channels
   * This ensures users receive notifications promptly through multiple methods
   */
  public async sendNotification(options: NotificationOptions): Promise<boolean> {
    try {
      // First, check if we should send this notification (deduplication)
      if (!this.shouldSendNotification(options)) {
        return false;
      }
      
      // Verify and potentially fix price information
      const verifiedOptions = this.verifySignalPrice(options);
      
      // Send through all channels
      const results = await Promise.allSettled([
        this.storeNotificationInDatabase(verifiedOptions),
        this.sendTelegramNotification(verifiedOptions),
        this.sendPushNotification(verifiedOptions)
      ]);
      
      // Log results of each channel attempt
      results.forEach((result, index) => {
        const channel = ["database", "telegram", "push"][index];
        if (result.status === "fulfilled") {
          logger.info(`Successfully sent notification via ${channel} channel`, {
            context: "Notifications",
            userId: verifiedOptions.userId
          });
        } else {
          logger.warn(`Failed to send notification via ${channel} channel: ${result.reason}`, {
            context: "Notifications",
            userId: verifiedOptions.userId
          });
        }
      });
      
      // Return true if at least one channel succeeded
      return results.some(result => result.status === "fulfilled");
    } catch (error) {
      logger.error(`Error sending notification: ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }
  
  /**
   * Store notification in database
   */
  private async storeNotificationInDatabase(options: NotificationOptions): Promise<boolean> {
    try {
      await connectToDatabase();
      
      // Get internal user ID from Telegram ID if needed
      let internalUserId = options.userId;
      
      if (typeof options.userId === 'number' || !options.userId.includes('-')) {
        // This is likely a Telegram ID, need to get the internal user ID
        const user = await models.User.findOne({ telegramId: options.userId });
        if (!user) {
          throw new Error(`User with Telegram ID ${options.userId} not found`);
        }
        internalUserId = user._id;
      }
      
      // Check if this notification already exists in the database
      const existingNotification = await models.Notification.findOne({
        userId: internalUserId,
        type: options.type,
        relatedId: options.relatedId
      });
      
      if (existingNotification) {
        logger.debug(`Notification already exists in database for user ${options.userId}`, {
          context: "NotificationService"
        });
        return true; // Consider it a success since it already exists
      }
      
      // Create the notification in database
      await models.Notification.create({
        userId: internalUserId,
        type: options.type,
        message: options.message,
        relatedId: options.relatedId,
        priority: options.priority || "medium",
        data: options.data || {},
        read: false,
        createdAt: new Date()
      });
      
      return true;
    } catch (error) {
      logger.error(`Error storing notification in database: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Send notification via Telegram Bot API
   */
  private async sendTelegramNotification(options: NotificationOptions): Promise<boolean> {
    try {
      // Skip if no token
      if (!this.telegramBotToken) {
        throw new Error("No Telegram bot token configured");
      }
      
      // Get Telegram chat ID
      let telegramId = options.userId;
      
      if (typeof options.userId !== 'number' && options.userId.includes('-')) {
        // This is likely an internal user ID, need to get the Telegram ID
        const user = await models.User.findById(options.userId);
        if (!user) {
          throw new Error(`User with ID ${options.userId} not found`);
        }
        telegramId = user.telegramId;
      }
      
      // Prepare the message with different formatting based on notification type
      let messageText = options.message;
      let parseMode = "HTML";
      
      // For signal notifications, add more context and formatting
      if (options.type === "signal") {
        // Add emojis and formatting based on the signal type
        const isSignalBuy = options.message.includes("BUY");
        const emoji = isSignalBuy ? "🟢" : "🔴";
        const action = isSignalBuy ? "BUY" : "SELL";
        
        // Extract token from message if possible
        const tokenMatch = options.message.match(/for\s+(\w+)/);
        const token = tokenMatch ? tokenMatch[1] : "";
        
        messageText = `<b>${emoji} New ${action} Signal</b>\n\n${options.message}\n\n⏰ <b>Open the app to respond!</b>`;
      }
      
      // Send message via Telegram Bot API
      const response = await fetch(`https://api.telegram.org/bot${this.telegramBotToken}/sendMessage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          chat_id: telegramId,
          text: messageText,
          parse_mode: parseMode,
          disable_notification: false
        })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Telegram API error: ${JSON.stringify(error)}`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Error sending Telegram notification: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Send push notification for mobile devices
   * This is a placeholder - implement with your preferred push service
   */
  private async sendPushNotification(options: NotificationOptions): Promise<boolean> {
    try {
      // For Telegram Mini Apps, we typically rely on Telegram's native notifications
      // This is a placeholder for additional push notification services if needed
      
      // Placeholder for a future implementation
      // Could integrate with FCM, OneSignal, or other push services
      
      // For now, we'll consider this successful since we rely on Telegram notifications
      return true;
    } catch (error) {
      logger.error(`Error sending push notification: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
}

// Export a singleton instance
export const enhancedNotificationService = EnhancedNotificationService.getInstance();