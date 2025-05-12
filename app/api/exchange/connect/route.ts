// app/api/exchange/connect/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser, createSessionToken, setSessionCookie, type SessionUser } from "@/lib/auth";
import { connectToDatabase, models } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * This endpoint handles updating the user's record after API keys have been registered with the proxy server
 * It does NOT require the actual API keys since those are stored on the proxy server
 */
export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get request data
    const { exchange, connected } = await request.json();

    // Validate exchange if provided
    if (exchange && !["binance", "btcc"].includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange" }, { status: 400 });
    }

    // Connect to database
    await connectToDatabase();

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update user record - don't store actual API credentials in our database
    if (exchange) {
      user.exchange = exchange;
    }
    
    // Update connection status
    user.exchangeConnected = connected !== undefined ? connected : true;
    user.apiKeyStoredExternally = true; // Flag indicating keys are stored in proxy
    user.updatedAt = new Date();
    
    // Remove any previously stored API credentials if they exist
    if (user.apiKey) user.apiKey = undefined;
    if (user.apiSecret) user.apiSecret = undefined;
    
    await user.save();
    
    // Create updated session user with new exchange connection status
    const updatedSessionUser: SessionUser = {
      ...sessionUser,
      exchange: user.exchange,
      exchangeConnected: true,
      riskLevel: user.riskLevel
    };
    
    // Create new session token with updated data
    const newToken = await createSessionToken(updatedSessionUser);
    
    logger.info("User exchange connection updated successfully", {
      context: "ExchangeConnect",
      userId: sessionUser.id
    });
    
    // Return response with updated session cookie
    const response = NextResponse.json({ 
      success: true,
      message: "Exchange connection updated successfully"
    });
    
    return setSessionCookie(newToken, response);
  } catch (error) {
    logger.error(`Error in exchange connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}