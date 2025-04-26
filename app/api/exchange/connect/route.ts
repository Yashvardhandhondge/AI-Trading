// route.ts - /api/exchange/connect
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { connectToDatabase, models, encryptApiKey } from "@/lib/db";
import { ExchangeService } from "@/lib/exchange";
import { logger } from "@/lib/logger";

const API_SECRET_KEY = process.env.API_SECRET_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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

    // Log connection attempt (without sensitive data)
    logger.info(`Attempting to connect to ${exchange}`, {
      context: "ExchangeConnect",
      userId: sessionUser.id,
      data: { exchange }
    });

    // Connect to database first
    await connectToDatabase();

    // Get current user data
    const user = await models.User.findOne({ telegramId: sessionUser.id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Validate exchange connection with enhanced error handling
    try {
      // Create exchange service with client IP logging
      const userIP = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    request.headers.get('x-real-ip') || 
                    "unknown";
      
      logger.info(`Connection attempt from IP: ${userIP}`, {
        context: "ExchangeConnect",
        userId: sessionUser.id
      });
      
      const exchangeService = new ExchangeService(exchange, { apiKey, apiSecret });
      const isValid = await exchangeService.validateConnection();
    
      if (!isValid) {
        logger.error(`Failed to validate ${exchange} connection`);
        return NextResponse.json({ 
          error: `Connection validation failed. Please ensure Vercel's IP range (76.76.21.0/24) and your IP (${userIP}) are whitelisted in your exchange settings.`,
          code: "VALIDATION_FAILED" 
        }, { status: 400 });
      }

      // Connection successful, encrypt and store credentials
      logger.info(`Successfully connected to ${exchange}`, {
        context: "ExchangeConnect",
        userId: sessionUser.id
      });

      // Encrypt API credentials
      const encryptedApiKey = encryptApiKey(apiKey, API_SECRET_KEY);
      const encryptedApiSecret = encryptApiKey(apiSecret, API_SECRET_KEY);

      // Update user with exchange info
      user.exchange = exchange;
      user.apiKey = encryptedApiKey;
      user.apiSecret = encryptedApiSecret;
      user.exchangeConnected = true;
      user.updatedAt = new Date();
      await user.save();

      // Initialize portfolio
      try {
        const portfolio = await models.Portfolio.findOne({ userId: user._id });
        
        if (!portfolio) {
          // Fetch initial portfolio data
          const portfolioData = await exchangeService.getPortfolio();
          
          await models.Portfolio.create({
            userId: user._id,
            totalValue: portfolioData.totalValue,
            freeCapital: portfolioData.freeCapital,
            allocatedCapital: portfolioData.allocatedCapital,
            holdings: portfolioData.holdings,
            updatedAt: new Date(),
          });
          
          logger.info("Created new portfolio for user", {
            context: "ExchangeConnect",
            userId: sessionUser.id
          });
        } else {
          // Update existing portfolio
          const portfolioData = await exchangeService.getPortfolio();
          
          portfolio.totalValue = portfolioData.totalValue;
          portfolio.freeCapital = portfolioData.freeCapital;
          portfolio.allocatedCapital = portfolioData.allocatedCapital;
          portfolio.holdings = portfolioData.holdings;
          portfolio.updatedAt = new Date();
          await portfolio.save();
          
          logger.info("Updated existing portfolio for user", {
            context: "ExchangeConnect",
            userId: sessionUser.id
          });
        }
      } catch (portfolioError) {
        // Log portfolio error but continue with the connection process
        logger.error(`Error initializing portfolio: ${portfolioError instanceof Error ? portfolioError.message : 'Unknown error'}`);
      }

      return NextResponse.json({ 
        success: true,
        message: "Exchange connected successfully" 
      });
      
    } catch (error) {
      // Detailed error logging
      logger.error(`Exchange connection error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      let errorMessage = "Failed to connect to exchange";
      let errorCode = "UNKNOWN_ERROR";
      
      if (error instanceof Error) {
        // Parse for specific error conditions
        const errorString = error.message.toLowerCase();
        
        if (errorString.includes("ip restricted") || errorString.includes("whitelist")) {
          errorMessage = "IP restriction detected. Please add Vercel's IP range (76.76.21.0/24) to your exchange API settings.";
          errorCode = "IP_RESTRICTED";
        } else if (errorString.includes("key") || errorString.includes("signature") || 
                  errorString.includes("authentication failed") || errorString.includes("invalid api")) {
          errorMessage = "Invalid API key or secret. Please double-check your credentials.";
          errorCode = "INVALID_CREDENTIALS";
        } else if (errorString.includes("permission") || errorString.includes("unauthorized")) {
          errorMessage = "API key doesn't have trading permissions. Please enable trading for your API key.";
          errorCode = "INSUFFICIENT_PERMISSIONS";
        } else if (errorString.includes("timeout") || errorString.includes("timed out")) {
          errorMessage = "Connection timed out. Please try again later.";
          errorCode = "CONNECTION_TIMEOUT";
        } else if (errorString.includes("banned") || errorString.includes("banned")) {
          errorMessage = "Your IP has been temporarily banned by the exchange. Please try again later.";
          errorCode = "IP_BANNED";
        } else if (errorString.includes("rate limit")) {
          errorMessage = "Rate limit exceeded. Please try again in a few minutes.";
          errorCode = "RATE_LIMIT_EXCEEDED";
        }
      }
      
      return NextResponse.json({ 
        error: errorMessage, 
        code: errorCode 
      }, { status: 400 });
    }
  } catch (error) {
    logger.error(`Unexpected error in exchange connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return NextResponse.json({ error: "Failed to connect exchange", code: "SERVER_ERROR" }, { status: 500 });
  }
}