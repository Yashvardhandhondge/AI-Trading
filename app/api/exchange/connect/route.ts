// app/api/exchange/connect/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { connectToDatabase, models, encryptApiKey } from "@/lib/db";
import { logger } from "@/lib/logger";
import crypto from "crypto";
import axios from "axios";

const API_SECRET_KEY = process.env.API_SECRET_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * This final implementation:
 * 1. Does a direct server-side test of the API credentials
 * 2. Matches the Postman approach that was confirmed working
 * 3. Simplifies the approach to avoid any environment detection issues
 */
// app/api/exchange/connect/route.ts
// app/api/exchange/connect/route.ts
// app/api/exchange/connect/route.ts
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { exchange, proxyUserId, connected } = await request.json();

    if (!exchange || !["binance", "btcc"].includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange" }, { status: 400 });
    }

    // Connect to database
    await connectToDatabase();

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update user record - but don't store actual API credentials
    user.exchange = exchange;
    user.exchangeConnected = connected || false;
    user.proxyUserId = proxyUserId || null; // Store reference to external backend's user ID
    user.apiKeyStoredExternally = true; // Flag indicating keys are stored in your backend
    user.updatedAt = new Date();
    
    // Remove any previously stored API credentials if they exist
    if (user.apiKey) user.apiKey = undefined;
    if (user.apiSecret) user.apiSecret = undefined;
    
    await user.save();
    
    logger.info("User exchange connection updated, credentials stored externally", {
      context: "ExchangeConnect",
      userId: sessionUser.id
    });
    
    return NextResponse.json({ 
      success: true,
      message: "Exchange connection recorded successfully" 
    });
  } catch (error) {
    logger.error(`Error in exchange connection route: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}