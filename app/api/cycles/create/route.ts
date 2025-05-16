// app/api/cycles/create/route.ts
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

    // Parse request body
    const { token, userId, initialState = "hold", currentPrice } = await request.json()

    // Validate required fields
    if (!token || !currentPrice) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if exchange is connected
    if (!user.exchangeConnected) {
      return NextResponse.json({ error: "Exchange not connected" }, { status: 400 })
    }

    // Check if a cycle for this token already exists
    const existingCycle = await models.Cycle.findOne({
      userId: user._id,
      token: token,
      state: { $in: ["entry", "hold"] }
    })

    if (existingCycle) {
      logger.info(`Cycle already exists for ${token} for user ${sessionUser.id}`, {
        context: "CycleCreate"
      })

      // Return the existing cycle
      return NextResponse.json({
        message: "Cycle already exists",
        id: existingCycle._id.toString(),
        token: existingCycle.token,
        state: existingCycle.state,
        entryPrice: existingCycle.entryPrice
      })
    }

    // Create new cycle
    const newCycle = await models.Cycle.create({
      userId: user._id,
      token: token,
      state: initialState,
      entryPrice: currentPrice,
      guidance: "Created manually for tracking",
      createdAt: new Date(),
      updatedAt: new Date()
    })

    logger.info(`Created new cycle for ${token} for user ${sessionUser.id}`, {
      context: "CycleCreate"
    })

    return NextResponse.json({
      message: "Cycle created successfully",
      id: newCycle._id.toString(),
      token: newCycle.token,
      state: newCycle.state,
      entryPrice: newCycle.entryPrice
    })
  } catch (error) {
    logger.error(`Error creating cycle: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to create cycle" }, { status: 500 })
  }
}