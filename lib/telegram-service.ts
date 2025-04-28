/**
 * Telegram Service for Cycle Trader
 * 
 * This service handles Telegram Mini App specific functionality,
 * including notifications, haptics, and UI interactions.
 */

import { logger } from "@/lib/logger"

export class TelegramService {
  private static instance: TelegramService

  private constructor() {
    // Initialize
    if (typeof window !== 'undefined') {
      // Check if Telegram WebApp exists
      if (window.Telegram && window.Telegram.WebApp) {
        logger.info("Telegram WebApp detected", { context: "TelegramService" })
        
        // Initialize Telegram WebApp
        try {
          window.Telegram.WebApp.ready()
          window.Telegram.WebApp.expand()
        } catch (error) {
          logger.error(`Error initializing Telegram WebApp: ${error instanceof Error ? error.message : 'Unknown error'}`)
        }
      } else {
        logger.info("Telegram WebApp not detected", { context: "TelegramService" })
      }
    }
  }

  public static getInstance(): TelegramService {
    if (!TelegramService.instance) {
      TelegramService.instance = new TelegramService()
    }
    return TelegramService.instance
  }

  /**
   * Check if Telegram WebApp is available
   */
  public isTelegramWebApp(): boolean {
    if (typeof window === 'undefined') return false
    return !!(window.Telegram && window.Telegram.WebApp)
  }

  /**
   * Show a popup notification in Telegram WebApp
   */
  public showPopup(
    message: string, 
    buttons: Array<{type: string, text: string}> = [{ type: "default", text: "OK" }], 
    callback?: Function
  ): boolean {
    try {
      if (!this.isTelegramWebApp() || !window.Telegram.WebApp.showPopup) {
        return false
      }
      
      window.Telegram.WebApp.showPopup(
        {
          message,
          buttons
        },
        callback ? () => callback() : undefined
      )
      
      return true
    } catch (error) {
      logger.error(`Error showing Telegram popup: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Show a toast alert in Telegram WebApp
   */
  public showAlert(message: string, callback?: Function): boolean {
    try {
      if (!this.isTelegramWebApp() || !window.Telegram.WebApp.showAlert) {
        return false
      }
      
      window.Telegram.WebApp.showAlert(
        message,
        callback ? () => callback() : undefined
      )
      
      return true
    } catch (error) {
      logger.error(`Error showing Telegram alert: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Trigger a haptic feedback notification
   * @param type - Type of haptic feedback: 'success', 'error', 'warning', 'selection'
   */
  public triggerHapticFeedback(type: 'impact' | 'notification' | 'selection' = 'notification'): boolean {
    try {
      if (!this.isTelegramWebApp() || !window.Telegram.WebApp.HapticFeedback) {
        return false
      }
      
      switch (type) {
        case 'impact':
          window.Telegram.WebApp.HapticFeedback.impactOccurred('medium')
          break
        case 'notification':
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success')
          break
        case 'selection':
          window.Telegram.WebApp.HapticFeedback.selectionChanged()
          break
      }
      
      return true
    } catch (error) {
      logger.error(`Error triggering haptic feedback: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Send data to the Telegram Bot
   */
  public sendData(data: string): boolean {
    try {
      if (!this.isTelegramWebApp()) {
        return false
      }
      
      window.Telegram.WebApp.sendData(data)
      return true
    } catch (error) {
      logger.error(`Error sending data to Telegram: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  /**
   * Create a link to open a specific location in the app
   */
  public createAppLink(route: string): string | null {
    try {
      const baseUrl = window.location.origin
      const path = route.startsWith('/') ? route : `/${route}`
      return `${baseUrl}${path}`
    } catch (error) {
      logger.error(`Error creating app link: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return null
    }
  }
  
  /**
   * Request for a permission to send notifications
   * This sends a request to the user for notification permission through Telegram
   */
  public requestNotificationPermission(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        if (!this.isTelegramWebApp()) {
          resolve(false)
          return
        }
        
        // Automatically enable notifications by default without showing popup
        localStorage.setItem("notifications_enabled", "true")
        resolve(true)
        
        // Log that notifications have been enabled
        logger.info("Notifications automatically enabled by default", {
          context: "TelegramService"
        })
      } catch (error) {
        logger.error(`Error setting notification permission: ${error instanceof Error ? error.message : 'Unknown error'}`)
        resolve(false)
      }
    })
  }
  
  /**
   * Check if notifications are enabled by the user
   */
  public areNotificationsEnabled(): boolean {
    try {
      const notificationsEnabled = localStorage.getItem("notifications_enabled")
      return notificationsEnabled === "true"
    } catch (error) {
      return false
    }
  }
}

// Export a singleton instance
export const telegramService = TelegramService.getInstance()