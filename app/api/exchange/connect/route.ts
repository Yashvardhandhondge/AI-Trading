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
export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { exchange, apiKey, apiSecret } = await request.json();

    if (!exchange || !["binance", "btcc"].includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange" }, { status: 400 });
    }

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "API key and secret are required" }, { status: 400 });
    }

    // Get client IP for logging
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   request.headers.get('x-real-ip') || 
                   "unknown";
                   
    // Log attempt
    logger.info(`Direct connect attempt from ${clientIp} for ${exchange}`, {
      context: "ExchangeConnect",
      userId: sessionUser.id
    });

    // Connect to database
    await connectToDatabase();

    // Get user
    const user = await models.User.findOne({ telegramId: sessionUser.id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Test connection directly from server
    try {
      // Generate parameters
      const timestamp = Date.now();
      const queryString = `timestamp=${timestamp}`;
      
      // Generate signature
      const signature = crypto
        .createHmac("sha256", apiSecret)
        .update(queryString)
        .digest("hex");
      
      // URL with signature
      const url = `https://api.binance.com/api/v3/account?${queryString}&signature=${signature}`;
      
      // Make direct request (like in Postman)
      const response = await axios.get(url, {
        headers: {
          "X-MBX-APIKEY": apiKey,
          "User-Agent": "Mozilla/5.0 CycleTrader/1.0",
          "Accept": "application/json"
        },
        timeout: 10000
      });
      
      // If we get here, the connection worked
      logger.info(`Direct API test successful for ${exchange}`, {
        context: "ExchangeConnect",
        userId: sessionUser.id
      });
      
      // Store credentials
      const encryptedApiKey = encryptApiKey(apiKey, API_SECRET_KEY);
      const encryptedApiSecret = encryptApiKey(apiSecret, API_SECRET_KEY);
      
      user.exchange = exchange;
      user.apiKey = encryptedApiKey;
      user.apiSecret = encryptedApiSecret;
      user.exchangeConnected = true;
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
      logger.error(`Direct API test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      let errorMessage = "Failed to connect to exchange";
      
      if (axios.isAxiosError(error)) {
        // Get specific error information
        const status = error.response?.status;
        const data = error.response?.data;
        
        if (status === 401) {
          errorMessage = "Invalid API key. Please check your API key.";
        } else if (status === 403) {
          errorMessage = "API key doesn't have sufficient permissions. Please enable trading permissions.";
        } else if (status === 451) {
          errorMessage = `This IP is not authorized. Please add your IP (and ${clientIp}) to the API whitelist.`;
        } else if (data?.msg) {
          errorMessage = data.msg;
        }
        
        logger.error(`Binance API error (${status}): ${JSON.stringify(data)}`, {
          context: "ExchangeConnect",
          userId: sessionUser.id
        });
      }
      
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }
  } catch (error) {
    logger.error(`Server error in exchange connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json({ error: "Server error processing request" }, { status: 500 });
  }
}