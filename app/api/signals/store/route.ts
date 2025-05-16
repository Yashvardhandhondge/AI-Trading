
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

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Check if user is admin (only admins can store signals directly)
    if (!user.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }
    
    // Get signal data from request body
    const signalData = await request.json()
    
    // Validate required fields
    if (!signalData.type || !signalData.token || !signalData.price || 
        !signalData.riskLevel || !signalData.expiresAt) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    
    // Check if signal already exists (to avoid duplicates)
    const existingSignal = await models.Signal.findOne({
      token: signalData.token,
      type: signalData.type,
      price: signalData.price,
      // Check if signal is still active
      expiresAt: { $gt: new Date() }
    })
    
    if (existingSignal) {
      return NextResponse.json({ 
        success: true, 
        message: "Signal already exists", 
        signalId: existingSignal._id 
      })
    }
    
    // Create new signal
    const newSignal = await models.Signal.create({
      type: signalData.type,
      token: signalData.token,
      price: signalData.price,
      riskLevel: signalData.riskLevel,
      createdAt: new Date(),
      expiresAt: new Date(signalData.expiresAt),
      autoExecuted: false,
      // Optional fields
      link: signalData.link,
      positives: signalData.positives,
      warnings: signalData.warnings,
      warning_count: signalData.warning_count
    })
    
    logger.info(`Created new ${signalData.type} signal for ${signalData.token}`, {
      context: "SignalStore",
      data: {
        token: signalData.token,
        price: signalData.price,
        riskLevel: signalData.riskLevel
      }
    })
    
    // TODO: Create notifications for relevant users here
    // This will be implemented as part of the notification solution
    
    return NextResponse.json({ 
      success: true, 
      message: "Signal created", 
      signalId: newSignal._id 
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    logger.error(`Error storing signal: ${errorMessage}`)
    return NextResponse.json({ error: "Failed to store signal" }, { status: 500 })
  }
}