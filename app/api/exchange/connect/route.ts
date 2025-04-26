// app/api/exchange/connect/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { connectToDatabase, models } from "@/lib/db";
import { logger } from "@/lib/logger";
import { tradingProxy } from "@/lib/trading-proxy";

/**
 * This endpoint handles connecting a user's exchange API keys:
 * 1. Validates and stores API keys in the external proxy server
 * 2. Updates the user's record in MongoDB with exchange info
 * 3. Does NOT store actual API keys in our database for security
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request data
    const { exchange, apiKey, apiSecret } = await request.json();

    // Validate request
    if (!exchange || !["binance", "btcc"].includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange" }, { status: 400 });
    }

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "API key and secret are required" }, { status: 400 });
    }

    // Connect to database
    await connectToDatabase();

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    try {
      // Store the API key in the proxy server using the user's ID as identifier
      const registrationSuccess = await tradingProxy.registerApiKey(
        sessionUser.id.toString(),
        apiKey,
        apiSecret,
        exchange
      );

      if (!registrationSuccess) {
        throw new Error("Failed to register API keys with proxy server");
      }

      // Update user record - don't store actual API credentials in our database
      user.exchange = exchange;
      user.exchangeConnected = true;
      user.apiKeyStoredExternally = true; // Flag indicating keys are stored in proxy
      user.updatedAt = new Date();
      
      // Remove any previously stored API credentials if they exist
      if (user.apiKey) user.apiKey = undefined;
      if (user.apiSecret) user.apiSecret = undefined;
      
      await user.save();
      
      logger.info("User exchange connection updated successfully", {
        context: "ExchangeConnect",
        userId: sessionUser.id
      });
      
      return NextResponse.json({ 
        success: true,
        message: "Exchange connected successfully"
      });
    } catch (proxyError) {
      logger.error(`API key registration with proxy failed: ${proxyError instanceof Error ? proxyError.message : 'Unknown error'}`);
      
      return NextResponse.json({ 
        error: proxyError instanceof Error ? proxyError.message : "Failed to register API keys with proxy server"
      }, { status: 502 });
    }
  } catch (error) {
    logger.error(`Error in exchange connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}