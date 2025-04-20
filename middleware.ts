import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { logger } from "@/lib/logger"

// Rate limiting configuration
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 100 // Maximum requests per window

// In-memory store for rate limiting
// Note: For production, use Redis or a similar distributed store
const rateLimitStore = new Map<string, { count: number; timestamp: number }>()

// Clean up the rate limit store periodically
setInterval(() => {
  const now = Date.now()
  for (const [key, value] of rateLimitStore.entries()) {
    if (now - value.timestamp > RATE_LIMIT_WINDOW) {
      rateLimitStore.delete(key)
    }
  }
}, RATE_LIMIT_WINDOW)

export async function middleware(request: NextRequest) {
  const response = NextResponse.next()

  // Add security headers
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("X-XSS-Protection", "1; mode=block")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")

  // Customize Content Security Policy based on environment
  if (process.env.NODE_ENV === 'development') {
    // More permissive CSP for development
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://telegram.org; connect-src 'self' wss: https://*; img-src 'self' data: https://*; style-src 'self' 'unsafe-inline'; font-src 'self' data:; frame-ancestors https://telegram.org;"
    )
  } else {
    // Stricter CSP for production
    response.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self' 'unsafe-inline' https://telegram.org; connect-src 'self' wss: https://api.binance.com https://api.btcc.com; img-src 'self' data: https://telegram.org; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors https://telegram.org;"
    )
  }

  // Apply rate limiting for API routes
  if (request.nextUrl.pathname.startsWith("/api")) {
    // Get client IP from headers
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || request.headers.get('x-real-ip') || "unknown"
    const key = `${ip}:${request.nextUrl.pathname}`

    // Check if the client has exceeded the rate limit
    const now = Date.now()
    const windowData = rateLimitStore.get(key) || { count: 0, timestamp: now }

    // Reset the window if it has expired
    if (now - windowData.timestamp > RATE_LIMIT_WINDOW) {
      windowData.count = 0
      windowData.timestamp = now
    }

    // Increment the request count
    windowData.count++
    rateLimitStore.set(key, windowData)

    // Add rate limit headers
    response.headers.set("X-RateLimit-Limit", MAX_REQUESTS_PER_WINDOW.toString())
    response.headers.set("X-RateLimit-Remaining", Math.max(0, MAX_REQUESTS_PER_WINDOW - windowData.count).toString())
    response.headers.set("X-RateLimit-Reset", (windowData.timestamp + RATE_LIMIT_WINDOW).toString())

    // If the client has exceeded the rate limit, return a 429 response
    if (windowData.count > MAX_REQUESTS_PER_WINDOW) {
      logger.warn(`Rate limit exceeded for ${key}`, { context: "middleware" })
      return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      })
    }

    // Log API requests in development
    if (process.env.NODE_ENV !== "production") {
      logger.debug(`API Request: ${request.method} ${request.nextUrl.pathname}`, {
        context: "middleware",
        data: {
          method: request.method,
          url: request.nextUrl.toString(),
          headers: Object.fromEntries(request.headers),
        },
      })
    }
  }

  return response
}

// Configure the middleware to run only for specific paths
export const config = {
  matcher: [
    // Apply to all API routes
    "/api/:path*",
    // Apply to all pages except static assets
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
}