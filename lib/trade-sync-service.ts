// lib/trade-sync-service.ts
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"
import { connectToDatabase, models } from "@/lib/db"

export class TradeSyncService {
  static async syncUserTrades(userId: string | number, options?: {
    symbol?: string;
    limit?: number;
    forceSync?: boolean;
  }) {
    try {
      const { limit = 100, forceSync = false } = options || {}
      
      logger.info(`Starting trade sync for user ${userId}`, {
        context: "TradeSyncService",
        data: { limit, forceSync }
      })

      // Connect to database
      await connectToDatabase()
      
      // Get user from database
      const user = await models.User.findOne({ telegramId: userId })
      
      if (!user || !user.exchangeConnected) {
        logger.warn(`User ${userId} not found or exchange not connected`, {
          context: "TradeSyncService"
        })
        return { synced: 0, error: "Exchange not connected" }
      }

      // Check last sync time (don't sync too frequently unless forced)
      if (!forceSync && user.lastTradeSync) {
        const timeSinceSync = Date.now() - user.lastTradeSync.getTime()
        const MIN_SYNC_INTERVAL = 5 * 60 * 1000 // 5 minutes
        
        if (timeSinceSync < MIN_SYNC_INTERVAL) {
          logger.info(`Skipping sync - last sync was ${timeSinceSync / 1000}s ago`, {
            context: "TradeSyncService"
          })
          return { synced: 0, skipped: true }
        }
      }

      // Fetch trades from trading proxy
      const binanceTrades = await tradingProxy.getUserTrades(userId) // Remove the symbol parameter
      
      if (!binanceTrades || binanceTrades.length === 0) {
        logger.info("No new trades to sync", {
          context: "TradeSyncService"
        })
        return { synced: 0 }
      }
      
      let synced = 0
      let skipped = 0
      
      // Process each trade
      for (const trade of binanceTrades) {
        try {
          // Extract token from symbol
          const token = trade.symbol.replace('USDT', '').replace('BUSD', '')
          
          // Check if trade already exists
          const existingTrade = await models.Trade.findOne({
            userId: user._id,
            exchangeTradeId: trade.id.toString()
          })
          
          if (existingTrade) {
            skipped++
            continue
          }
          
          // Create new trade record
          await models.Trade.create({
            userId: user._id,
            type: trade.tradeType, // Updated to use tradeType from response
            token,
            price: trade.price,
            amount: trade.quantity,
            status: "completed",
            autoExecuted: false,
            exchangeTradeId: trade.id.toString(),
            createdAt: new Date(trade.time),
            metadata: {
              orderId: trade.orderId,
              commission: trade.commission,
              commissionAsset: trade.commissionAsset,
              isMaker: trade.isMaker,
              quoteQty: trade.quoteQuantity,
              total: trade.total
            }
          })
          
          synced++
        } catch (error) {
          logger.error(`Error syncing trade ${trade.id}: ${error instanceof Error ? error.message : "Unknown error"}`)
        }
      }
      
      // Update last sync time
      user.lastTradeSync = new Date()
      await user.save()
      
      logger.info(`Trade sync completed: ${synced} synced, ${skipped} skipped`, {
        context: "TradeSyncService",
        userId
      })
      
      return { synced, skipped, total: binanceTrades.length }
    } catch (error) {
      logger.error(`Trade sync error: ${error instanceof Error ? error.message : "Unknown error"}`)
      throw error
    }
  }
  
  static async getStoredTrades(userId: string | number, options?: {
    limit?: number;
    offset?: number;
    token?: string;
    startDate?: Date;
    endDate?: Date;
  }) {
    try {
      const { limit = 50, offset = 0, token, startDate, endDate } = options || {}
      
      // Connect to database
      await connectToDatabase()
      
      // Get user
      const user = await models.User.findOne({ telegramId: userId })
      
      if (!user) {
        throw new Error("User not found")
      }
      
      // Build query
      const query: any = { userId: user._id }
      
      if (token) {
        query.token = token
      }
      
      if (startDate || endDate) {
        query.createdAt = {}
        if (startDate) query.createdAt.$gte = startDate
        if (endDate) query.createdAt.$lte = endDate
      }
      
      // Fetch trades
      const trades = await models.Trade.find(query)
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
      
      // Get total count for pagination
      const totalCount = await models.Trade.countDocuments(query)
      
      return {
        trades: trades.map(trade => ({
          id: trade._id.toString(),
          type: trade.type,
          token: trade.token,
          price: trade.price,
          amount: trade.amount,
          createdAt: trade.createdAt,
          status: trade.status,
          autoExecuted: trade.autoExecuted,
          exchangeTradeId: trade._id.toString(),
          metadata: trade.metadata
        })),
        totalCount,
        hasMore: totalCount > offset + limit
      }
    } catch (error) {
      logger.error(`Error fetching stored trades: ${error instanceof Error ? error.message : "Unknown error"}`)
      throw error
    }
  }
}

export default TradeSyncService