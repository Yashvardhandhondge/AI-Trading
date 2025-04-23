import { type NextRequest, NextResponse } from "next/server"
import { SignJWT } from "jose"
import { validateTelegramWebAppData } from "@/lib/telegram"
import { connectToDatabase } from "@/lib/db"
import { models } from "@/lib/db"
import { logger } from "@/lib/logger"
import { setSessionCookie, verifyTelegramWebAppData } from "@/lib/auth"

// Get the bot token from environment variables
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN

// Get the JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET

if (!BOT_TOKEN) {
  throw new Error("TELEGRAM_BOT_TOKEN is not defined in environment variables")
}

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables")
}

export async function POST(request: NextRequest) {
  try {
    console.log("Received authentication request")
    const { initData } = await request.json()

    if (!initData) {
      console.error("No initData provided")
      return NextResponse.json({ error: "No authentication data provided" }, { status: 400 })
    }

    console.log("Verifying Telegram WebApp data")
    // Verify Telegram WebApp data
    const telegramUser = await verifyTelegramWebAppData(initData)

    if (!telegramUser || !telegramUser.id) {
      console.error("Invalid authentication data, user:", telegramUser)
      return NextResponse.json({ error: "Invalid authentication data" }, { status: 401 })
    }

    console.log("User authenticated successfully:", telegramUser)

    // Continue with the rest of your authentication flow...
    // ...
  } catch (error) {
    console.error("Authentication error:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}