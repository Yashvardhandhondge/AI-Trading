
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"
import mongoose from "mongoose"

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = params

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Validate ID before querying
    let signal
    
    if (mongoose.isValidObjectId(id)) {
      // If it's a valid ObjectId, query directly
      signal = await models.Signal.findById(id)
    } else {
      // Handle temporary IDs
      logger.warn(`Non-MongoDB ObjectId format received: ${id}`, {
        context: "SignalFetch",
        userId: sessionUser.id
      })
      
      // For temporary IDs with format like temp_BUY_BTC_50000_timestamp
      if (id.startsWith('temp_')) {
        // Extract parameters from the temporary ID
        const parts = id.split('_')
        if (parts.length >= 4) {
          const type = parts[1]
          const token = parts[2]
          
          // Try to find a matching signal
          signal = await models.Signal.findOne({
            type,
            token,
            // Only recent signals
            createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
          }).sort({ createdAt: -1 }) // Get the most recent one
          
          if (signal) {
            logger.info(`Found matching signal for temporary ID: ${id} → ${signal._id}`, {
              context: "SignalFetch",
              userId: sessionUser.id
            })
          }
        }
      }
    }

    if (!signal) {
      return NextResponse.json({ error: "Signal not found" }, { status: 404 })
    }

    // Check if the signal is within the 10-minute execution window
    const createdAt = new Date(signal.createdAt)
    const now = new Date()
    const tenMinutesLater = new Date(createdAt.getTime() + 10 * 60 * 1000)
    const canExecute = now < tenMinutesLater

    // Format signal data for response
    const signalData = {
      ...signal.toObject(),
      id: signal._id.toString(),
      createdAt: signal.createdAt.toISOString(),
      expiresAt: signal.expiresAt.toISOString(),
      canExecute
    }

    return NextResponse.json({ signal: signalData })
  } catch (error) {
    logger.error(`Error fetching signal: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to fetch signal" }, { status: 500 })
  }
}