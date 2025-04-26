// app/api/exchange/connect/route.ts
import { type NextRequest, NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { connectToDatabase, models, encryptApiKey } from "@/lib/db";
import { ExchangeService } from "@/lib/exchange";
import { TelegramExchangeService } from "@/lib/exchange-telegram";
import { logger } from "@/lib/logger";

const API_SECRET_KEY = process.env.API_SECRET_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser();

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { exchange, apiKey, apiSecret, isTelegramWebApp } = await request.json();

    if (!exchange || !["binance", "btcc"].includes(exchange)) {
      return NextResponse.json({ error: "Invalid exchange" }, { status: 400 });
    }

    if (!apiKey || !apiSecret) {
      return NextResponse.json({ error: "API key and secret are required" }, { status: 400 });
    }

    // Get client IP and user agent
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0] || 
                   request.headers.get('x-real-ip') || 
                   "unknown";
    const userAgent = request.headers.get('user-agent') || "unknown";
    
    // Log connection attempt
    logger.info(`Attempting to connect to ${exchange}`, {
      context: "ExchangeConnect",
      userId: sessionUser.id,
      data: { 
        exchange,
        clientIp,
        isTelegram: !!isTelegramWebApp,
        // Indicate if this is likely a Telegram WebApp based on user agent
        detectedTelegram: userAgent.includes("Telegram") || userAgent.includes("TelegramBot")
      }
    });

    // Connect to database first
    await connectToDatabase();

    // Get current user data
    const user = await models.User.findOne({ telegramId: sessionUser.id });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Detect if this is a Telegram WebApp request
    const isTelegram = isTelegramWebApp || 
                     userAgent.includes("Telegram") || 
                     userAgent.includes("TelegramBot");
    
    // Choose the appropriate service based on environment
    let isValid = false;
    let portfolioData = null;
    
    // Validate exchange connection using the appropriate service
    try {
      if (isTelegram) {
        logger.info("Using Telegram-compatible exchange service for connection", {
          context: "ExchangeConnect",
          userId: sessionUser.id
        });
        
        // Use the Telegram-specific service that uses the server-side proxy
        const telegramExchangeService = new TelegramExchangeService(exchange, { apiKey, apiSecret });
        isValid = await telegramExchangeService.validateConnection();
        
        if (isValid) {
          // Get portfolio data while we have a valid connection
          portfolioData = await telegramExchangeService.getPortfolio();
        }
      } else {
        logger.info("Using standard exchange service for connection", {
          context: "ExchangeConnect", 
          userId: sessionUser.id
        });
        
        // Use the standard service for direct browser connections
        const exchangeService = new ExchangeService(exchange, { apiKey, apiSecret });
        isValid = await exchangeService.validateConnection();
        
        if (isValid) {
          // Get portfolio data while we have a valid connection
          portfolioData = await exchangeService.getPortfolio();
        }
      }
      
      if (!isValid) {
        logger.error(`Failed to validate ${exchange} connection`);
        
        // Special message for Telegram users
        if (isTelegram) {
          return NextResponse.json({ 
            error: "Connection validation failed. Please ensure your API key has trading permissions enabled.",
            code: "VALIDATION_FAILED" 
          }, { status: 400 });
        } else {
          return NextResponse.json({ 
            error: `Connection validation failed. Please ensure Vercel's IP range (76.76.21.0/24) and your IP (${clientIp}) are whitelisted in your exchange settings.`,
            code: "VALIDATION_FAILED" 
          }, { status: 400 });
        }
      }

      // Connection successful, encrypt and store credentials
      logger.info(`Successfully connected to ${exchange}`, {
        context: "ExchangeConnect",
        userId: sessionUser.id,
        data: { isTelegram }
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
        if (portfolioData) {
          const portfolio = await models.Portfolio.findOne({ userId: user._id });
          
          if (!portfolio) {
            // Create new portfolio
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
          errorMessage = isTelegram 
            ? "IP restriction detected. Please try again - our system is using a special connection method for Telegram."
            : `IP restriction detected. Please whitelist Vercel's IP range (76.76.21.0/24) and your IP (${clientIp}) in your exchange settings.`;
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