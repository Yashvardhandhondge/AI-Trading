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

  /**
   * Get portfolio data
   */
  public async getPortfolio(userId: string | number): Promise<any> {
    try {
      logger.info(`Getting portfolio for user ${userId}`, {
        context: 'TradingProxy'
      });

      // First check if the API keys are registered
      const hasKeys = await this.checkApiKeyStatus(userId);
      if (!hasKeys) {
        throw new Error('API keys not found or not registered');
      }

      // Get account info from Binance
      const accountInfo = await this.executeProxyRequest(userId, '/api/v3/account');
      
      if (!accountInfo || !accountInfo.balances) {
        throw new Error('Failed to fetch account information');
      }

      // Get current prices for all assets      // Use the working getBalances method to get balances
      const balances = await this.getBalances(userId);
      
      // Get current prices for all assets
      const pricePromises = balances.map(async (balance: any) => {
        if (['USDT', 'BUSD', 'USDC'].includes(balance.asset)) return 1;
        try {
          const price = await this.getPrice(userId, `${balance.asset}USDT`);
          return price;
        } catch {
          return 0;
        }
      });

      const prices = await Promise.all(pricePromises);

      // Calculate portfolio values
      let totalValue = 0;
      let freeCapital = 0;
      let allocatedCapital = 0;
      const holdings = [];

      for (let i = 0; i < balances.length; i++) {
        const balance = balances[i];
        const price = prices[i];
        const value = balance.total * price;

        if (['USDT', 'BUSD', 'USDC', 'DAI'].includes(balance.asset)) {
          freeCapital += value;
        } else if (value > 0) {
          holdings.push({
            token: balance.asset,            // Changed from symbol to token
            amount: balance.total,           // Changed from quantity to amount
            currentPrice: price,             // Changed from price to currentPrice
            value: value,
            pnl: 0,                         // Will be calculated later if needed
            pnlPercentage: 0                // Will be calculated later if needed
          });
          allocatedCapital += value;
        }
        totalValue += value;
      }

      totalValue = freeCapital + allocatedCapital;

      return {
        totalValue,
        freeCapital,
        allocatedCapital,
        holdings,
        realizedPnl: 0, // This would need to be calculated from trade history
        unrealizedPnl: 0 // This would need average entry prices to calculate
      };
    } catch (error) {
      logger.error(`Error fetching portfolio from proxy: ${error instanceof Error ? error.message : "Unknown error"}`);
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