// app/api/trades/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { TradeSyncService } from "@/lib/trade-sync-service"
import { logger } from "@/lib/logger"

// GET endpoint for fetching trades
export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const forceSync = searchParams.get("forceSync") === "true"

    // Get trades using TradeSyncService
    const result = await TradeSyncService.getStoredTrades(sessionUser.id, {
      limit: 50,
      offset: 0,
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error("Error fetching trades:", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 })
  }
}

// POST endpoint for syncing trades
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse request body
    const body = await request.json()
    const { limit = 100, forceSync = true } = body

    // Sync trades using TradeSyncService
    const result = await TradeSyncService.syncUserTrades(sessionUser.id, {
      limit,
      forceSync
    })

    return NextResponse.json(result)
  } catch (error) {
    logger.error("Error syncing trades:", error instanceof Error ? error : new Error(String(error)))
    return NextResponse.json({ 
      error: "Failed to sync trades",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
}