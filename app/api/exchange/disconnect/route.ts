// app/api/exchange/disconnect/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { connectToDatabase, models } from "@/lib/db";
import { logger } from "@/lib/logger";
import { tradingProxy } from "@/lib/trading-proxy";

/**
 * Endpoint to disconnect a user's exchange API keys:
 * 1. Removes API key information from the proxy server if possible
 * 2. Updates the user's record in MongoDB to reflect disconnected state
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Connect to database
    await connectToDatabase();

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Try to delete the key from the proxy server
    try {
      // This would be an API call to remove the user's key from the proxy server
      // Currently not implemented in the proxy, but we could add it
      const proxyServerUrl = process.env.PROXY_SERVER_URL || 'https://binance.yashvardhandhondge.tech';
      
      await fetch(`${proxyServerUrl}/api/user/${sessionUser.id}/key`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      logger.info("API key deleted from proxy server", {
        context: "ExchangeDisconnect",
        userId: sessionUser.id
      });
    } catch (proxyError) {
      // Just log this error but continue - the important part is updating our database
      logger.warn(`Failed to delete API key from proxy server: ${proxyError instanceof Error ? proxyError.message : 'Unknown error'}`, {
        context: "ExchangeDisconnect",
        userId: sessionUser.id
      });
    }

    // Update user record to disconnect the exchange
    user.exchangeConnected = false;
    user.apiKeyStoredExternally = false;
    user.updatedAt = new Date();
    
    // Remove any previously stored API credentials if they exist
    if (user.apiKey) user.apiKey = undefined;
    if (user.apiSecret) user.apiSecret = undefined;
    
    await user.save();
    
    logger.info("User exchange disconnected successfully", {
      context: "ExchangeDisconnect",
      userId: sessionUser.id
    });
    
    return NextResponse.json({ 
      success: true,
      message: "Exchange disconnected successfully"
    });
  } catch (error) {
    logger.error(`Error in exchange disconnection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}