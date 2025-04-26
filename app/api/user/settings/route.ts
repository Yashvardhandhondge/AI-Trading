// app/api/user/settings/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"

/**
 * API endpoint to get user settings and exchange connection status
 */
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

    // Check if exchange is still connected via proxy
    let exchangeConnected = user.exchangeConnected || false
    
    if (exchangeConnected) {
      try {
        // Verify the connection with the proxy server
        const isConnected = await tradingProxy.checkApiKeyStatus(sessionUser.id)
        
        // If the status has changed in the proxy, update our database
        if (isConnected !== exchangeConnected) {
          user.exchangeConnected = isConnected
          await user.save()
          exchangeConnected = isConnected
          
          logger.info(`Updated exchange connection status to ${isConnected}`, {
            context: "UserSettings",
            userId: sessionUser.id
          })
        }
      } catch (error) {
        // Log the error but don't fail the request
        logger.warn(`Error checking exchange connection: ${error instanceof Error ? error.message : "Unknown error"}`, {
          context: "UserSettings",
          userId: sessionUser.id
        })
      }
    }

    // Return the settings
    return NextResponse.json({
      riskLevel: user.riskLevel || "medium",
      exchange: user.exchange || "binance",
      exchangeConnected,
      autoTradeEnabled: user.autoTradeEnabled || false
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error : "Unknown error"
    logger.error(`Error fetching user settings: ${errorMessage}`)
    
    return NextResponse.json({ error: "Failed to fetch user settings" }, { status: 500 })
  }
}

/**
 * API endpoint to update user settings
 */
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { riskLevel, autoTradeEnabled } = await request.json()
    const updateData: Record<string, any> = { updatedAt: new Date() }

    // Validate and add risk level if provided
    if (riskLevel !== undefined) {
      if (!["low", "medium", "high"].includes(riskLevel)) {
        return NextResponse.json({ error: "Invalid risk level" }, { status: 400 })
      }
      updateData.riskLevel = riskLevel
    }

    // Add auto-trade setting if provided
    if (autoTradeEnabled !== undefined) {
      if (typeof autoTradeEnabled !== "boolean") {
        return NextResponse.json({ error: "Invalid auto-trade setting" }, { status: 400 })
      }
      updateData.autoTradeEnabled = autoTradeEnabled
    }

    // Connect to database
    await connectToDatabase()

    // Update user settings
    await models.User.findOneAndUpdate(
      { telegramId: sessionUser.id }, 
      updateData
    )

    logger.info(`User settings updated`, {
      context: "UserSettings",
      userId: sessionUser.id,
      data: updateData
    })

    return NextResponse.json({ 
      success: true,
      message: "Settings updated successfully"
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error : "Unknown error"
    logger.error(`Error updating user settings: ${errorMessage}`)
    
    return NextResponse.json({ error: "Failed to update user settings" }, { status: 500 })
  }
}