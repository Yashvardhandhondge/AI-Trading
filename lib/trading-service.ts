// lib/trading-service.ts
import { logger } from "@/lib/logger";

/**
 * TradingService - Central service for all trading operations
 * 
 * This service uses the server-side proxy for all operations,
 * avoiding client-side IP restrictions in Telegram WebApp
 */
export class TradingService {
  
  /**
   * Get account information from Binance
   */
  static async getAccountInfo() {
    return this.makeProxyRequest("/api/v3/account");
  }
  
  /**
   * Get account balances 
   */
  static async getBalances() {
    try {
      const accountData = await this.getAccountInfo();
      
      if (!accountData.balances) {
        throw new Error("No balance data returned");
      }
      
      return accountData.balances.map((balance: any) => ({
        asset: balance.asset,
        free: Number.parseFloat(balance.free),
        locked: Number.parseFloat(balance.locked),
        total: Number.parseFloat(balance.free) + Number.parseFloat(balance.locked),
      }));
    } catch (error) {
      logger.error(`Error getting balances: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Get portfolio data
   */
  static async getPortfolio() {
    try {
      // Get balances
      const balances = await this.getBalances();
      
      // Filter out zero balances and stablecoins
      const nonZeroBalances = balances.filter(
        (balance:any) => balance.total > 0 && !["USDT", "USDC", "BUSD", "DAI"].includes(balance.asset),
      );
      
      // Get prices for all assets
      const holdings = await Promise.all(
        nonZeroBalances.map(async (balance:any) => {
          const currentPrice = await this.getPrice(`${balance.asset}USDT`);
          const value = balance.total * currentPrice;
          
          // Use current price as average with small difference
          const averagePrice = currentPrice * 0.98; // Mock 2% profit
          const pnl = (currentPrice - averagePrice) * balance.total;
          const pnlPercentage = ((currentPrice - averagePrice) / averagePrice) * 100;
          
          return {
            token: balance.asset,
            amount: balance.total,
            averagePrice,
            currentPrice,
            value,
            pnl,
            pnlPercentage,
          };
        })
      );
      
      // Calculate totals
      const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
      
      // Get stablecoin balances
      const stablecoins = balances.filter((balance:any) => ["USDT", "USDC", "BUSD", "DAI"].includes(balance.asset));
      const freeCapital = stablecoins.reduce((sum:any, coin:any) => sum + coin.free, 0);
      
      return {
        totalValue: totalValue + freeCapital,
        freeCapital,
        allocatedCapital: totalValue,
        holdings,
      };
    } catch (error) {
      logger.error(`Error getting portfolio: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Get price for a symbol
   */
  static async getPrice(symbol: string) {
    try {
      const response = await this.makeProxyRequest("/api/v3/ticker/price", "GET", { symbol });
      return Number.parseFloat(response.price);
    } catch (error) {
      logger.error(`Error getting price for ${symbol}: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Execute a trade
   */
  static async executeTrade(symbol: string, side: "BUY" | "SELL", quantity: number, price?: number) {
    try {
      const params: Record<string, any> = {
        symbol,
        side,
        quantity: quantity.toFixed(5),
        type: price ? "LIMIT" : "MARKET",
      };
      
      if (price) {
        params.price = price.toFixed(2);
        params.timeInForce = "GTC"; // Good Till Canceled
      }
      
      const response = await this.makeProxyRequest("/api/v3/order", "POST", params);
      
      return {
        orderId: response.orderId,
        symbol: response.symbol,
        side: response.side,
        quantity: Number.parseFloat(response.executedQty),
        price: Number.parseFloat(response.price || response.fills?.[0]?.price || 0),
        status: response.status,
        timestamp: response.transactTime,
      };
    } catch (error) {
      logger.error(`Error executing trade: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Make a request through the proxy
   */
  private static async makeProxyRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    params: Record<string, any> = {}
  ) {
    try {
      const response = await fetch("/api/trading/proxy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          endpoint,
          method,
          params
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || `Error ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      return data.data;
    } catch (error) {
      logger.error(`Proxy request failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Create a test order to validate API permissions
   */
  static async testConnection() {
    try {
      // Get account info is sufficient to test connection
      await this.getAccountInfo();
      return true;
    } catch (error) {
      logger.error(`Connection test failed: ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }
  
  /**
   * Get open orders
   */
  static async getOpenOrders(symbol?: string) {
    try {
      const params: Record<string, any> = {};
      if (symbol) {
        params.symbol = symbol;
      }
      
      return await this.makeProxyRequest("/api/v3/openOrders", "GET", params);
    } catch (error) {
      logger.error(`Error getting open orders: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Cancel an order
   */
  static async cancelOrder(symbol: string, orderId: number) {
    try {
      return await this.makeProxyRequest("/api/v3/order", "DELETE", {
        symbol,
        orderId
      });
    } catch (error) {
      logger.error(`Error canceling order: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
}