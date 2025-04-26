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

    const { exchange, proxyUserId, connected } = await request.json()

    if (!exchange || !["binance", "btcc"].includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange" }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Get current user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Update user record with the exchange type and proxy info
    user.exchange = exchange;
    user.exchangeConnected = connected || user.exchangeConnected || false;
    
    if (proxyUserId) {
      user.proxyUserId = proxyUserId;
      user.apiKeyStoredExternally = true;
      
      // Remove any previously stored API credentials for security
      if (user.apiKey) user.apiKey = undefined;
      if (user.apiSecret) user.apiSecret = undefined;
    }
    
    user.updatedAt = new Date();
    await user.save();
    
    logger.info("User exchange settings updated", {
      context: "ExchangeUpdate",
      userId: sessionUser.id
    });

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error(`Error updating exchange: ${error instanceof Error ? error.message : "Unknown error"}`);
    return NextResponse.json({ error: "Failed to update exchange" }, { status: 500 })
  }
}
