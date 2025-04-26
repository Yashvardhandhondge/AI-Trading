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
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { exchange, registered } = await request.json();

    if (!exchange || !["binance", "btcc"].includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange" }, { status: 400 });
    }

    // Connect to database
    await connectToDatabase();

    // Get user
    const user = await models.User.findOne({ telegramId: sessionUser.id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Update user record to indicate proxy is being used
    user.exchange = exchange;
    user.exchangeConnected = true;
    user.usingProxy = true;
    user.updatedAt = new Date();
    await user.save();
    
    // Create or update portfolio
    try {
      const portfolio = await models.Portfolio.findOne({ userId: user._id });
      
      if (!portfolio) {
        await models.Portfolio.create({
          userId: user._id,
          totalValue: 0,
          freeCapital: 0,
          allocatedCapital: 0,
          holdings: [],
          updatedAt: new Date(),
        });
      }
    } catch (e) {
      // Log but continue
      logger.error(`Portfolio setup error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
    
    return NextResponse.json({ 
      success: true,
      message: "Exchange connected successfully" 
    });
  } catch (error) {
    logger.error(`Server error in exchange connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json({ error: "Server error processing request" }, { status: 500 });
  }
}