// app/api/cycles/create/route.ts - Simplified version with better error handling

import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"

/**
 * Endpoint to create a new cycle for a token
 * This helps with positions that need to be tracked for selling
 */
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Parse request body
    const { token, initialState = "hold", currentPrice } = await request.json()

    // Validate required fields
    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Get user data by telegramId (not userId)
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if a cycle for this token already exists
    const existingCycle = await models.Cycle.findOne({
      userId: user._id,
      token: token,
      state: { $in: ["entry", "hold"] }
    })

    if (existingCycle) {
      logger.info(`Cycle already exists for ${token}`, {
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

    // If no price provided, use a default based on token
    let effectivePrice = currentPrice;
    if (!effectivePrice) {
      // Simple defaults for common tokens
      if (token === 'BTC') effectivePrice = 70000;
      else if (token === 'ETH') effectivePrice = 4000;
      else if (token === 'SOL') effectivePrice = 125;
      else effectivePrice = 100; // Generic default
    }

    // Create new cycle
    const newCycle = await models.Cycle.create({
      userId: user._id,
      token: token,
      state: initialState,
      entryPrice: effectivePrice,
      guidance: "Created for position tracking",
      createdAt: new Date(),
      updatedAt: new Date()
    })

    logger.info(`Created new cycle for ${token}`, {
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