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
    // Parse the request body
    console.log("Received authentication request")
    const { initData } = await request.json()


    if (!initData) {
      console.error("No initData provided")
      return NextResponse.json({ error: "No authentication data provided" }, { status: 400 })
    }
    console.log("Verifying Telegram WebApp data")
    const telegramUser = await verifyTelegramWebAppData(initData)

    if (!telegramUser) {
      console.error("Invalid authentication data")
      return NextResponse.json({ error: "Invalid authentication data" }, { status: 401 })
    }

    console.log("User authenticated successfully:", telegramUser)

    await connectToDatabase();

    // Validate the Telegram WebApp data
    if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required for validation");
    const userData = validateTelegramWebAppData(initData, BOT_TOKEN)

  

    // Find or create the user
    let user = await models.User.findOne({ telegramId: userData.id })

    if (!user) {
      logger.info(`Creating new user for Telegram ID: ${userData.id}`, {
        context: "TelegramAuth",
      })

      // Create a new user
      user = await models.User.create({
        telegramId: userData.id,
        firstName: userData.first_name,
        lastName: userData.last_name,
        username: userData.username,
        photoUrl: userData.photo_url,
        authDate: userData.auth_date,
        createdAt: new Date(),
        isAdmin: false, // Default to non-admin
        riskLevel: "medium", // Default risk level
        exchangeConnected: false, // Default to no exchange connected
      })
    } else {
      logger.info(`User found for Telegram ID: ${userData.id}`, {
        context: "TelegramAuth",
        userId: user._id,
      })

      // Update the user's data
      user.firstName = userData.first_name
      user.lastName = userData.last_name
      user.username = userData.username
      user.photoUrl = userData.photo_url
      user.authDate = userData.auth_date
      user.lastLoginAt = new Date()
      await user.save()
    }

    // Create a JWT token
    const token = await new SignJWT({
      id: user._id.toString(),
      telegramId: user.telegramId,
      isAdmin: user.isAdmin,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h") // Token expires in 24 hours
      .sign(new TextEncoder().encode(JWT_SECRET))

    // Create a response with the token in a cookie

    const response = NextResponse.json({ success: true })
    // Set the token as an HTTP-only cookie
    response.cookies.set({
      name: "auth_token",
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24, // 24 hours in seconds
      path: "/",
    })
    return setSessionCookie(token, response)


  } catch (error) {
    logger.error("Authentication error:", error instanceof Error ? error : new Error(String(error)), {
      context: "TelegramAuth",
    })

    return NextResponse.json(
      { message: "Authentication failed", error: error instanceof Error ? error.message : String(error) },
      { status: 401 },
    )
  }
}
