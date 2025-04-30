// app/api/signals/latest/route.ts - Fixed to prevent duplicate notifications and invalid prices
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { EkinApiService } from "@/lib/ekin-api"
import { logger } from "@/lib/logger"

// Define types for TypeScript
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

// Store a registry of recent checks to prevent repeated notifications
// This uses memory storage which will reset on server restart, but helps during runtime
const lastNotifiedSignals: Map<string, number> = new Map();
const NOTIFICATION_COOLDOWN = 30 * 60 * 1000; // 30 minutes cooldown

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
    const sinceParam = searchParams.get("since")
    const since = sinceParam ? parseInt(sinceParam) : Date.now() - 5 * 60 * 1000 // Default to 5 minutes ago
    
    // Add a cache-busting parameter to prevent stale data
    // This is ignored in the actual logic but ensures fetch requests aren't cached
    const cacheBuster = searchParams.get("_t")
    
    // Validate since parameter
    if (isNaN(since)) {
      return NextResponse.json({ error: "Invalid 'since' parameter" }, { status: 400 })
    }
    
    // Create a date from the timestamp
    const sinceDate = new Date(since)
    
    // Extract user's current holdings (tokens they own) if exchange is connected
    let userHoldings: string[] = []
    if (user.exchangeConnected) {
      const portfolio = await models.Portfolio.findOne({ userId: user._id })
      if (portfolio && portfolio.holdings) {
        userHoldings = portfolio.holdings
          .filter((h: any) => h.amount > 0)  // Only include tokens with non-zero amounts
          .map((h: any) => h.token)
        
        logger.info(`User has holdings in tokens: ${userHoldings.join(', ')}`, { 
          context: "LatestSignals", 
          userId: user._id.toString() 
        })
      }
    }

    // Try to get recent signals from database first
    const dbSignals = await models.Signal.find({
      createdAt: { $gte: sinceDate },
      expiresAt: { $gt: new Date() }, // Only active signals
      price: { $gt: 0 } // Only include signals with valid prices
    }).sort({ createdAt: -1 })
    
    if (dbSignals && dbSignals.length > 0) {
      logger.info(`Found ${dbSignals.length} recent signals in database`, {
        context: "LatestSignals",
        userId: user._id.toString()
      })
      
      // Filter signals based on user's risk level and holdings
      const filteredSignals = dbSignals
        .map((signal: any) => {
          // Convert MongoDB document to plain object
          const plainSignal = signal.toObject ? signal.toObject() : signal
          
          // Ensure dates are formatted as ISO strings
          return {
            ...plainSignal,
            id: plainSignal._id.toString(),
            createdAt: new Date(plainSignal.createdAt).toISOString(),
            expiresAt: new Date(plainSignal.expiresAt).toISOString()
          }
        })
        .filter((signal: Signal) => {
          // Check if we've recently notified about this signal
          const notificationKey = `${user._id}_${signal.id}`;
          const lastNotified = lastNotifiedSignals.get(notificationKey);
          
          if (lastNotified) {
            const now = Date.now();
            // If this signal was notified recently, skip it
            if (now - lastNotified < NOTIFICATION_COOLDOWN) {
              return false;
            }
          }
          
          // For BUY signals, filter by risk level
          if (signal.type === "BUY") {
            const matchesRiskLevel = signal.riskLevel === user.riskLevel;
            
            // If it's a match, record this notification
            if (matchesRiskLevel) {
              lastNotifiedSignals.set(notificationKey, Date.now());
            }
            
            return matchesRiskLevel;
          }
          // For SELL signals, only include them if user owns the token
          else if (signal.type === "SELL") {
            const ownsToken = userHoldings.includes(signal.token);
            
            // If it's a match, record this notification
            if (ownsToken) {
              lastNotifiedSignals.set(notificationKey, Date.now());
            }
            
            return ownsToken;
          }
          return false;
        })
      
      return NextResponse.json({ signals: filteredSignals })
    }
    
    // If no recent signals in database, try Ekin API directly
    try {
      const ekinSignals = await EkinApiService.getSignals()
      
      if (ekinSignals && ekinSignals.length > 0) {
        logger.info(`Fetched ${ekinSignals.length} signals from Ekin API`, {
          context: "LatestSignals",
          userId: user._id.toString()
        })
        
        // Convert to app signals format and store in database
        const signals = await Promise.all(ekinSignals.map(async (ekinSignal: any) => {
          const appSignal = EkinApiService.convertToAppSignal(ekinSignal)
          
          // Skip signals with invalid prices
          if (!appSignal.price || appSignal.price <= 0) {
            logger.warn(`Skipping signal with invalid price: ${appSignal.token}`, {
              context: "LatestSignals"
            });
            return null;
          }
          
          // Ensure dates are ISO strings
          const formattedSignal = {
            ...appSignal,
            createdAt: new Date(appSignal.createdAt).toISOString(),
            expiresAt: new Date(appSignal.expiresAt).toISOString(),
          }
          
          // Check if signal already exists
          let existingSignal = await models.Signal.findOne({
            token: appSignal.token,
            type: appSignal.type,
            price: appSignal.price,
            expiresAt: { $gt: new Date() }
          })
          
          if (!existingSignal) {
            // Create new signal in database
            existingSignal = await models.Signal.create(formattedSignal)
            
            logger.info(`Stored new ${appSignal.type} signal for ${appSignal.token} in database`, {
              context: "LatestSignals",
              userId: user._id.toString()
            })
          }
          
          // Return signal with ID
          return {
            ...formattedSignal,
            id: existingSignal._id.toString()
          }
        }))
        
        // Filter out null signals (those with invalid prices)
        const validSignals = signals.filter(s => s !== null) as Signal[];
        
        // Filter signals based on user's risk level and holdings
        const filteredSignals = validSignals.filter((signal: Signal) => {
          // Check if signal was created after the "since" parameter
          const signalDate = new Date(signal.createdAt).getTime()
          if (signalDate < since) {
            return false
          }
          
          // For BUY signals, filter by risk level
          if (signal.type === "BUY") {
            return signal.riskLevel === user.riskLevel
          }
          // For SELL signals, only include them if user owns the token
          else if (signal.type === "SELL") {
            return userHoldings.includes(signal.token)
          }
          return false
        })
        
        return NextResponse.json({ signals: filteredSignals })
      }
    } catch (ekinError) {
      logger.error(`Error fetching signals from Ekin API: ${ekinError instanceof Error ? ekinError.message : "Unknown error"}`)
      // Continue to return empty signals array if Ekin API fails
    }
    
    // If no signals found in database or from Ekin API, return empty array
    return NextResponse.json({ signals: [] })
  } catch (error) {
    logger.error(`Error fetching latest signals: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to fetch latest signals" }, { status: 500 })
  }
}