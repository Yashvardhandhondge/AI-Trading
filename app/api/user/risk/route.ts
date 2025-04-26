import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { riskLevel } = await request.json()

    if (!riskLevel || !["low", "medium", "high"].includes(riskLevel)) {
      return NextResponse.json({ error: "Invalid risk level" }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Update user risk level
    await models.User.findOneAndUpdate(
      { telegramId: sessionUser.id }, 
      { riskLevel, updatedAt: new Date() }
    )

    logger.info(`User risk level updated to ${riskLevel}`, {
      context: "UserRiskUpdate",
      userId: sessionUser.id
    })

    return NextResponse.json({ 
      success: true,
      message: `Risk level updated to ${riskLevel}`
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error : "Unknown error"
    logger.error(`Error updating risk level: ${errorMessage}`)
    
    return NextResponse.json({ error: "Failed to update risk level" }, { status: 500 })
  }
}

// Endpoint to get user settings including risk level
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

    // Return only the necessary settings
    return NextResponse.json({
      riskLevel: user.riskLevel || "medium",
      exchange: user.exchange || "binance",
      exchangeConnected: user.exchangeConnected || false
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error : "Unknown error"
    logger.error(`Error fetching user settings: ${errorMessage}`)
    
    return NextResponse.json({ error: "Failed to fetch user settings" }, { status: 500 })
  }
}