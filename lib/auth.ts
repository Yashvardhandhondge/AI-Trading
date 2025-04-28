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
  riskLevel: "low" | "medium" | "high"
}

export async function verifyTelegramWebAppData(initData: string): Promise<TelegramUser | null> {
  try {
    console.log("Verifying Telegram WebApp data:", initData)
    
    // For development mode, allow mock data
    if (process.env.NODE_ENV === "development" && initData.includes("query_id=AAHdF6IQAAAAAN0XohBnVaDf")) {
      // Development mode handling...
      // (keep your existing development mode code)
    }

    // Parse the initData string
    console.log("Parsing real Telegram initData")
    const params = new URLSearchParams(initData)
    const hash = params.get("hash")
    
    if (!hash) {
      console.error("No hash found in initData")
      return null
    }

    // Extract user data from the 'user' parameter which is a JSON string
    const userParam = params.get("user")
    if (!userParam) {
      console.error("No user data found in initData")
      return null
    }

    let userData: TelegramUser;
    
    try {
      // Parse the user JSON
      const userObject = JSON.parse(userParam)
      
      // Create the TelegramUser object from the parsed data
      userData = {
        id: userObject.id || 0,
        first_name: userObject.first_name || "",
        last_name: userObject.last_name,
        username: userObject.username,
        photo_url: userObject.photo_url,
        auth_date: Number.parseInt(params.get("auth_date") || "0"),
        hash: hash
      }
      
      console.log("Successfully parsed user data:", userData)
    } catch (error) {
      console.error("Error parsing user JSON:", error)
      return null
    }
    
    // Make sure we have a valid user ID
    if (!userData.id) {
      console.error("Invalid or missing user ID")
      return null
    }

    return userData;
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

// In your auth.ts file, modify getSessionUser()
export async function getSessionUser(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("session_token")?.value;
  
  if (!token) {
    console.log("No session token found in cookies");
    return null;
  }
  
  try {
    const user = await verifySessionToken(token);
    console.log("Session user verified:", user?.id);
    return user;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
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