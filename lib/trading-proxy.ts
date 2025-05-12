// lib/trading-proxy.ts
/**
 * Trading Proxy Service
 * 
 * This service centralizes all Binance API interactions through an external proxy server
 * to avoid IP restrictions when running in a Telegram Mini App context.
 */

import { logger } from "./logger";

interface TradingProxyConfig {
  proxyServerUrl: string;
  defaultTimeout?: number;
}

export class TradingProxyService {
  private static instance: TradingProxyService;
  private proxyServerUrl: string;
  private defaultTimeout: number;

  private constructor(config: TradingProxyConfig) {
    this.proxyServerUrl = config.proxyServerUrl;
    this.defaultTimeout = config.defaultTimeout || 10000;
    logger.info(`TradingProxyService initialized with server: ${this.proxyServerUrl}`);
  }

  /**
   * Initialize the trading proxy service
   */
  public static initialize(config: TradingProxyConfig): TradingProxyService {
    if (!TradingProxyService.instance) {
      TradingProxyService.instance = new TradingProxyService(config);
    }
    return TradingProxyService.instance;
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): TradingProxyService {
    if (!TradingProxyService.instance) {
      const defaultUrl =  'https://binance.yashvardhandhondge.tech';
      TradingProxyService.instance = new TradingProxyService({ proxyServerUrl: defaultUrl });
    }
    return TradingProxyService.instance;
  }

  /**
   * Register API keys with the proxy server
   */
 /**
 * Register API keys with the proxy server
 */
public async registerApiKey(userId: string | number, apiKey: string, apiSecret: string, exchange: string = 'binance'): Promise<boolean> {
    try {
      logger.info(`Registering API key with proxy server for user ${userId}`, {
        context: 'TradingProxy',
        userId
      });
  
      const proxyServerUrl = process.env.NEXT_PUBLIC_PROXY_SERVER_URL || 'https://binance.yashvardhandhondge.tech';
      const response = await fetch(`${proxyServerUrl}/api/register-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId.toString(),
          apiKey,
          apiSecret,
          exchange
        }),
        signal: AbortSignal.timeout(this.defaultTimeout)
      });
  
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error: ${response.status}` }));
        const errorMessage = errorData.error || `Registration failed with status ${response.status}`;
        logger.error(`API key registration failed: ${errorMessage}`, undefined, {
          context: 'TradingProxy',
          userId
        });
        throw new Error(errorMessage);
      }
  
      const data = await response.json();
      logger.info(`API key registered successfully for user ${userId}`, {
        context: 'TradingProxy',
        userId
      });
      
      return true;
    } catch (error) {
      logger.error(`API key registration error: ${error instanceof Error ? error.message : 'Unknown error'}`, undefined, {
        context: 'TradingProxy',
        userId
      });
      throw error;
    }
  }

  /**
   * Check if a user has registered API keys
   */
  public async checkApiKeyStatus(userId: string | number): Promise<boolean> {
    try {
      const response = await fetch(`${this.proxyServerUrl}/api/user/${userId}/key-status`, {
        signal: AbortSignal.timeout(this.defaultTimeout)
      });

      if (!response.ok) {
        return false;
      }

      const data = await response.json();
      return data.registered === true;
    } catch (error) {
      logger.error(`Error checking API key status: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return false;
    }
  }

  /**
   * Execute a proxy request to Binance API
   */
  public async executeProxyRequest(userId: string | number, endpoint: string, method: 'GET' | 'POST' | 'DELETE' = 'GET', params: Record<string, any> = {}): Promise<any> {
    try {
      logger.info(`Making ${method} request to ${endpoint} via proxy for user ${userId}`, {
        context: 'TradingProxy'
      });

      const response = await fetch(`${this.proxyServerUrl}/api/proxy/binance`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId.toString(),
          endpoint,
          method,
          params
        }),
        signal: AbortSignal.timeout(this.defaultTimeout)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error: ${response.status}` }));
        const errorMessage = errorData.error || errorData.message || `Error ${response.status}`;
        logger.error(`Proxy request failed: ${errorMessage}`);
        throw new Error(errorMessage);
      }

      const responseData = await response.json();
      
      if (!responseData.success) {
        throw new Error(responseData.error || 'Proxy request failed');
      }

      logger.info(`Proxy request successful for ${endpoint}`, {
        context: 'TradingProxy',
        userId
      });

      return responseData.data;
    } catch (error) {
      logger.error(`Proxy request error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get account information
   */
  public async getAccountInfo(userId: string | number): Promise<any> {
    return this.executeProxyRequest(userId, '/api/v3/account');
  }

  /**
   * Get account balances
   */
  public async getBalances(userId: string | number): Promise<any[]> {
    try {
      const accountData = await this.getAccountInfo(userId);

      if (!accountData.balances) {
        throw new Error('No balance data returned');
      }

      return accountData.balances.map((balance: any) => ({
        asset: balance.asset,
        free: Number.parseFloat(balance.free),
        locked: Number.parseFloat(balance.locked),
        total: Number.parseFloat(balance.free) + Number.parseFloat(balance.locked),
      }));
    } catch (error) {
      logger.error(`Error getting balances: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get current price for a trading pair
   */
  public async getPrice(userId: string | number, symbol: string): Promise<number> {
    try {
      const response = await this.executeProxyRequest(userId, '/api/v3/ticker/price', 'GET', { symbol });
      return Number.parseFloat(response.price);
    } catch (error) {
      logger.error(`Error getting price for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Execute a trade
   */
  public async executeTrade(
    userId: string | number,
    symbol: string,
    side: 'BUY' | 'SELL',
    quantity: number,
    price?: number
  ): Promise<any> {
    try {
      logger.info(`Executing ${side} trade for ${symbol}`, {
        context: 'TradingProxy',
        userId,
        data: { symbol, side, quantity }
      });
  
      // Resolve the symbol using our mapping
      const resolvedSymbol = this.resolveSymbol(symbol);
      
      // Validate the symbol if it's not the same as the original
      if (resolvedSymbol !== symbol) {
        const isValid = await this.validateSymbol(userId, resolvedSymbol);
        if (!isValid) {
          logger.error(`Resolved symbol ${resolvedSymbol} is also invalid`);
          throw new Error(`Invalid trading symbol: ${symbol}. This asset is not available on your exchange.`);
        }
      } else {
        // Validate the original symbol
        const isValid = await this.validateSymbol(userId, symbol);
        if (!isValid) {
          throw new Error(`Invalid trading symbol: ${symbol}. This asset is not available on your exchange.`);
        }
      }
  
      // Use the resolved symbol for the trade
      const params: Record<string, any> = {
        symbol: resolvedSymbol,
        side,
        quantity: quantity.toFixed(5),
        type: price ? 'LIMIT' : 'MARKET',
      };
  
      if (price) {
        params.price = price.toFixed(2);
        params.timeInForce = 'GTC'; // Good Till Canceled
      }
  
      const response = await this.executeProxyRequest(userId, '/api/v3/order', 'POST', params);
  
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

  // In your trading-proxy.ts
public async getUserTrades(userId: string | number, symbol?: string): Promise<any[]> {
  try {
    const url = `${this.proxyServerUrl}/api/user/${userId}/trades${symbol ? `?symbol=${symbol}` : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch trades: ${response.status}`);
    }
    
    const data = await response.json();
    return data.trades;
  } catch (error) {
    logger.error(`Error fetching trades: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

  /**
   * Get portfolio data
   */
  public async getPortfolio(userId: string | number): Promise<any> {
    try {
      console.log(`[DEBUG] Getting portfolio for user ${userId}`);
      
      const proxyServerUrl = process.env.NEXT_PUBLIC_PROXY_SERVER_URL || 'https://binance.yashvardhandhondge.tech';
      const apiKey = process.env.TRADING_PROXY_API_KEY || '';
      
      const response = await fetch(`${proxyServerUrl}/api/user/${userId}/portfolio`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        signal: AbortSignal.timeout(this.defaultTimeout)
      });
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: `HTTP error: ${response.status}` }));
        throw new Error(error.message || 'Failed to fetch portfolio');
      }
      
      const portfolioData = await response.json();
      console.log(`[DEBUG] TOTAL PORTFOLIO VALUE: ${portfolioData.totalValue} (allocated: ${portfolioData.allocatedCapital} + free: ${portfolioData.freeCapital})`);
      
      return {
        totalValue: portfolioData.totalValue,
        freeCapital: portfolioData.freeCapital,
        allocatedCapital: portfolioData.allocatedCapital,
        holdings: portfolioData.holdings.map((holding: any) => ({
          token: holding.symbol,
          amount: holding.quantity,
          averagePrice: holding.averagePrice || holding.price,
          currentPrice: holding.price,
          value: holding.value,
          pnl: holding.pnl || 0,
          pnlPercentage: holding.pnlPercentage || 0,
        })),
        realizedPnl: portfolioData.realizedPnl || 0,
        unrealizedPnl: portfolioData.unrealizedPnl || 0
      };
    } catch (error) {
      logger.error(`Error fetching portfolio: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }

  /**
   * Get open orders
   */
  public async getOpenOrders(userId: string | number, symbol?: string): Promise<any[]> {
    try {
      const params: Record<string, any> = {};
      if (symbol) {
        params.symbol = symbol;
      }

      return this.executeProxyRequest(userId, '/api/v3/openOrders', 'GET', params);
    } catch (error) {
      logger.error(`Error getting open orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  public async cancelOrder(userId: string | number, symbol: string, orderId: number): Promise<any> {
    try {
      return await this.executeProxyRequest(userId, '/api/v3/order', 'DELETE', {
        symbol,
        orderId
      });
    } catch (error) {
      logger.error(`Error canceling order: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // lib/trading-proxy.ts

// Add symbol validation method
public async validateSymbol(userId: string | number, symbol: string): Promise<boolean> {
  try {
    // Get exchange info from Binance
    const exchangeInfo = await this.executeProxyRequest(userId, '/api/v3/exchangeInfo');
    
    // Check if the symbol exists in the exchange info
    return exchangeInfo.symbols.some((s: any) => s.symbol === symbol);
  } catch (error) {
    logger.error(`Error validating symbol ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return false;
  }
}

// Add symbol resolution for commodities and other special cases
private symbolMap: Record<string, string> = {
  'GOLDUSDT': 'PAXGUSDT',  // Map Gold to Paxos Gold
  'SILVERUSDT': 'XAGUSDT', // Map Silver to a silver token if available
  // Add other mappings as needed
};

private resolveSymbol(symbol: string): string {
  // Check if we have a direct mapping for this symbol
  if (this.symbolMap[symbol]) {
    logger.info(`Resolving ${symbol} to ${this.symbolMap[symbol]}`);
    return this.symbolMap[symbol];
  }
  
  // Otherwise return the original symbol
  return symbol;
}

// Update executeTrade method to use symbol validation and resolution


  /**
   * Mock portfolio data for development
   */
  private getMockPortfolio(): any {
    return {
      totalValue: 1250.75,
      freeCapital: 750.25,
      allocatedCapital: 500.50,
      realizedPnl: 25.40,
      unrealizedPnl: 19.40,
      holdings: [
        {
          token: 'BTC',
          amount: 0.012,
          averagePrice: 56000,
          currentPrice: 57200,
          value: 686.40,
          pnl: 14.40,
          pnlPercentage: 2.14
        },
        {
          token: 'ETH',
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



// Export a singleton instance
export const tradingProxy = TradingProxyService.getInstance();