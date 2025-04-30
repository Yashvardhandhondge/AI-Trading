// app/api/signals/list/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { EkinApiService } from "@/lib/ekin-api"
import { logger } from "@/lib/logger"

// Define signal types for TypeScript
interface Signal {
  id: string;
  type: "BUY" | "SELL";
  token: string;
  price: number;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
  expiresAt: string;
  autoExecuted: boolean;
  link?: string;
  positives?: string[];
  warnings?: string[];
  warning_count?: number;
}

// MongoDB document with _id field
interface SignalDocument extends Omit<Signal, "id"> {
  _id: any;
  toObject?: () => any;
}

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const includeExpired = searchParams.get("includeExpired") === "true"
    const riskLevel = searchParams.get("riskLevel") as "low" | "medium" | "high" | null
    const signalType = searchParams.get("type") as "BUY" | "SELL" | null
    const limit = searchParams.get("limit") ? parseInt(searchParams.get("limit") || "10") : 10

    // Extract user's current holdings (tokens they own) if exchange is connected
    let userHoldings: string[] = []
    if (user.exchangeConnected) {
      const portfolio = await models.Portfolio.findOne({ userId: user._id })
      if (portfolio && portfolio.holdings) {
        userHoldings = portfolio.holdings
          .filter((h: any) => h.amount > 0)  // Only include tokens with non-zero amounts
          .map((h: any) => h.token)
        
        logger.info(`User has holdings in tokens: ${userHoldings.join(', ')}`, { 
          context: "SignalFiltering", 
          userId: user._id.toString() 
        })
      }
    }

    // Build query for database search
    const query: Record<string, any> = {}
    
    // Only include active signals unless specifically asked for expired ones
    if (!includeExpired) {
      query.expiresAt = { $gt: new Date() }
    }
    
    // Filter by risk level if specified
    if (riskLevel) {
      query.riskLevel = riskLevel
    } else {
      // Default to user's risk level
      query.riskLevel = user.riskLevel || "medium"
    }
    
    // Filter by signal type if specified
    if (signalType) {
      query.type = signalType
    }

    // Get signals from database
    const dbSignals = await models.Signal.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)

    if (dbSignals && dbSignals.length > 0) {
      logger.info(`Found ${dbSignals.length} signals in database`, {
        context: "SignalsList",
        userId: user._id.toString()
      })
      
      // For SELL signals, only include ones for tokens the user owns
      const filteredSignals = dbSignals.map((signal: SignalDocument) => {
        // Convert MongoDB document to plain object and ensure dates are strings
        const plainSignal = signal.toObject ? signal.toObject() : signal;
        
        // Convert createdAt and expiresAt to ISO strings for consistent handling
        return {
          ...plainSignal,
          id: plainSignal._id.toString(),
          createdAt: new Date(plainSignal.createdAt).toISOString(),
          expiresAt: new Date(plainSignal.expiresAt).toISOString()
        };
      }).filter((signal: Signal) => {
        if (signal.type === "SELL") {
          return userHoldings.includes(signal.token)
        }
        return true // Keep all BUY signals
      })
      
      return NextResponse.json({ signals: filteredSignals })
    }
    
    // If no signals in database, try to get from Ekin API
    logger.info("No signals found in database, trying Ekin API", { 
      context: "SignalsList",
      userId: user._id.toString()
    })
    
    try {
      // Fetch fresh signals from Ekin API
      const apiSignals = await EkinApiService.getSignals()
      
      if (apiSignals && apiSignals.length > 0) {
        logger.info(`Fetched ${apiSignals.length} signals from Ekin API`, { 
          context: "SignalsList",
          userId: user._id.toString()
        })
        
        // Convert to app signals format
        const appSignals: Signal[] = apiSignals.map((ekinSignal: any) => {
          const appSignal = EkinApiService.convertToAppSignal(ekinSignal)
          
          // Create a unique ID for this signal based on properties
          const tempId = `temp_${appSignal.type}_${appSignal.token}_${appSignal.price}_${Date.now()}`
          
          return {
            ...appSignal,
            id: tempId,
            createdAt: new Date(appSignal.createdAt).toISOString(),
            expiresAt: new Date(appSignal.expiresAt).toISOString()
          } as Signal
        })
        
        // Filter by risk level if specified
        let filteredSignals = appSignals;
        if (riskLevel) {
          filteredSignals = filteredSignals.filter((s: Signal) => s.riskLevel === riskLevel);
        } else {
          // Default to user's risk level
          filteredSignals = filteredSignals.filter((s: Signal) => s.riskLevel === (user.riskLevel || "medium"));
        }
        
        // For SELL signals, only include ones for tokens the user owns
        filteredSignals = filteredSignals.filter((signal: Signal) => {
          if (signal.type === "SELL") {
            return userHoldings.includes(signal.token);
          }
          return true; // Keep all BUY signals
        });
        
        // Limit the number of signals
        filteredSignals = filteredSignals.slice(0, limit);
        
        // Store signals in database for future reference
        for (const signal of filteredSignals) {
          try {
            // Check if signal already exists
            const existingSignal = await models.Signal.findOne({
              token: signal.token,
              type: signal.type,
              price: signal.price,
              expiresAt: { $gt: new Date() },
            });
            
            if (!existingSignal) {
              await models.Signal.create(signal);
              logger.info(`Stored new ${signal.type} signal for ${signal.token} in database`, {
                context: "SignalsList"
              });
            }
          } catch (storeError) {
            logger.error(`Error storing signal in database: ${storeError instanceof Error ? storeError.message : "Unknown error"}`);
            // Continue with next signal
          }
        }
        
        return NextResponse.json({ signals: filteredSignals });
      }
    } catch (ekinError) {
      logger.error(
        "Error fetching from Ekin API:",
        ekinError instanceof Error ? ekinError : new Error(String(ekinError)),
        {
          context: "SignalsList",
          userId: user._id.toString()
        }
      );
      // Continue to return fallback or empty array
    }
    
    // If we still have no signals, return a few mock signals
    // This ensures users always have some signals to interact with in development
    if (process.env.NODE_ENV === "development") {
      logger.info("No signals found, generating mock signals for development", {
        context: "SignalsList"
      });
      
      // Create mock signals based on risk level
      const mockSignals: Signal[] = [];
      const userRiskLevel = riskLevel || user.riskLevel || "medium";
      
      // Mock BUY signal
      mockSignals.push({
        id: `mock_BUY_BTC_${Date.now()}`,
        type: "BUY",
        token: "BTC",
        price: 65000 + Math.floor(Math.random() * 1000),
        riskLevel: userRiskLevel as "low" | "medium" | "high",
        createdAt: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
        expiresAt: new Date(Date.now() + 8 * 60 * 1000).toISOString(), // 8 minutes from now
        autoExecuted: false
      });
      
      // Add a SELL signal for tokens the user owns
      if (userHoldings.length > 0) {
        const userToken = userHoldings[0];
        mockSignals.push({
          id: `mock_SELL_${userToken}_${Date.now()}`,
          type: "SELL",
          token: userToken,
          price: 1000 + Math.floor(Math.random() * 100),
          riskLevel: userRiskLevel as "low" | "medium" | "high",
          createdAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(), // 3 minutes ago
          expiresAt: new Date(Date.now() + 7 * 60 * 1000).toISOString(), // 7 minutes from now
          autoExecuted: false
        });
      }
      
      // Add another BUY signal with different token
      mockSignals.push({
        id: `mock_BUY_ETH_${Date.now()}`,
        type: "BUY",
        token: "ETH",
        price: 3500 + Math.floor(Math.random() * 100),
        riskLevel: userRiskLevel as "low" | "medium" | "high",
        createdAt: new Date(Date.now() - 1 * 60 * 1000).toISOString(), // 1 minute ago
        expiresAt: new Date(Date.now() + 9 * 60 * 1000).toISOString(), // 9 minutes from now
        autoExecuted: false
      });
      
      // Add an old signal (received more than 10 minutes ago)
      mockSignals.push({
        id: `mock_BUY_SOL_${Date.now()}`,
        type: "BUY",
        token: "SOL",
        price: 150 + Math.floor(Math.random() * 10),
        riskLevel: userRiskLevel as "low" | "medium" | "high",
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        expiresAt: new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString(), // Expired
        autoExecuted: false
      });
      
      return NextResponse.json({ signals: mockSignals.slice(0, limit) });
    }
    
    // In production, if we have no signals, just return an empty array
    return NextResponse.json({ signals: [] });
  } catch (error) {
    logger.error("Error fetching signals list:", error instanceof Error ? error : new Error(String(error)), {
      context: "SignalsList",
    });
    return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 });
  }
}