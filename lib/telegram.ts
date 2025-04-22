/**
 * Telegram utilities for Cycle Trader
 *
 * This module provides utilities for working with Telegram WebApp
 * and validating Telegram authentication.
 */

import crypto from "crypto"
import { logger } from "@/lib/logger"

// Interface for Telegram user data
export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
}

/**
 * Parse and validate Telegram WebApp initData
 *
 * @param initData - The initData string from Telegram.WebApp
 * @param botToken - The bot token for validation
 * @returns The parsed user data if valid
 * @throws Error if validation fails
 */
export function validateTelegramWebAppData(initData: string, botToken: string): TelegramUser {
  try {
    // Parse the initData
    const urlParams = new URLSearchParams(initData)
    const hash = urlParams.get("hash")

    if (!hash) {
      throw new Error("No hash provided in initData")
    }

    // Remove the hash from the data for validation
    urlParams.delete("hash")

    // Sort the params alphabetically as required by Telegram
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")

    // Create the secret key from the bot token
    const secretKey = crypto.createHash("sha256").update(botToken).digest()

    // Calculate the hash
    const calculatedHash = crypto.createHmac("sha256", secretKey).update(dataCheckString).digest("hex")

    // Validate the hash
    if (calculatedHash !== hash) {
      throw new Error("Invalid hash")
    }

    // Check if the auth date is not too old (within 24 hours)
    const authDate = Number.parseInt(urlParams.get("auth_date") || "0", 10)
    const currentTime = Math.floor(Date.now() / 1000)

    if (currentTime - authDate > 86400) {
      throw new Error("Authentication data is too old")
    }

    // Parse the user data
    const userData: TelegramUser = {
      id: Number.parseInt(urlParams.get("id") || "0", 10),
      first_name: urlParams.get("first_name") || "",
      last_name: urlParams.get("last_name") || undefined,
      username: urlParams.get("username") || undefined,
      photo_url: urlParams.get("photo_url") || undefined,
      auth_date: authDate,
    }

    return userData
  } catch (error) {
    logger.error("Telegram validation error:", error instanceof Error ? error : new Error(String(error)), {
      context: "TelegramValidation",
    })
    throw error
  }
}

/**
 * Check if the code is running in a Telegram WebApp environment
 */
export function isTelegramWebApp(): boolean {
  if (typeof window === "undefined") return false
  return !!(window.Telegram && window.Telegram.WebApp)
}

/**
 * Initialize the Telegram WebApp
 */
export function initTelegramWebApp(): void {
  if (isTelegramWebApp()) {
    window.Telegram.WebApp.ready()
    window.Telegram.WebApp.expand()
  }
}

/**
 * Get the Telegram WebApp theme parameters
 */
export function getTelegramThemeParams() {
  if (!isTelegramWebApp()) return null

  return window.Telegram.WebApp.themeParams
}

/**
 * Show a popup in Telegram WebApp
 */
export function showTelegramPopup(message: string, callback?: () => void): void {
  if (isTelegramWebApp()) {
    window.Telegram.WebApp.showPopup(
      {
        message,
      },
      callback,
    )
  }
}

/**
 * Show an alert in Telegram WebApp
 */
export function showTelegramAlert(message: string, callback?: () => void): void {
  if (isTelegramWebApp()) {
    window.Telegram.WebApp.showAlert(message, callback)
  }
}

/**
 * Close the Telegram WebApp
 */
export function closeTelegramWebApp(): void {
  if (isTelegramWebApp()) {
    window.Telegram.WebApp.close()
  }
}
