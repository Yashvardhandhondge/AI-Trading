// app/api/proxy/binance/route.ts
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import crypto from "crypto";
import { getSessionUser } from "@/lib/auth";
import { connectToDatabase, models, decryptApiKey } from "@/lib/db";

const API_SECRET_KEY = process.env.API_SECRET_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// Always enable the proxy - this is a critical fix for Telegram WebApp environments
const ENABLE_PROXY = true;

export async function POST(request: NextRequest) {
  try {
    // Get authenticated user
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get the user's IP for logging
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    "unknown";
    
    logger.info(`Binance API proxy request from Telegram WebApp`, {
      context: "BinanceProxy",
      data: { userId: sessionUser.id, clientIp }
    });
    
    // Get endpoint and params from request
    const { endpoint, params, method = "GET" } = await request.json();
    
    // Get user from database to retrieve API credentials
    await connectToDatabase();
    const user = await models.User.findOne({ telegramId: sessionUser.id });
    
    if (!user || !user.apiKey || !user.apiSecret) {
      return NextResponse.json({ error: "API credentials not found" }, { status: 400 });
    }
    
    // Decrypt the API credentials
    let apiKey, apiSecret;
    try {
      apiKey = decryptApiKey(user.apiKey, API_SECRET_KEY);
      apiSecret = decryptApiKey(user.apiSecret, API_SECRET_KEY);
    } catch (error) {
      logger.error(`Failed to decrypt API credentials: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return NextResponse.json({ error: "Invalid API credentials format" }, { status: 400 });
    }
    
    // Add timestamp
    const timestamp = Date.now();
    const queryParams = {
      ...params,
      timestamp
    };
    
    // Create query string
    const queryString = Object.entries(queryParams)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
      .join("&");
    
    // Generate signature
    const signature = crypto
      .createHmac("sha256", apiSecret)
      .update(queryString)
      .digest("hex");
    
    // Construct final URL
    const baseUrl = "https://api.binance.com";
    const url = `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;
    
    logger.info(`Making server-side Binance API request to ${endpoint}`, {
      context: "BinanceProxy",
      userId: sessionUser.id,
      data: { method }
    });
    
    // Make the request to Binance FROM THE SERVER
    const response = await fetch(url, {
      method,
      headers: {
        "X-MBX-APIKEY": apiKey,
        // Set a variety of user agent and origin headers to bypass restrictions
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Origin": "https://ai-trading-three.vercel.app",
        "Referer": "https://ai-trading-three.vercel.app/"
      }
    });
    
    // Get response data
    let responseData;
    try {
      responseData = await response.json();
    } catch (error) {
      // Handle if not JSON
      const text = await response.text();
      responseData = { rawResponse: text };
    }
    
    // Log success or failure
    if (response.ok) {
      logger.info(`Server-side Binance API request successful: ${endpoint}`, {
        context: "BinanceProxy",
        userId: sessionUser.id,
        data: { statusCode: response.status }
      });
    } else {
      logger.error(`Server-side Binance API request failed: ${endpoint}`);
    }
    
    // Return the response with the same status code
    return NextResponse.json(responseData, { status: response.status });
    
  } catch (error) {
    logger.error(`Error in Binance proxy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    return NextResponse.json({ 
      error: "Proxy request failed",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 });
  }
}