// app/api/trading/proxy/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { connectToDatabase, models, decryptApiKey } from "@/lib/db";
import { logger } from "@/lib/logger";
import crypto from "crypto";
import axios from "axios";

const API_SECRET_KEY = process.env.API_SECRET_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

/**
 * This is a single centralized proxy endpoint for ALL Binance API calls
 * It eliminates IP issues by:
 * 1. Running on the server
 * 2. Making requests with consistent headers
 * 3. Using the session user's credentials from the database
 */
export async function POST(request: NextRequest) {
  try {
    // Get the authenticated user
    const sessionUser = await getSessionUser();
    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse the request
    const { 
      endpoint = "/api/v3/account",  // Default to account info
      method = "GET",                // Default to GET
      params = {}                    // Default to empty params
    } = await request.json();

    // Connect to database
    await connectToDatabase();
    
    // Get user data with API keys
    const user = await models.User.findOne({ telegramId: sessionUser.id });
    if (!user || !user.apiKey || !user.apiSecret || !user.exchangeConnected) {
      return NextResponse.json({ error: "No exchange connection found" }, { status: 400 });
    }
    
    try {
      // Decrypt API credentials
      const apiKey = decryptApiKey(user.apiKey, API_SECRET_KEY);
      const apiSecret = decryptApiKey(user.apiSecret, API_SECRET_KEY);
      
      // Log the request (without credentials)
      logger.info(`Trading proxy request: ${method} ${endpoint}`, {
        context: "TradingProxy",
        userId: sessionUser.id
      });
      
      // Add timestamp
      const timestamp = Date.now();
      const requestParams = {
        ...params,
        timestamp
      };
      
      // Create query string
      const queryString = Object.entries(requestParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
        .join("&");
      
      // Generate signature
      const signature = crypto
        .createHmac("sha256", apiSecret)
        .update(queryString)
        .digest("hex");
      
      // Full URL with signature
      const url = `https://api.binance.com${endpoint}?${queryString}&signature=${signature}`;
      
      // Make the request using axios
      const response = await axios({
        method,
        url,
        headers: {
          "X-MBX-APIKEY": apiKey,
          // Add specific headers that help with IP issues
          "User-Agent": "Mozilla/5.0 CycleTrader/1.0",
          "Accept": "application/json"
        },
        timeout: 10000,
        validateStatus: () => true // Allow any status code to be processed
      });
      
      // Return the response data and status
      return NextResponse.json({
        success: response.status >= 200 && response.status < 300,
        statusCode: response.status,
        data: response.data
      }, { 
        status: response.status 
      });
    } catch (error) {
      logger.error(`Trading proxy error: ${error instanceof Error ? error.message : "Unknown error"}`, {
        context: "TradingProxy",
        userId: sessionUser.id
      });
      
      if (axios.isAxiosError(error)) {
        // Return the error response directly
        return NextResponse.json({
          success: false,
          statusCode: error.response?.status || 500,
          error: error.response?.data || error.message,
          message: "API request failed"
        }, { 
          status: error.response?.status || 500 
        });
      }
      
      return NextResponse.json({
        success: false,
        error: "Request failed",
        message: error instanceof Error ? error.message : "Unknown error"
      }, { 
        status: 500 
      });
    }
  } catch (error) {
    logger.error(`Server error in trading proxy: ${error instanceof Error ? error.message : "Unknown error"}`);
    return NextResponse.json({
      success: false,
      error: "Server error",
      message: error instanceof Error ? error.message : "Unknown error"
    }, { 
      status: 500 
    });
  }
}