// lib/proxy-trading-service.ts
/**
 * ProxyTradingService
 * 
 * This service handles all communication with the Binance API through a dedicated proxy server.
 * It bypasses IP restrictions that often affect Telegram WebApp environments.
 */

import { logger } from "./logger";

export class ProxyTradingService {
  // URL of the proxy server - configure in your environment variables
  static PROXY_URL = process.env.NEXT_PUBLIC_PROXY_SERVER_URL || 'https://remedies-postal-travel-bailey.trycloudflare.com';
  
  /**
   * Makes a request to the Binance API through the proxy server
   */
  static async makeProxyRequest(
    userId: string | number,
    endpoint: string,
    method: "GET" | "POST" | "DELETE" = "GET",
    params: Record<string, any> = {}
  ): Promise<any> {
    try {
      logger.info(`Making ${method} request to ${endpoint} via proxy`, {
        context: "ProxyTradingService",
        userId
      });
      
      const response = await fetch(`${this.PROXY_URL}/api/proxy/binance`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: userId.toString(),
          endpoint,
          method,
          params
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || errorData.message || `Error ${response.status}`;
        logger.error(`Proxy request failed: ${errorMessage}`);
        throw new Error(errorMessage);
      }
      
      const responseData = await response.json();
      
      logger.info(`Proxy request successful for ${endpoint}`, {
        context: "ProxyTradingService",
        userId
      });
      
      return responseData.data;
    } catch (error) {
      logger.error(`Proxy request error: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Register user's API key with the proxy server
   */
  static async registerApiKey(
    userId: string | number,
    apiKey: string,
    apiSecret: string
  ): Promise<boolean> {
    try {
      logger.info(`Registering API key with proxy server`, {
        context: "ProxyTradingService",
        userId
      });
      
      const response = await fetch(`${this.PROXY_URL}/api/register-key`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          userId: userId.toString(),
          apiKey,
          apiSecret
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error || errorData.message || `Error ${response.status}`;
        logger.error(`API key registration failed: ${errorMessage}`);
        throw new Error(errorMessage);
      }
      
      const data = await response.json();
      
      logger.info(`API key registered successfully`, {
        context: "ProxyTradingService",
        userId
      });
      
      return true;
    } catch (error) {
      logger.error(`API key registration error: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }

  static async checkApiKeyStatus(userId: string | number): Promise<boolean> {
    try {
      const response = await fetch(`${this.PROXY_URL}/api/user/${userId}/key-status`);
      
      if (!response.ok) {
        return false;
      }
      
      const data = await response.json();
      return data.registered === true;
    } catch (error) {
      logger.error(`Error checking API key status: ${error instanceof Error ? error.message : "Unknown error"}`);
      return false;
    }
  }
  

  
  /**
   * Get account information
   */
  static async getAccountInfo(userId: string | number): Promise<any> {
    return this.makeProxyRequest(userId, "/api/v3/account");
  }
  
  /**
   * Get account balances
   */
  static async getBalances(userId: string | number): Promise<any[]> {
    try {
      const accountData = await this.getAccountInfo(userId);
      
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
   * Get current price for a trading pair
   */
  static async getPrice(userId: string | number, symbol: string): Promise<number> {
    try {
      const response = await this.makeProxyRequest(userId, "/api/v3/ticker/price", "GET", { symbol });
      return Number.parseFloat(response.price);
    } catch (error) {
      logger.error(`Error getting price for ${symbol}: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Execute a trade
   */
  static async executeTrade(
    userId: string | number,
    symbol: string,
    side: "BUY" | "SELL",
    quantity: number,
    price?: number
  ): Promise<any> {
    try {
      logger.info(`Executing ${side} trade for ${symbol}`, {
        context: "ProxyTradingService",
        userId,
        data: { symbol, side, quantity }
      });
      
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
      
      const response = await this.makeProxyRequest(userId, "/api/v3/order", "POST", params);
      
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
   * Get portfolio data
   */
  static async getPortfolio(userId: string | number): Promise<any> {
    try {
      // Get balances
      const balances = await this.getBalances(userId);
      
      // Filter out zero balances and stablecoins
      const nonZeroBalances = balances.filter(
        (balance) => balance.total > 0 && !["USDT", "USDC", "BUSD", "DAI"].includes(balance.asset),
      );
      
      // Get current prices for all assets
      const holdings = await Promise.all(
        nonZeroBalances.map(async (balance) => {
          const currentPrice = await this.getPrice(userId, `${balance.asset}USDT`);
          const value = balance.total * currentPrice;
          
          // For demo purposes, we'll use current price as average price with a small difference
          // In a real app, this would come from trade history
          const averagePrice = currentPrice * (0.9 + Math.random() * 0.2); // +/- 10%
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
        }),
      );
      
      // Calculate portfolio totals
      const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0);
      
      // Get stablecoin balances for free capital
      const stablecoins = balances.filter((balance) => ["USDT", "USDC", "BUSD", "DAI"].includes(balance.asset));
      const freeCapital = stablecoins.reduce((sum, coin) => sum + coin.free, 0);
      
      return {
        totalValue: totalValue + freeCapital,
        freeCapital,
        allocatedCapital: totalValue,
        holdings,
      };
    } catch (error) {
      logger.error(`Error fetching portfolio: ${error instanceof Error ? error.message : "Unknown error"}`);
      
      // If this is a development environment, return mock data
      if (process.env.NODE_ENV === "development" || process.env.USE_MOCK_DATA === "true") {
        return this.getMockPortfolio();
      }
      
      throw error;
    }
  }
  
  /**
   * Get open orders
   */
  static async getOpenOrders(userId: string | number, symbol?: string): Promise<any[]> {
    try {
      const params: Record<string, any> = {};
      if (symbol) {
        params.symbol = symbol;
      }
      
      return this.makeProxyRequest(userId, "/api/v3/openOrders", "GET", params);
    } catch (error) {
      logger.error(`Error getting open orders: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Cancel an order
   */
  static async cancelOrder(userId: string | number, symbol: string, orderId: number): Promise<any> {
    try {
      return await this.makeProxyRequest(userId, "/api/v3/order", "DELETE", {
        symbol,
        orderId
      });
    } catch (error) {
      logger.error(`Error canceling order: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
  
  /**
   * Mock portfolio data for development
   */
  private static getMockPortfolio(): any {
    return {
      totalValue: 1250.75,
      freeCapital: 750.25,
      allocatedCapital: 500.50,
      holdings: [
        {
          token: "BTC",
          amount: 0.012,
          averagePrice: 56000,
          currentPrice: 57200,
          value: 686.40,
          pnl: 14.40,
          pnlPercentage: 2.14
        },
        {
          token: "ETH",
          amount: 0.25,
          averagePrice: 3500,
          currentPrice: 3520,
          value: 880.00,
          pnl: 5.00,
          pnlPercentage: 0.57
        }
      ]
    };
  }
}