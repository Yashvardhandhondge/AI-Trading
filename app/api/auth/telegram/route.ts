import { type NextRequest, NextResponse } from "next/server"
import { verifyTelegramWebAppData, createSessionToken, setSessionCookie, type SessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const { initData } = await request.json()

    if (!initData) {
      return NextResponse.json({ error: "No authentication data provided" }, { status: 400 })
    }

    // Verify Telegram WebApp data
    const telegramUser = await verifyTelegramWebAppData(initData)

    if (!telegramUser) {
      return NextResponse.json({ error: "Invalid authentication data" }, { status: 401 })
    }

    // Connect to database
    await connectToDatabase()

    // Find or create user
    let user = await models.User.findOne({ telegramId: telegramUser.id })

    if (!user) {
      user = await models.User.create({
        telegramId: telegramUser.id,
        username: telegramUser.username,
        firstName: telegramUser.first_name,
        lastName: telegramUser.last_name,
        photoUrl: telegramUser.photo_url,
        authDate: telegramUser.auth_date,
      })
    } else {
      // Update user data if needed
      user.username = telegramUser.username
      user.firstName = telegramUser.first_name
      user.lastName = telegramUser.last_name
      user.photoUrl = telegramUser.photo_url
      user.authDate = telegramUser.auth_date
      user.updatedAt = new Date()
      await user.save()
    }

    // Create session user
    const sessionUser: SessionUser = {
      id: telegramUser.id,
      first_name: telegramUser.first_name,
      last_name: telegramUser.last_name,
      username: telegramUser.username,
      photo_url: telegramUser.photo_url,
      auth_date: telegramUser.auth_date,
      hash: telegramUser.hash,
      exchange: user.exchange,
      exchangeConnected: user.exchangeConnected || false,
    }

    // Create session token
    const token = await createSessionToken(sessionUser)

    // Create response
    const response = NextResponse.json({ success: true })

    // Set session cookie
    return setSessionCookie(token, response)
  } catch (error) {
    console.error("Authentication error:", error)
    return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
  }
}
