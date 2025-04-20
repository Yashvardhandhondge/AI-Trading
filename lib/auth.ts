import { jwtVerify, SignJWT } from "jose"
import { cookies } from "next/headers"
import { type NextRequest, NextResponse } from "next/server"

const JWT_SECRET = process.env.JWT_SECRET || "yash"
const secretKey = new TextEncoder().encode(JWT_SECRET)

export interface TelegramUser {
  id: number
  first_name: string
  last_name?: string
  username?: string
  photo_url?: string
  auth_date: number
  hash: string
}

export interface SessionUser extends TelegramUser {
  exchange?: "binance" | "btcc"
  exchangeConnected: boolean
}

// In auth.ts

// Modify this function to always return a valid user without checking anything
export async function verifyTelegramWebAppData(initData: string): Promise<TelegramUser | null> {
  // Return a basic user object without any mock data parsing
  return {
    id: 12345, // Simple ID
    first_name: "User",
    auth_date: Math.floor(Date.now() / 1000),
    hash: "",
  }
}

export async function createSessionToken(user: SessionUser): Promise<string> {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(secretKey)

  return token
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey)
    return payload as unknown as SessionUser
  } catch (error) {
    return null
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get("session_token")?.value

  if (!token) return null

  return verifySessionToken(token)
}

export function setSessionCookie(token: string, response: NextResponse): NextResponse {
  response.cookies.set({
    name: "session_token",
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 60 * 60 * 24, // 24 hours
    path: "/",
  })

  return response
}

export function clearSessionCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: "session_token",
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 0,
    path: "/",
  })

  return response
}

export async function requireAuth(request: NextRequest): Promise<NextResponse | SessionUser> {
  const token = request.cookies.get("session_token")?.value

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const user = await verifySessionToken(token)

  if (!user) {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  return user
}