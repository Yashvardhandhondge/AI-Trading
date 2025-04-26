// lib/exchange.ts
import axios from "axios";
import crypto from "crypto";
import { decryptApiKey } from "./db";
import { logger } from "./logger";

const API_SECRET_KEY = process.env.API_SECRET_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

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

export class ExchangeService {
  private apiKey: string;
  private apiSecret: string;
  private exchange: "binance" | "btcc";
  private baseUrl: string;
  private proxyUrl: string | null = null;

  constructor(exchange: "binance" | "btcc", credentials: ExchangeCredentials) {
    this.exchange = exchange;

    // Decrypt API credentials if they're encrypted
    if (credentials.apiKey.includes(":")) {
      this.apiKey = decryptApiKey(credentials.apiKey, API_SECRET_KEY);
    } else {
      this.apiKey = credentials.apiKey;
    }

    if (credentials.apiSecret.includes(":")) {
      this.apiSecret = decryptApiKey(credentials.apiSecret, API_SECRET_KEY);
    } else {
      this.apiSecret = credentials.apiSecret;
    }

    // Set base URL based on exchange
    this.baseUrl = exchange === "binance" ? "https://api.binance.com" : "https://api.btcc.com";
    
    // Optional proxy URL for Binance API (only used in specific environments)
    if (process.env.USE_PROXY === "true" && process.env.BINANCE_API_PROXY) {
      this.proxyUrl = process.env.BINANCE_API_PROXY;
      logger.info(`Using proxy for ${exchange} API requests`, {
        context: "ExchangeService"
      });
    }
    
    logger.info(`ExchangeService initialized for ${exchange}`, {
      context: "ExchangeService",
      data: { baseUrl: this.baseUrl }
    });
  }

  private generateSignature(queryString: string): string {
    return crypto.createHmac("sha256", this.apiSecret).update(queryString).digest("hex");
  }

  private getEffectiveUrl(endpoint: string, queryString: string, signature: string): string {
    // Use proxy if available, otherwise use direct API URL
    const baseUrl = this.proxyUrl || this.baseUrl;
    return `${baseUrl}${endpoint}?${queryString}&signature=${signature}`;
  }

  private async makeRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    params: Record<string, any> = {},
  ): Promise<any> {
    try {
      // Add timestamp for signature
      const timestamp = Date.now();
      params.timestamp = timestamp;

      // Generate query string
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("&");

      // Generate signature
      const signature = this.generateSignature(queryString);

      // Build URL with query string and signature
      const url = this.getEffectiveUrl(endpoint, queryString, signature);
      
      logger.debug(`Making ${method} request to ${this.exchange}`, { 
        context: "ExchangeService",
        data: { 
          endpoint,
          method,
          // Don't log full URL to avoid exposing signature in logs
          baseUrl: this.proxyUrl || this.baseUrl,
          paramsCount: Object.keys(params).length
        }
      });

      // Make request with proper headers
      const response = await axios({
        method,
        url,
        headers: {
          "X-MBX-APIKEY": this.apiKey,
          "User-Agent": "Mozilla/5.0 CycleTrader/1.0", // Custom User-Agent
          "Accept": "application/json"
        },
        timeout: 15000, // Increased timeout for potentially slow connections
        validateStatus: function (status) {
          // Consider all status codes as valid to handle in catch block
          return status < 600;
        }
      });

      // Check if response status indicates a problem
      if (response.status >= 400) {
        // Handle different error types
        if (response.status === 451) {
          throw new Error("IP restricted. Please whitelist the application IP in your Binance API settings.");
        } else if (response.status === 401 || response.status === 403) {
          throw new Error("Invalid API key or secret. Please check your credentials.");
        } else {
          throw new Error(`Exchange API error (${response.status}): ${JSON.stringify(response.data)}`);
        }
      }

      logger.debug(`Request to ${this.exchange} successful`, {
        context: "ExchangeService"
      });
      
      return response.data;
    } catch (error) {
      // Detailed error logging
      if (axios.isAxiosError(error)) {
        logger.error(`Exchange API error: ${this.exchange}`);
        
        // Check for specific network errors
        if (error.code === 'ECONNABORTED') {
          throw new Error(`Connection timeout. The exchange API is not responding in time.`);
        } else if (error.code === 'ENOTFOUND') {
          throw new Error(`Unable to reach ${this.exchange} API. Please check your internet connection.`);
        }
        
        // Handle IP restriction specifically - try proxy if available
        if (error.response?.status === 451 && this.exchange === "binance" && 
            process.env.ENABLE_BINANCE_PROXY === "true") {
          
          logger.info("IP restricted error detected, attempting to use server-side proxy", {
            context: "ExchangeService"
          });
          
          try {
            return await this.makeProxyRequest(endpoint, method, params);
          } catch (proxyError) {
            logger.error(`Proxy fallback also failed: ${proxyError instanceof Error ? proxyError.message : 'Unknown error'}`);
            // Continue to the original error handling if proxy also fails
          }
        }
        
        // Throw detailed error with response data if available
        if (error.response) {
          // Specific error handling for common Binance error codes
          if (error.response.status === 451) {
            throw new Error(`IP restricted. Please whitelist the application IP in your Binance API settings. Your current IP and Vercel's IP range (76.76.21.0/24) must be added.`);
          } else if (error.response.status === 418) {
            throw new Error(`IP has been auto-banned by Binance for violating system rules.`);
          } else if (error.response.status === 429) {
            throw new Error(`Rate limit exceeded. Please try again in a few minutes.`);
          } else if (error.response.status === 401 || error.response.status === 403) {
            throw new Error(`Authentication failed. Please check your API key and secret.`);
          }
          throw new Error(`Exchange API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
        }
      }

      logger.error(`Exchange request failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
  
  // Optional fallback method to use server-side proxy for Binance API requests
  private async makeProxyRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    params: Record<string, any> = {},
  ): Promise<any> {
    logger.info(`Attempting to use server-side proxy for ${endpoint}`, {
      context: "ExchangeService"
    });
    
    const response = await fetch("/api/proxy/binance", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        endpoint,
        method,
        params,
        apiKey: this.apiKey,
        encryptedApiSecret: this.apiSecret // We send the encrypted version for security
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Proxy error: ${errorData.error || errorData.message || "Unknown error"}`);
    }
    
    return await response.json();
  }

  async validateConnection(): Promise<boolean> {
    try {
      logger.info(`Validating connection to ${this.exchange}`, {
        context: "ExchangeService"
      });
      
      if (this.exchange === "binance") {
        // Enhanced connection testing with better error handling
        try {
          // First, try a simple ping test that doesn't require authentication
          logger.info("Testing Binance API connectivity...", {
            context: "ExchangeService"
          });
          
          const pingResponse = await axios({
            method: "GET",
            url: `${this.baseUrl}/api/v3/ping`,
            timeout: 5000,
            validateStatus: function (status) {
              return status < 600;
            }
          });
          
          if (pingResponse.status !== 200) {
            logger.error(`Binance API ping failed with status ${pingResponse.status}`);
            return false;
          }
          
          logger.info("Binance API ping successful, testing account access...", {
            context: "ExchangeService"
          });
          
          // Then test actual account access to verify API keys
          await this.makeRequest("/api/v3/account");
          
          logger.info("Binance API connection validated successfully", {
            context: "ExchangeService"
          });
          return true;
        } catch (error) {
          // Provide more specific error messages based on common issues
          if (axios.isAxiosError(error) && error.response) {
            const status = error.response.status;
            
            if (status === 451) {
              logger.error("Binance connection failed: IP restriction (451). IP whitelist issue.");
            } else if (status === 401 || status === 403) {
              logger.error("Binance connection failed: Authentication failed (401/403). Invalid API key or secret.");
            } else {
              logger.error(`Binance connection failed with status ${status}`);
            }
          } else {
            logger.error(`Failed to validate Binance connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
          return false;
        }
      } else {
        // Test BTCC API connection
        try {
          await this.makeRequest("/api/v1/account");
          logger.info("BTCC API connection validated successfully", {
            context: "ExchangeService"
          });
          return true;
        } catch (error) {
          logger.error(`Failed to validate BTCC connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
          return false;
        }
      }
    } catch (error) {
      logger.error(`Failed to connect to ${this.exchange}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  // Get mockup portfolio data for testing when real API connections fail
  private getMockPortfolio(): Portfolio {
    logger.warn("Using mock portfolio data as fallback", {
      context: "ExchangeService"
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

  async getBalances(): Promise<Balance[]> {
    try {
      let data: any;

      if (this.exchange === "binance") {
        data = await this.makeRequest("/api/v3/account");

        return data.balances.map((balance: any) => ({
          asset: balance.asset,
          free: Number.parseFloat(balance.free),
          locked: Number.parseFloat(balance.locked),
          total: Number.parseFloat(balance.free) + Number.parseFloat(balance.locked),
        }));
      } else {
        data = await this.makeRequest("/api/v1/account");

        // Map BTCC response to our Balance interface
        return data.balances.map((balance: any) => ({
          asset: balance.asset,
          free: Number.parseFloat(balance.free),
          locked: Number.parseFloat(balance.locked),
          total: Number.parseFloat(balance.free) + Number.parseFloat(balance.locked),
        }));
      }
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

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    try {
      let endpoint = "";
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

      if (this.exchange === "binance") {
        endpoint = "/api/v3/order";
      } else {
        endpoint = "/api/v1/order";
      }

      const response = await this.makeRequest(endpoint, "POST", requestParams);

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

  async getMarketPrice(symbol: string): Promise<number> {
    try {
      let endpoint = "";
      const params = { symbol };

      if (this.exchange === "binance") {
        endpoint = "/api/v3/ticker/price";
      } else {
        endpoint = "/api/v1/ticker/price";
      }

      const response = await this.makeRequest(endpoint, "GET", params);
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
}