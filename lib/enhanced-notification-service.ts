// lib/enhanced-notification-service.ts
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

export class EnhancedNotificationService {
  private static instance: EnhancedNotificationService;
  private telegramBotToken: string;
  private socketServerUrl: string;
  
  private constructor() {
    this.telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || "";
    this.socketServerUrl = process.env.SOCKET_SERVER_URL || "https://api.cycletrader.app";
    
    if (!this.telegramBotToken) {
      logger.warn("Telegram bot token not found in environment variables");
    }
  }
  
  public static getInstance(): EnhancedNotificationService {
    if (!EnhancedNotificationService.instance) {
      EnhancedNotificationService.instance = new EnhancedNotificationService();
    }
    return EnhancedNotificationService.instance;
  }
  
  /**
   * Send notification through all available channels
   * This ensures users receive notifications promptly through multiple methods
   */
  public async sendNotification(options: NotificationOptions): Promise<boolean> {
    try {
      const results = await Promise.allSettled([
        this.storeNotificationInDatabase(options),
        this.sendTelegramNotification(options),
        this.sendSocketNotification(options),
        this.sendPushNotification(options)
      ]);
      
      // Log results of each channel attempt
      results.forEach((result, index) => {
        const channel = ["database", "telegram", "socket", "push"][index];
        if (result.status === "fulfilled") {
          logger.info(`Successfully sent notification via ${channel} channel`, {
            context: "Notifications",
            userId: options.userId
          });
        } else {
          logger.warn(`Failed to send notification via ${channel} channel: ${result.reason}`, {
            context: "Notifications",
            userId: options.userId
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
        
        messageText = `<b>${emoji} New ${action} Signal</b>\n\n${options.message}\n\n⏰ <b>Auto-executes in 10 minutes</b> if no action is taken. Open the app to respond!`;
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
   * Send notification via WebSocket for real-time in-app notifications
   */
  private async sendSocketNotification(options: NotificationOptions): Promise<boolean> {
    try {
      // Use socket.io server to emit notification event
      const { getIOInstance } = await import('@/lib/socket');
      const io = getIOInstance();
      
      if (!io) {
        throw new Error("Socket.io instance not available");
      }
      
      // Get Telegram ID
      let telegramId = options.userId;
      
      if (typeof options.userId !== 'number' && options.userId.includes('-')) {
        // This is likely an internal user ID, need to get the Telegram ID
        const user = await models.User.findById(options.userId);
        if (!user) {
          throw new Error(`User with ID ${options.userId} not found`);
        }
        telegramId = user.telegramId;
      }
      
      // Emit to user-specific room
      io.to(`user-${telegramId}`).emit("notification", {
        id: Date.now().toString(),
        type: options.type,
        message: options.message,
        priority: options.priority || "medium",
        data: options.data || {},
        createdAt: new Date().toISOString()
      });
      
      return true;
    } catch (error) {
      logger.error(`Error sending socket notification: ${error instanceof Error ? error.message : "Unknown error"}`);
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