// lib/trading-proxy.ts
/**
 * Trading Proxy Service
 * 
 * This service centralizes all Binance API interactions through an external proxy server
 * to avoid IP restrictions when running in a Telegram Mini App context.
 */

import { logger } from "./logger";
interface RateLimitCache {
  lastCall: number;
  callCount: number;
}

interface TradingProxyConfig {
  proxyServerUrl: string;
  defaultTimeout?: number;
}

export class TradingProxyService {
  private static instance: TradingProxyService;
  private proxyServerUrl: string;
  private defaultTimeout: number;
  private rateLimitCache: Map<string, RateLimitCache> = new Map();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly MAX_CALLS_PER_WINDOW = 60;

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


   private async checkRateLimit(endpoint: string): Promise<void> {
    const now = Date.now();
    const cacheKey = endpoint;
    const cache = this.rateLimitCache.get(cacheKey);

    if (!cache) {
      this.rateLimitCache.set(cacheKey, { lastCall: now, callCount: 1 });
      return;
    }

    // If we're within the rate limit window
    if (now - cache.lastCall < this.RATE_LIMIT_WINDOW) {
      cache.callCount++;
      
      if (cache.callCount > this.MAX_CALLS_PER_WINDOW) {
        // Calculate delay to wait before next call
        const delayMs = this.RATE_LIMIT_WINDOW - (now - cache.lastCall);
        logger.warn(`Rate limit reached for ${endpoint}, waiting ${delayMs}ms`);
        await new Promise(resolve => setTimeout(resolve, delayMs));
        
        // Reset the counter after waiting
        cache.lastCall = Date.now();
        cache.callCount = 1;
      }
    } else {
      // Reset the window
      cache.lastCall = now;
      cache.callCount = 1;
    }
  }


  /**
   * Check if a user has registered API keys
   */
 public async checkApiKeyStatus(userId: string | number): Promise<boolean> {
    try {
      await this.checkRateLimit('checkApiKeyStatus');
      
      const response = await fetch(`${this.proxyServerUrl}/api/user/${userId}/key-status`, {
        signal: AbortSignal.timeout(this.defaultTimeout)
      });

      if (!response.ok) {
        if (response.status === 429) {
          logger.warn(`Rate limit hit for checkApiKeyStatus: ${userId}`);
          // Return cached value or false
          return false;
        }
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
        data: { symbol, side, quantity, price }
      });

      const response = await fetch(`${this.proxyServerUrl}/api/trade`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId.toString(),
          symbol,
          side,
          quantity: quantity.toFixed(8),
          price: price?.toFixed(8),
          type: price ? 'LIMIT' : 'MARKET'
        }),
        signal: AbortSignal.timeout(this.defaultTimeout)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: `HTTP error: ${response.status}` }));
        throw new Error(errorData.message || `Trade execution failed: ${response.status}`);
      }

      const result = await response.json();
      
      logger.info(`Trade executed successfully for ${symbol}`, {
        context: 'TradingProxy',
        userId,
        data: { orderId: result.orderId }
      });

      return {
        orderId: result.orderId,
        symbol: result.symbol,
        side: result.side,
        quantity: Number(result.executedQty),
        price: Number(result.price || result.fills?.[0]?.price || 0),
        status: result.status,
        timestamp: result.transactTime,
      };
    } catch (error) {
      logger.error(`Trade execution error: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }

  /**
   * Get user trades
   */
  public async getUserTrades(userId: string | number): Promise<any[]> {
    try {
      logger.info(`Fetching trades for user ${userId}`, {
        context: 'TradingProxy'
      });

      // First check if the API keys are registered
      const hasKeys = await this.checkApiKeyStatus(userId);
      if (!hasKeys) {
        throw new Error('API keys not found or not registered');
      }

      // Make request to the proxy server
      const response = await fetch(`${this.proxyServerUrl}/api/trades`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: userId.toString(),
          limit: 100
        }),
        signal: AbortSignal.timeout(this.defaultTimeout)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error: ${response.status}` }));
        throw new Error(errorData.error || `Failed to fetch trades: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch trades from proxy');
      }

      // Transform trades to consistent format
      return (data.trades || []).map((trade: any) => ({
        id: trade.id,
        symbol: trade.symbol,
        token: trade.symbol.replace(/USDT$|BUSD$/, ''),
        type: trade.isBuyer ? 'BUY' : 'SELL',
        price: parseFloat(trade.price),
        amount: parseFloat(trade.qty),
        time: new Date(trade.time).toISOString(),
        commission: parseFloat(trade.commission),
        commissionAsset: trade.commissionAsset,
        total: (parseFloat(trade.price) * parseFloat(trade.qty)).toFixed(8),
        isMaker: trade.isMaker
      }));
    } catch (error) {
      logger.error(`Error fetching trades from proxy: ${error instanceof Error ? error.message : "Unknown error"}`);
      throw error;
    }
  }
   
   private portfolioCache: Map<string, { data: any; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 30000;

// lib/trading-proxy.ts
public async getPortfolio(userId: string | number): Promise<any> {
  try {
    const cacheKey = `portfolio_${userId}`;
    const cached = this.portfolioCache.get(cacheKey);

    // Return cached data if fresh (within 30 seconds)
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      logger.info(`Returning cached portfolio for user ${userId}`);
      return cached.data;
    }

    logger.info(`Getting portfolio for user ${userId}`, {
      context: 'TradingProxy'
    });

    // Use the simple endpoint
    const response = await fetch(`${this.proxyServerUrl}/api/user/${userId}/portfolio/simple`, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('API keys not found or not registered');
      }
      throw new Error(`Portfolio fetch failed: ${response.status}`);
    }

    const portfolioData = await response.json();
    
    // Add calculated fields for compatibility
    const enhancedData = {
      ...portfolioData,
      realizedPnl: 0, // These would need trade history
      unrealizedPnl: 0, // These would need entry prices
    };

    // Cache the result
    this.portfolioCache.set(cacheKey, {
      data: enhancedData,
      timestamp: Date.now()
    });

    logger.info(`Portfolio fetched: $${portfolioData.totalValue}`, {
      context: 'TradingProxy',
      userId
    });

    return enhancedData;
  } catch (error) {
    logger.error(`Error fetching portfolio: ${error instanceof Error ? error.message : "Unknown error"}`);
    throw error;
  }
}

// Add a batch price fetching method
public async getBatchPrices(userId: string | number): Promise<Record<string, number>> {
  try {
    const response = await fetch(`${this.proxyServerUrl}/api/user/${userId}/prices/batch`, {
      signal: AbortSignal.timeout(this.defaultTimeout)
    });

    if (!response.ok) {
      throw new Error(`Batch price fetch failed: ${response.status}`);
    }

    const data = await response.json();
    return data.prices || {};
  } catch (error) {
    logger.error(`Error fetching batch prices: ${error instanceof Error ? error.message : 'Unknown error'}`);
    throw error;
  }
}

// Fallback method (your existing logic but optimized)
private async getPortfolioFallback(userId: string | number): Promise<any> {
  try {
    // Check API keys first
    const hasKeys = await this.checkApiKeyStatus(userId);
    if (!hasKeys) {
      throw new Error('API keys not found or not registered');
    }

    // Get account balances and prices in parallel
    const [accountInfo, batchPrices] = await Promise.all([
      this.executeProxyRequest(userId, '/api/v3/account'),
      this.getBatchPrices(userId)
    ]);

    if (!accountInfo || !accountInfo.balances) {
      throw new Error('Failed to fetch account information');
    }

    // Process balances using batch prices
    const balances = accountInfo.balances
      .filter((b: any) => parseFloat(b.free) > 0 || parseFloat(b.locked) > 0);

    let totalValue = 0;
    let freeCapital = 0;
    let allocatedCapital = 0;
    const holdings = [];

    for (const balance of balances) {
      const asset = balance.asset;
      const total = parseFloat(balance.free) + parseFloat(balance.locked);
      
      let value = 0;
      let currentPrice = 0;

      if (['USDT', 'BUSD', 'USDC', 'DAI'].includes(asset)) {
        value = total;
        currentPrice = 1;
        freeCapital += value;
      } else {
        // Try to find price in batch prices
        const pairs = [`${asset}USDT`, `${asset}BUSD`, `${asset}USDC`];
        
        for (const pair of pairs) {
          if (batchPrices[pair]) {
            currentPrice = batchPrices[pair];
            value = total * currentPrice;
            break;
          }
        }

        if (value > 0) {
          holdings.push({
            token: asset,
            amount: total,
            currentPrice,
            value,
            pnl: 0,
            pnlPercentage: 0
          });
          allocatedCapital += value;
        }
      }

      totalValue += value;
    }

    const portfolioData = {
      totalValue,
      freeCapital,
      allocatedCapital,
      holdings: holdings.sort((a, b) => b.value - a.value),
      realizedPnl: 0,
      unrealizedPnl: 0
    };

    // Cache the result
    this.portfolioCache.set(`portfolio_${userId}`, {
      data: portfolioData,
      timestamp: Date.now()
    });

    return portfolioData;
  } catch (error) {
    throw error;
  }
}
  /**
   * Validate if a symbol exists on the exchange
   */
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