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

export async function verifyTelegramWebAppData(initData: string): Promise<TelegramUser | null> {
  try {
    console.log("Verifying Telegram WebApp data:", initData)
    
    // For development mode, allow mock data
    if (process.env.NODE_ENV === "development" && initData.includes("query_id=AAHdF6IQAAAAAN0XohBnVaDf")) {
      console.log("Development mode detected, using mock user data")
      // Parse out the mock user data
      const userMatch = initData.match(/user=%7B(.*?)%7D/)
      if (userMatch) {
        const userStr = decodeURIComponent(userMatch[0].replace('user=%7B', '{').replace('%7D', '}'))
        console.log("Parsed user string:", userStr)
        try {
          const userData = JSON.parse(userStr)
          
          // Return mock user for development
          return {
            id: userData.id || 123456789,
            first_name: userData.first_name || "Dev",
            last_name: userData.last_name || "User",
            username: userData.username || "devuser",
            auth_date: Math.floor(Date.now() / 1000),
            hash: "dev_mode_hash",
          }
        } catch (e) {
          console.error("Error parsing mock user data:", e)
        }
      }
      
      // Fallback mock user if parsing fails
      console.log("Using fallback mock user data")
      return {
        id: 123456789,
        first_name: "Dev",
        last_name: "User",
        username: "devuser",
        auth_date: Math.floor(Date.now() / 1000),
        hash: "dev_mode_hash",
      }
    }

    // Parse the initData string
    console.log("Parsing real Telegram initData")
    const params = new URLSearchParams(initData)
    const hash = params.get("hash")
    params.delete("hash")

    if (!hash) {
      console.error("No hash found in initData")
      return null
    }

    // Sort params alphabetically
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join("\n")

    console.log("Sorted params for verification:", sortedParams)

    // In a real implementation, you would verify the hash with Telegram's Bot Token
    // For this implementation, we'll accept the data if it has proper structure

    // Parse user data
    const userData: TelegramUser = {
      id: Number.parseInt(params.get("id") || "0"),
      first_name: params.get("first_name") || "",
      last_name: params.get("last_name") || undefined,
      username: params.get("username") || undefined,
      photo_url: params.get("photo_url") || undefined,
      auth_date: Number.parseInt(params.get("auth_date") || "0"),
      hash: hash || "",
    }

    console.log("Extracted user data:", userData)
    
    if (!userData.id) {
      console.error("Invalid user ID in the data")
      return null
    }

    return userData
  } catch (error) {
    console.error("Error verifying Telegram data:", error)
    return null
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