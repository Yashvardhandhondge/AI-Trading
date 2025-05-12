import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { EkinApiService } from "@/lib/ekin-api"
import { logger } from "@/lib/logger"

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get exchange from query params or user's default
    const searchParams = request.nextUrl.searchParams
    const exchange = (searchParams.get("exchange") as "binance" | "btcc") || user.exchange || "binance"

    // Fetch risk data from Ekin API
    const riskData = await EkinApiService.getRisksByExchange(exchange)

    logger.info(`Fetched risk data from Ekin API for ${exchange}`)

    return NextResponse.json({ risks: riskData })
  } catch (error) {
    logger.error("Error fetching Ekin risks:", error instanceof Error ? error : new Error(String(error)), {
      context: "EkinAPI",
    })
    return NextResponse.json({ error: "Failed to fetch risk data" }, { status: 500 })
  }
}
