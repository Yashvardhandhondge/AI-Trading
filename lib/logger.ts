/**
 * Logger utility for Cycle Trader
 *
 * This module provides structured logging capabilities with different log levels
 * and context information for better debugging and monitoring.
 */

type LogLevel = "debug" | "info" | "warn" | "error"

interface LogOptions {
  context?: string
  userId?: string | number
  data?: Record<string, any>
}

class Logger {
  private static instance: Logger
  private isProduction: boolean

  private constructor() {
    this.isProduction = process.env.NODE_ENV === "production"
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  /**
   * Format a log message with timestamp and context
   */
  private formatMessage(level: LogLevel, message: string, options?: LogOptions): string {
    const timestamp = new Date().toISOString()
    const context = options?.context ? `[${options.context}]` : ""
    const userId = options?.userId ? `[User: ${options.userId}]` : ""

    return `${timestamp} ${level.toUpperCase()} ${context} ${userId} ${message}`
  }

  /**
   * Log a debug message (development only)
   */
  public debug(message: string, options?: LogOptions): void {
    if (this.isProduction) return

    console.debug(this.formatMessage("debug", message, options))

    if (options?.data) {
      console.debug(options.data)
    }
  }

  /**
   * Log an info message
   */
  public info(message: string, options?: LogOptions): void {
    console.info(this.formatMessage("info", message, options))

    if (!this.isProduction && options?.data) {
      console.info(options.data)
    }
  }

  /**
   * Log a warning message
   */
  public warn(message: string, options?: LogOptions): void {
    console.warn(this.formatMessage("warn", message, options))

    if (options?.data) {
      console.warn(options.data)
    }
  }

  /**
   * Log an error message
   */
  public error(message: string, error?: Error, options?: LogOptions): void {
    console.error(this.formatMessage("error", message, options))

    if (error) {
      console.error(error)
    }

    if (options?.data) {
      console.error(options.data)
    }

    // In production, you might want to send critical errors to a monitoring service
    if (this.isProduction) {
      this.reportToMonitoring(message, error, options)
    }
  }

  /**
   * Report critical errors to a monitoring service
   * This is a placeholder for integration with services like Sentry, LogRocket, etc.
   */
  private reportToMonitoring(message: string, error?: Error, options?: LogOptions): void {
    // Integration with monitoring services would go here
    // Example with Sentry:
    // Sentry.captureException(error, {
    //   extra: {
    //     message,
    //     context: options?.context,
    //     userId: options?.userId,
    //     data: options?.data
    //   }
    // });
  }
}

// Export a singleton instance
export const logger = Logger.getInstance()
