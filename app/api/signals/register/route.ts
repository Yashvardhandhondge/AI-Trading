// app/api/signals/register/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"

// This endpoint will receive signals from your Python bot
export async function POST(request: NextRequest) {
  try {
    // Verify the request is authorized
    const authHeader = request.headers.get("Authorization")
    const expectedToken = process.env.API_SECRET || "3205bd9c55cf46effe51835123d875a22b82f5e2ca85842500aed88d65692b20"
    
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      logger.warn("Unauthorized signal registration attempt")
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    // Get signal data from request body
    const signalData = await request.json()
    
    // Validate required fields
    if (!signalData.type || !signalData.token || !signalData.price || !signalData.riskLevel) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    
    // Connect to database
    await connectToDatabase()
    
    // Check if signal already exists (to avoid duplicates)
    const existingSignal = await models.Signal.findOne({
      token: signalData.token,
      type: signalData.type,
      price: signalData.price,
      // Check if signal is still active (created within last 30 minutes)
      createdAt: { $gte: new Date(Date.now() - 30 * 60 * 1000) }
    })
    
    if (existingSignal) {
      logger.info(`Signal already exists for ${signalData.token}`)
      return NextResponse.json({ 
        success: true, 
        message: "Signal already exists", 
        signalId: existingSignal._id 
      })
    }
    
    // Create expiration time (30 minutes from now for tradeable signals)
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + 30)
    
    // Create new signal
    const newSignal = await models.Signal.create({
      type: signalData.type,
      token: signalData.token,
      price: signalData.price,
      riskLevel: signalData.riskLevel || "medium",
      createdAt: new Date(),
      expiresAt: expiresAt,
      autoExecuted: false,
      // Optional fields
      link: signalData.link,
      positives: signalData.positives || [],
      warnings: signalData.warnings || [],
      warning_count: signalData.warning_count || 0
    })
    
    logger.info(`Created new ${signalData.type} signal for ${signalData.token}`, {
      context: "SignalRegister",
      data: {
        token: signalData.token,
        price: signalData.price,
        riskLevel: signalData.riskLevel
      }
    })
    
    // Find all users who should receive this signal based on risk level and holdings
    let eligibleUsers = []
    
    if (signalData.type === "BUY") {
      // For BUY signals, find users with matching risk level
      eligibleUsers = await models.User.find({
        riskLevel: signalData.riskLevel,
        exchangeConnected: true
      })
    } else if (signalData.type === "SELL") {
      // For SELL signals, find users who own this token
      const usersWithExchange = await models.User.find({ 
        exchangeConnected: true 
      })
      
      for (const user of usersWithExchange) {
        const portfolio = await models.Portfolio.findOne({ userId: user._id })
        
        if (portfolio && portfolio.holdings) {
          const hasToken = portfolio.holdings.some((h: any) => 
            h.token === signalData.token && h.amount > 0
          )
          
          if (hasToken) {
            eligibleUsers.push(user)
          }
        }
      }
    }
    
    // Create notifications for eligible users
    for (const user of eligibleUsers) {
      await models.Notification.create({
        userId: user._id,
        type: "signal",
        message: `New ${signalData.type} signal for ${signalData.token} at ${signalData.price}`,
        relatedId: newSignal._id,
        createdAt: new Date(),
      })
    }
    
    logger.info(`Created notifications for ${eligibleUsers.length} users`)
    
    return NextResponse.json({ 
      success: true, 
      message: "Signal created and notifications sent", 
      signalId: newSignal._id,
      notifiedUsers: eligibleUsers.length
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    logger.error(`Error registering signal: ${errorMessage}`)
    return NextResponse.json({ error: "Failed to register signal" }, { status: 500 })
  }
}