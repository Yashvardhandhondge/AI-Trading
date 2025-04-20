import { type NextRequest, NextResponse } from "next/server"
import { verifyTelegramWebAppData, createSessionToken, setSessionCookie, type SessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"

// In api/auth/telegram/route.ts
export async function POST(request: NextRequest) {
  try {
    // Create a basic session user
    const sessionUser: SessionUser = {
      id: 12345,
      first_name: "User",
      auth_date: Math.floor(Date.now() / 1000),
      hash: "",
      exchangeConnected: false,
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