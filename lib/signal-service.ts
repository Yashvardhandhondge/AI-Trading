// lib/signal-service.ts
import { logger } from "@/lib/logger";
import { EkinApiService } from "@/lib/ekin-api";

// Define interfaces for signal data
export interface Signal {
  id: string;
  type: "BUY" | "SELL";
  token: string;
  price: number;
  riskLevel: "low" | "medium" | "high";
  risk?: number;
  createdAt: string;
  expiresAt: string;
  autoExecuted?: boolean;
  link?: string;
  positives?: string[];
  warnings?: string[];
  warning_count?: number;
}

export interface SignalQueryOptions {
  userId?: string | number;
  includeExpired?: boolean;
  tokenFilter?: string[];
  riskLevel?: "low" | "medium" | "high";
  signalType?: "BUY" | "SELL";
  limit?: number;
}

class SignalService {
  private static instance: SignalService;
  private ekinUpdateInterval: number = 5 * 60 * 1000; // 5 minutes
  private lastEkinUpdate: number = 0;
  private cachedSignals: Signal[] = [];

  private constructor() {
    // Initialize
  }

  public static getInstance(): SignalService {
    if (!SignalService.instance) {
      SignalService.instance = new SignalService();
    }
    return SignalService.instance;
  }

  /**
   * Get signals from the API, with retries and fallbacks
   */
  public async getSignals(options: SignalQueryOptions = {}): Promise<Signal[]> {
    try {
      // Try database API first
      const signals = await this.fetchSignalsFromAPI(options);
      
      // If we got signals from the API, return them
      if (signals && signals.length > 0) {
        this.cachedSignals = signals;
        return signals;
      }
      
      // If no signals from API, try Ekin API directly if it's been more than 5 minutes
      // since our last update or if we have no cached signals
      if (Date.now() - this.lastEkinUpdate > this.ekinUpdateInterval || this.cachedSignals.length === 0) {
        const ekinSignals = await this.fetchSignalsFromEkin(options);
        
        if (ekinSignals && ekinSignals.length > 0) {
          this.cachedSignals = ekinSignals;
          this.lastEkinUpdate = Date.now();
          
          // Try to store these signals in our database
          await this.storeSignalsInDatabase(ekinSignals);
          
          return ekinSignals;
        }
      }
      
      // If we still don't have signals, return cached signals or empty array
      return this.cachedSignals.length > 0 ? this.cachedSignals : [];
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error fetching signals: ${errorMessage}`);
      
      // Return cached signals as a fallback
      return this.cachedSignals.length > 0 ? this.cachedSignals : [];
    }
  }
  
  /**
   * Fetch signals from our API endpoint
   */
  private async fetchSignalsFromAPI(options: SignalQueryOptions): Promise<Signal[]> {
    try {
      // Build query string from options
      const queryParams = new URLSearchParams();
      
      if (options.includeExpired) {
        queryParams.append("includeExpired", "true");
      }
      
      if (options.riskLevel) {
        queryParams.append("riskLevel", options.riskLevel);
      }
      
      if (options.signalType) {
        queryParams.append("type", options.signalType);
      }
      
      if (options.limit) {
        queryParams.append("limit", options.limit.toString());
      }
      
      const queryString = queryParams.toString() ? `?${queryParams.toString()}` : "";
      
      // Fetch from API
      const response = await fetch(`/api/signals/list${queryString}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        // Add a cache busting parameter to avoid cached responses
        cache: "no-store",
      });
      
      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.signals && Array.isArray(data.signals)) {
        logger.info(`Fetched ${data.signals.length} signals from API`);
        return data.signals;
      }
      
      return [];
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error fetching signals from API: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Fetch signals directly from Ekin API
   */
  private async fetchSignalsFromEkin(options: SignalQueryOptions): Promise<Signal[]> {
    try {
      logger.info("Fetching signals directly from Ekin API");
      
      // Use the EkinApiService to get signals
      const ekinSignals = await EkinApiService.getSignals();
      
      if (!ekinSignals || ekinSignals.length === 0) {
        return [];
      }
      
      // Convert Ekin signals to our format
      const signals: Signal[] = ekinSignals.map(ekinSignal => {
        const appSignal = EkinApiService.convertToAppSignal(ekinSignal);
        return {
          id: `ekin-${ekinSignal.symbol}-${Date.now()}`,
          type: appSignal.type,
          token: appSignal.token,
          price: appSignal.price,
          riskLevel: appSignal.riskLevel as "low" | "medium" | "high",
          risk: ekinSignal.risk,
          createdAt: new Date().toISOString(),
          expiresAt: appSignal.expiresAt.toISOString(),
          autoExecuted: false,
          link: ekinSignal.link,
          positives: ekinSignal.positives,
          warnings: ekinSignal.warnings,
          warning_count: ekinSignal.warning_count
        };
      });
      
      // Apply filtering based on options
      let filteredSignals = signals;
      
      if (options.riskLevel) {
        filteredSignals = filteredSignals.filter(s => s.riskLevel === options.riskLevel);
      }
      
      if (options.signalType) {
        filteredSignals = filteredSignals.filter(s => s.type === options.signalType);
      }
      
      if (options.tokenFilter && options.tokenFilter.length > 0) {
        filteredSignals = filteredSignals.filter(s => options.tokenFilter?.includes(s.token));
      }
      
      if (options.limit) {
        filteredSignals = filteredSignals.slice(0, options.limit);
      }
      
      logger.info(`Fetched ${filteredSignals.length} signals from Ekin API`);
      
      return filteredSignals;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error fetching signals from Ekin API: ${errorMessage}`);
      throw error;
    }
  }
  
  /**
   * Store signals in our database for future reference
   */
  private async storeSignalsInDatabase(signals: Signal[]): Promise<void> {
    try {
      // Loop through signals and store each one
      for (const signal of signals) {
        await fetch("/api/signals/store", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(signal),
        });
      }
      
      logger.info(`Stored ${signals.length} signals in database`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error storing signals in database: ${errorMessage}`);
      // Don't throw here, just log the error
    }
  }
  
  /**
   * Check if there are new signals available
   */
  public async checkForNewSignals(lastCheckTime: number): Promise<{hasNew: boolean, newSignals: Signal[]}> {
    try {
      // Get signals from the last minute
      const response = await fetch(`/api/signals/latest?since=${lastCheckTime}`);
      
      if (!response.ok) {
        return { hasNew: false, newSignals: [] };
      }
      
      const data = await response.json();
      
      if (data.signals && Array.isArray(data.signals) && data.signals.length > 0) {
        logger.info(`Found ${data.signals.length} new signals`);
        return { hasNew: true, newSignals: data.signals };
      }
      
      return { hasNew: false, newSignals: [] };
    } catch (error) {
      logger.error(`Error checking for new signals: ${error instanceof Error ? error.message : "Unknown error"}`);
      return { hasNew: false, newSignals: [] };
    }
  }
  
  /**
   * Execute an action on a signal (accept, skip, accept-partial)
   */
  public async executeSignalAction(
    signalId: string, 
    action: "accept" | "skip" | "accept-partial", 
    percentage?: number
  ): Promise<boolean> {
    try {
      logger.info(`Executing ${action} on signal ${signalId}`);
      
      const body: Record<string, any> = {};
      if (percentage !== undefined) {
        body.percentage = percentage;
      }
      
      const response = await fetch(`/api/signals/${signalId}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error ${response.status}`);
      }
      
      logger.info(`Successfully executed ${action} on signal ${signalId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error executing signal action: ${errorMessage}`);
      throw error;
    }
  }
}

// Export a singleton instance
export const signalService = SignalService.getInstance();