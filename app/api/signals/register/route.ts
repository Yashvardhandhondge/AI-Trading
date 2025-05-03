// app/api/signals/register/route.ts
import { NextResponse } from "next/server"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"

// Secret key for authentication
const API_SECRET = process.env.API_SECRET || "your-api-secret-key"

export async function POST(request: Request) {
  try {
    // Validate the request
    const authHeader = request.headers.get("Authorization")
    
    if (authHeader !== `Bearer ${API_SECRET}`) {
      logger.warn("Unauthorized signal registration attempt", { context: "SignalRegistration" })
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    
    // Parse signal data
    const signalData = await request.json()
    
    // Validate required fields
    if (!signalData.token || !signalData.price || !signalData.type) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }
    
    // Connect to database
    await connectToDatabase()
    
    // Validate the symbol on Binance before accepting it
    const testUser = await models.User.findOne({ isAdmin: true })
    
    if (testUser) {
      try {
        const symbol = `${signalData.token}USDT`
        const isValid = await tradingProxy.validateSymbol(testUser.telegramId, symbol)
        
        if (!isValid) {
          logger.warn(`Rejected invalid symbol signal: ${signalData.token}`, {
            context: "SignalRegistration"
          })
          return NextResponse.json({ 
            error: "Invalid trading symbol", 
            token: signalData.token 
          }, { status: 400 })
        }
      } catch (error) {
        // Log the error but continue - we don't want to block signals if validation temporarily fails
        logger.error(`Error validating symbol ${signalData.token}: ${error instanceof Error ? error.message : "Unknown error"}`)
      }
    }
    
    // Check if signal already exists
    const existingSignal = await models.Signal.findOne({
      token: signalData.token,
      type: signalData.type,
      price: signalData.price,
      expiresAt: { $gt: new Date() }
    })
    
    if (existingSignal) {
      return NextResponse.json({ 
        success: true, 
        status: "exists",
        signalId: existingSignal._id
      })
    }
    
    // Prepare signal data
    const signalRecord = {
      token: signalData.token,
      type: signalData.type,
      price: signalData.price,
      riskLevel: signalData.riskLevel || "medium",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes expiry
      autoExecuted: false,
      link: signalData.link,
      positives: signalData.positives || [],
      warnings: signalData.warnings || [],
      warning_count: signalData.warning_count || 0
    }
    
    // Create new signal
    const signal = await models.Signal.create(signalRecord)
    
    logger.info(`Created new ${signalData.type} signal for ${signalData.token}`, {
      context: "SignalRegistration",
      data: {
        token: signalData.token,
        price: signalData.price,
        riskLevel: signalData.riskLevel
      }
    })
    
    // Notify users based on risk level for BUY signals or token holdings for SELL signals
    if (signalData.type === "BUY") {
      // Find users with matching risk level
      const eligibleUsers = await models.User.find({
        riskLevel: signalRecord.riskLevel
      })
      
      // Create notifications
      for (const user of eligibleUsers) {
        // Check if user has already received a signal for this token in the last 24 hours
        const hasRecentSignal = user.lastSignalTokens && user.lastSignalTokens.some(
          (item: any) =>
            item.token === signalData.token &&
            new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000,
        )
        
        if (!hasRecentSignal) {
          await models.Notification.create({
            userId: user._id,
            type: "signal",
            message: `New ${signalData.type} signal for ${signalData.token} at ${signalData.price}`,
            relatedId: signal._id,
            createdAt: new Date(),
          })
          
          // Record that we've sent this token to this user
          if (!user.lastSignalTokens) {
            user.lastSignalTokens = []
          }
          
          user.lastSignalTokens.push({
            token: signalData.token,
            timestamp: new Date()
          })
          
          await user.save()
        }
      }
    } else if (signalData.type === "SELL") {
      // For SELL signals, only notify users who own this token
      const usersWithExchange = await models.User.find({ exchangeConnected: true })
      
      for (const user of usersWithExchange) {
        // Find user's portfolio
        const portfolio = await models.Portfolio.findOne({ userId: user._id })
        
        if (portfolio && portfolio.holdings) {
          // Check if user owns this token
          const hasToken = portfolio.holdings.some((h: any) => 
            h.token === signalData.token && h.amount > 0
          )
          
          if (hasToken) {
            await models.Notification.create({
              userId: user._id,
              type: "signal",
              message: `New ${signalData.type} signal for ${signalData.token} at ${signalData.price}`,
              relatedId: signal._id,
              createdAt: new Date(),
            })
          }
        }
      }
    }
    
    return NextResponse.json({
      success: true,
      status: "created",
      signalId: signal._id
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    logger.error(`Error registering signal: ${errorMessage}`)
    
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 })
  }
}