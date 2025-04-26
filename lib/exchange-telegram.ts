// lib/exchange-telegram.ts
import axios from "axios";
import { logger } from "@/lib/logger";

export interface ExchangeCredentials {
  apiKey: string;
  apiSecret: string;
}

export interface Balance {
  asset: string;
  free: number;
  locked: number;
  total: number;
}

export interface Portfolio {
  totalValue: number;
  freeCapital: number;
  allocatedCapital: number;
  holdings: {
    token: string;
    amount: number;
    averagePrice: number;
    currentPrice: number;
    value: number;
    pnl: number;
    pnlPercentage: number;
  }[];
}

export interface TradeParams {
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price?: number; // For limit orders
}

export interface TradeResult {
  orderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  quantity: number;
  price: number;
  status: "FILLED" | "PARTIALLY_FILLED" | "REJECTED";
  timestamp: number;
}

/**
 * TelegramExchangeService
 * 
 * This specialized version of the Exchange Service is designed for Telegram WebApp compatibility.
 * It routes ALL Binance API calls through a server-side proxy, completely avoiding
 * client-side IP restrictions.
 */
export class TelegramExchangeService {
  private exchange: "binance" | "btcc";
  private credentials: ExchangeCredentials;
  
  constructor(exchange: "binance" | "btcc", credentials: ExchangeCredentials) {
    this.exchange = exchange;
    this.credentials = credentials;
    
    logger.info(`TelegramExchangeService initialized for ${exchange}`, {
      context: "TelegramExchangeService"
    });
  }

  /**
   * Uses the server-side proxy to validate the exchange connection
   */
  async validateConnection(): Promise<boolean> {
    try {
      logger.info(`Validating connection to ${this.exchange} via server proxy`, {
        context: "TelegramExchangeService"
      });
      
      if (this.exchange === "binance") {
        // Always use the server-side proxy for validation
        const response = await this.makeProxyRequest("/api/v3/account");
        
        // Check if response indicates a valid connection
        if (response && response.accountType) {
          logger.info("Binance API connection validated successfully via proxy", {
            context: "TelegramExchangeService"
          });
          return true;
        }
        
        return false;
      } else {
        // For BTCC, implement similar proxy-based validation
        // This is a placeholder - implement based on BTCC API
        logger.warn("BTCC validation not fully implemented", {
          context: "TelegramExchangeService"
        });
        return false;
      }
    } catch (error) {
      logger.error(`Failed to validate ${this.exchange} connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Makes all requests through the server-side proxy
   */
  private async makeProxyRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    params: Record<string, any> = {}
  ): Promise<any> {
    try {
      logger.info(`Making ${method} request to ${this.exchange} via server proxy: ${endpoint}`, {
        context: "TelegramExchangeService"
      });
      
      // Make the request through our server-side proxy endpoint
      const response = await fetch("/api/proxy/binance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          endpoint,
          method,
          params,
          // We don't need to send credentials here - they'll be retrieved from the user's session
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Proxy error: ${errorData.error || errorData.message || `Status: ${response.status}`}`);
      }
      
      return await response.json();
    } catch (error) {
      logger.error(`Proxy request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Gets account balances via the proxy
   */
  async getBalances(): Promise<Balance[]> {
    try {
      const data = await this.makeProxyRequest("/api/v3/account");
      
      return data.balances.map((balance: any) => ({
        asset: balance.asset,
        free: Number.parseFloat(balance.free),
        locked: Number.parseFloat(balance.locked),
        total: Number.parseFloat(balance.free) + Number.parseFloat(balance.locked),
      }));
    } catch (error) {
      logger.error(`Error fetching balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // For development/testing, return mock data when API fails
      if (process.env.NODE_ENV === "development" || process.env.USE_MOCK_DATA === "true") {
        return [
          { asset: "USDT", free: 750.25, locked: 0, total: 750.25 },
          { asset: "BTC", free: 0.012, locked: 0, total: 0.012 },
          { asset: "ETH", free: 0.25, locked: 0, total: 0.25 }
        ];
      }
      
      throw error;
    }
  }

  /**
   * Gets portfolio data via the proxy
   */
  async getPortfolio(): Promise<Portfolio> {
    try {
      // Get account balances
      const balances = await this.getBalances();

      // Filter out zero balances and stablecoins
      const nonZeroBalances = balances.filter(
        (balance) => balance.total > 0 && !["USDT", "USDC", "BUSD", "DAI"].includes(balance.asset),
      );

      // Get current prices for all assets
      const holdings = await Promise.all(
        nonZeroBalances.map(async (balance) => {
          const currentPrice = await this.getMarketPrice(`${balance.asset}USDT`);
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
      logger.error(`Error fetching portfolio: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // For development/testing, return mock data when API fails
      if (process.env.NODE_ENV === "development" || process.env.USE_MOCK_DATA === "true") {
        return this.getMockPortfolio();
      }
      
      throw error;
    }
  }

  /**
   * Gets market price for a symbol via the proxy
   */
  async getMarketPrice(symbol: string): Promise<number> {
    try {
      const response = await this.makeProxyRequest("/api/v3/ticker/price", "GET", { symbol });
      return Number.parseFloat(response.price);
    } catch (error) {
      logger.error(`Error fetching market price: ${error instanceof Error ? error.message : 'Unknown error'}`);

      // Fallback to CoinGecko API if exchange API fails
      try {
        const token = symbol.replace("USDT", "").toLowerCase();
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`);
        return response.data[token].usd;
      } catch (fallbackError) {
        logger.error(`Fallback price fetch failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`);
        
        // For development/testing, return mock price data when all APIs fail
        if (process.env.NODE_ENV === "development" || process.env.USE_MOCK_DATA === "true") {
          // Generate realistic mock prices for common symbols
          const mockPrices: Record<string, number> = {
            "BTCUSDT": 57200,
            "ETHUSDT": 3520,
            "BNBUSDT": 580,
            "ADAUSDT": 0.45,
            "SOLUSDT": 145,
            "DOGEUSDT": 0.15
          };
          
          return mockPrices[symbol] || 1.0; // Default to 1.0 for unknown symbols
        }
        
        throw error;
      }
    }
  }

  /**
   * Executes a trade via the proxy
   */
  async executeTrade(params: TradeParams): Promise<TradeResult> {
    try {
      const requestParams: Record<string, any> = {
        symbol: params.symbol,
        side: params.side,
        quantity: params.quantity.toFixed(5), // Format to 5 decimal places
        type: params.price ? "LIMIT" : "MARKET",
      };

      if (params.price) {
        requestParams.price = params.price.toFixed(2);
        requestParams.timeInForce = "GTC"; // Good Till Canceled
      }

      const endpoint = this.exchange === "binance" ? "/api/v3/order" : "/api/v1/order";
      const response = await this.makeProxyRequest(endpoint, "POST", requestParams);

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
      logger.error(`Error executing trade: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // Mock portfolio data for testing
  private getMockPortfolio(): Portfolio {
    logger.warn("Using mock portfolio data as fallback", {
      context: "TelegramExchangeService"
    });
    
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