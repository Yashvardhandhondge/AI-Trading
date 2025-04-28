/**
 * Enhanced Ekin API Service
 *
 * This module provides improved functions to interact with Ekin's API endpoints
 * for trading signals and risk data with better error handling and caching.
 */

import { logger } from "@/lib/logger";

export interface EkinSignal {
  type: "BUY" | "SELL";
  symbol: string;
  warnings: string[];
  price: number;
  link: string;
  warning_count: number;
  positives: string[];
  risk: number;
  risk_usdt: number;
  date: string;
}

export interface EkinRiskData {
  name: string;
  symbol: string;
  price: string;
  volume: string;
  chainId: string;
  tokenAddress: string;
  icon: string;
  risk: number;
  risk_usdt: number;
  "3mChange": string;
  "1mChange": string;
  "2wChange": string;
  bubbleSize: string;
  warnings: string[];
}

export type EkinRiskResponse = Record<string, EkinRiskData>;

class EkinApiServiceClass {
  private BASE_URL = "https://api.coinchart.fun";
  private DEFAULT_TIMEOUT = 10000;
  // Cache for signal data to reduce API calls
  private signalCache: {
    data: EkinSignal[];
    timestamp: number;
    expiresIn: number;
  } = {
    data: [],
    timestamp: 0,
    expiresIn: 5 * 60 * 1000 // 5 minutes cache
  };
  
  // Cache for risk data
  private riskCache: {
    binance: { data: EkinRiskResponse; timestamp: number; };
    btcc: { data: EkinRiskResponse; timestamp: number; };
    expiresIn: number;
  } = {
    binance: { data: {}, timestamp: 0 },
    btcc: { data: {}, timestamp: 0 },
    expiresIn: 15 * 60 * 1000 // 15 minutes cache
  };

  /**
   * Fetch trading signals from Ekin's API with caching
   */
  async getSignals(forceRefresh = false): Promise<EkinSignal[]> {
    try {
      const now = Date.now();
      
      // Return cached data if it's still valid and not forcing refresh
      if (
        !forceRefresh && 
        this.signalCache.data.length > 0 && 
        now - this.signalCache.timestamp < this.signalCache.expiresIn
      ) {
        logger.debug(`Returning ${this.signalCache.data.length} signals from cache`, {
          context: "EkinAPI"
        });
        return this.signalCache.data;
      }
      
      logger.info("Fetching signals from Ekin API", {
        context: "EkinAPI"
      });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.DEFAULT_TIMEOUT);
      
      try {
        const response = await fetch(`${this.BASE_URL}/signals`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch signals: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Validate and process the data
        if (!Array.isArray(data)) {
          throw new Error("Invalid response format - expected array");
        }
        
        // Set cache
        this.signalCache = {
          data,
          timestamp: now,
          expiresIn: this.signalCache.expiresIn
        };
        
        logger.info(`Fetched ${data.length} signals from Ekin API`, {
          context: "EkinAPI"
        });
        
        return data;
      } catch (error) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error fetching signals from Ekin API: ${errorMessage}`);
      
      // If we have cached data, return it as fallback
      if (this.signalCache.data.length > 0) {
        logger.info(`Returning ${this.signalCache.data.length} signals from cache as fallback`);
        return this.signalCache.data;
      }
      
      throw error;
    }
  }

  /**
   * Fetch risk data for Binance from Ekin's API with caching
   */
  async getBinanceRisks(forceRefresh = false): Promise<EkinRiskResponse> {
    try {
      const now = Date.now();
      
      // Return cached data if it's still valid and not forcing refresh
      if (
        !forceRefresh && 
        Object.keys(this.riskCache.binance.data).length > 0 && 
        now - this.riskCache.binance.timestamp < this.riskCache.expiresIn
      ) {
        logger.debug("Returning Binance risks from cache", {
          context: "EkinAPI"
        });
        return this.riskCache.binance.data;
      }
      
      logger.info("Fetching Binance risks from Ekin API", {
        context: "EkinAPI"
      });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.DEFAULT_TIMEOUT);
      
      try {
        const response = await fetch(`${this.BASE_URL}/risks/binance`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch Binance risks: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Set cache
        this.riskCache.binance = {
          data,
          timestamp: now
        };
        
        return data;
      } catch (error) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error fetching Binance risks from Ekin API: ${errorMessage}`);
      
      // If we have cached data, return it as fallback
      if (Object.keys(this.riskCache.binance.data).length > 0) {
        logger.info("Returning Binance risks from cache as fallback");
        return this.riskCache.binance.data;
      }
      
      throw error;
    }
  }

  /**
   * Fetch risk data for BTCC from Ekin's API with caching
   */
  async getBtccRisks(forceRefresh = false): Promise<EkinRiskResponse> {
    try {
      const now = Date.now();
      
      // Return cached data if it's still valid and not forcing refresh
      if (
        !forceRefresh && 
        Object.keys(this.riskCache.btcc.data).length > 0 && 
        now - this.riskCache.btcc.timestamp < this.riskCache.expiresIn
      ) {
        logger.debug("Returning BTCC risks from cache", {
          context: "EkinAPI"
        });
        return this.riskCache.btcc.data;
      }
      
      logger.info("Fetching BTCC risks from Ekin API", {
        context: "EkinAPI"
      });
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.DEFAULT_TIMEOUT);
      
      try {
        const response = await fetch(`${this.BASE_URL}/risks/btcc`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`Failed to fetch BTCC risks: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Set cache
        this.riskCache.btcc = {
          data,
          timestamp: now
        };
        
        return data;
      } catch (error) {
        if (error && typeof error === 'object' && 'name' in error && error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error fetching BTCC risks from Ekin API: ${errorMessage}`);
      
      // If we have cached data, return it as fallback
      if (Object.keys(this.riskCache.btcc.data).length > 0) {
        logger.info("Returning BTCC risks from cache as fallback");
        return this.riskCache.btcc.data;
      }
      
      throw error;
    }
  }

  /**
   * Get risk data for a specific exchange
   */
  async getRisksByExchange(exchange: "binance" | "btcc", forceRefresh = false): Promise<EkinRiskResponse> {
    if (exchange === "binance") {
      return this.getBinanceRisks(forceRefresh);
    } else {
      return this.getBtccRisks(forceRefresh);
    }
  }

  /**
   * Convert Ekin signal to our app format
   */
  convertToAppSignal(ekinSignal: EkinSignal): any {
    // Determine signal type - use the type from the signal or infer based on risk
    const type = ekinSignal.type || (ekinSignal.risk < 50 ? "BUY" : "SELL");
  
    // Map risk level
    let riskLevel: "low" | "medium" | "high";
    if (ekinSignal.risk < 30) {
      riskLevel = "low";
    } else if (ekinSignal.risk < 70) {
      riskLevel = "medium";
    } else {
      riskLevel = "high";
    }
  
    // Calculate expiration time (10 minutes from now)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10);
  
    return {
      type,
      token: ekinSignal.symbol,
      price: ekinSignal.price,
      riskLevel,
      createdAt: new Date(),
      expiresAt,
      autoExecuted: false,
      link: ekinSignal.link,
      positives: ekinSignal.positives,
      warnings: ekinSignal.warnings,
      warning_count: ekinSignal.warning_count,
    };
  }

  /**
   * Get risk level based on numeric risk value
   */
  getRiskLevel(risk: number): "low" | "medium" | "high" {
    if (risk < 30) {
      return "low";
    } else if (risk < 70) {
      return "medium";
    } else {
      return "high";
    }
  }
  
  /**
   * Force refresh all caches
   */
  refreshCaches(): void {
    this.signalCache.timestamp = 0;
    this.riskCache.binance.timestamp = 0;
    this.riskCache.btcc.timestamp = 0;
    
    logger.info("Ekin API caches have been invalidated", {
      context: "EkinAPI"
    });
  }
}

// Export a singleton instance
export const EkinApiService = new EkinApiServiceClass();