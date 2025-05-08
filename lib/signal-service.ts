// Updated SignalService to better handle signal data with proper TypeScript typing
// lib/signal-service.ts
import { logger } from "@/lib/logger";
import { EkinApiService } from "@/lib/ekin-api";

// Define interfaces for signal data
export interface Signal {
  id: string; // Ensure id is always defined
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
  processed?: boolean;
  action?: string;
  isOldSignal?: boolean;
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
   * Generate a temporary ID for signals that don't have one
   * This ensures all signals have an ID before being used in the UI
   */
  private generateTemporaryId(signal: Partial<Signal>): string {
    // Create a deterministic ID based on signal properties
    const idBase = `${signal.type || "UNKNOWN"}_${signal.token || "UNKNOWN"}_${signal.price || 0}`;
    return `temp_${idBase}_${Date.now()}`;
  }

  private storeSignalExpiryTimes(signals: Signal[]): void {
    try {
      // Get existing stored expiry times
      const storedExpiryTimes = localStorage.getItem('signalExpiryTimes');
      const expiryTimes: Record<string, string> = storedExpiryTimes ? 
        JSON.parse(storedExpiryTimes) : {};
      
      // Update with new signals
      signals.forEach(signal => {
        // Only store if we don't already have this signal's expiry time
        if (!expiryTimes[signal.id]) {
          expiryTimes[signal.id] = signal.expiresAt;
        }
      });
      
      // Save back to localStorage
      localStorage.setItem('signalExpiryTimes', JSON.stringify(expiryTimes));
    } catch (error) {
      logger.error(`Error storing signal expiry times: ${error instanceof Error ? error.message : "Unknown error"}`);
      // Non-critical error, so just log and continue
    }
  }
  

  /**
   * Get signals from the API, with retries and fallbacks
   */
  public async getSignals(options: SignalQueryOptions = {}): Promise<Signal[]> {
    try {
      // Try database API first
      const signals = await this.fetchSignalsFromAPI(options);
      
      // Ensure all signals have an ID and created/expiry times are properly formatted
      const validatedSignals = this.processSignals(signals);
      
      // Store expiry times in localStorage for persistence
      this.storeSignalExpiryTimes(validatedSignals);
      
      // If we got signals from the API, return them
      if (validatedSignals && validatedSignals.length > 0) {
        this.cachedSignals = validatedSignals;
        return validatedSignals;
      }
      // If no signals from API, try Ekin API directly if it's been more than 5 minutes
      // since our last update or if we have no cached signals
      if (Date.now() - this.lastEkinUpdate > this.ekinUpdateInterval || this.cachedSignals.length === 0) {
        const ekinSignals = await this.fetchSignalsFromEkin(options);
        
        if (ekinSignals && ekinSignals.length > 0) {
          // Process signals from Ekin API
          const validatedEkinSignals = this.processSignals(ekinSignals);
          this.cachedSignals = validatedEkinSignals;
          this.lastEkinUpdate = Date.now();
          
          // Try to store these signals in our database
          await this.storeSignalsInDatabase(validatedEkinSignals);
          
          return validatedEkinSignals;
        }
      }
      
      // If we still don't have signals, return cached signals or empty array
      return this.cachedSignals.length > 0 ? this.processSignals(this.cachedSignals) : [];
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error fetching signals: ${errorMessage}`);
      
      // Return cached signals as a fallback
      return this.cachedSignals.length > 0 ? this.processSignals(this.cachedSignals) : [];
    }
  }
  
  /**
   * Process signals to ensure they have IDs and proper timestamps
   */
// In the processSignals method
private processSignals(signals: any[]): Signal[] {
  if (!signals || !Array.isArray(signals)) return [];
  let storedExpiryTimes: Record<string, string> = {};

  try {
    // Get stored expiry times if available
    const storedData = localStorage.getItem('signalExpiryTimes');
    if (storedData) {
      storedExpiryTimes = JSON.parse(storedData);
    }
  } catch (error) {
    logger.error(`Error reading stored expiry times: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
  
  return signals.map((signal: any): Signal => {
    // Ensure every signal has an ID
    const id = signal.id || this.generateTemporaryId(signal);

    let expiresAt = signal.expiresAt;
    if (storedExpiryTimes[id]) {
      expiresAt = storedExpiryTimes[id];
      logger.debug(`Using stored expiry time for signal ${id}`);
    } else if (!expiresAt || isNaN(new Date(expiresAt).getTime())) {
      // Set expiration to 10 minutes after creation if invalid
      const creationTime = signal.createdAt && !isNaN(new Date(signal.createdAt).getTime()) ?
        new Date(signal.createdAt).getTime() : Date.now();
      const expiry = new Date(creationTime + 10 * 60 * 1000);
      expiresAt = expiry.toISOString();
    }
    
    // Ensure createdAt has a valid date
    let createdAt = signal.createdAt;
    if (!createdAt || isNaN(new Date(createdAt).getTime())) {
      createdAt = new Date().toISOString();
      logger.debug(`Fixed invalid createdAt for signal ${id}`);
    }
    
    // Ensure expiresAt has a valid date

    if (!expiresAt || isNaN(new Date(expiresAt).getTime())) {
      // Set expiration to 10 minutes after creation
      const expiry = new Date(new Date(createdAt).getTime() + 10 * 60 * 1000);
      expiresAt = expiry.toISOString();
      logger.debug(`Fixed invalid expiresAt for signal ${id}`);
    }
    
    // Calculate if this is an old signal (more than 10 minutes since creation)
    const isOldSignal = new Date().getTime() - new Date(createdAt).getTime() > 10 * 60 * 1000;
    
    return {
      ...signal,
      id,
      createdAt,
      expiresAt,
      isOldSignal,
      type: signal.type as "BUY" | "SELL",
      riskLevel: signal.riskLevel as "low" | "medium" | "high"
    };
  });
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
      
      // Add timestamp to avoid caching
      queryParams.append("_t", Date.now().toString());
      
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
      const signals: Signal[] = ekinSignals.map((ekinSignal: any): Signal => {
        const appSignal = EkinApiService.convertToAppSignal(ekinSignal);
        
        return {
          id: this.generateTemporaryId({
            type: appSignal.type,
            token: appSignal.token,
            price: appSignal.price
          }),
          type: appSignal.type as "BUY" | "SELL",
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
        // Ensure required fields are present
        if (!signal.type || !signal.token || !signal.price || !signal.riskLevel || !signal.expiresAt) {
          logger.warn(`Skipping storing signal due to missing required fields: ${signal.id}`);
          continue;
        }
        
        await fetch("/api/signals/store", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(signal),
        });
      }
      
      logger.info(`Attempted to store ${signals.length} signals in database`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error(`Error storing signals in database: ${errorMessage}`);
      // Don't throw here, just log the error
    }
  }
  
  /**
   * Check if there are new signals available since the last check time
   */
  public async checkForNewSignals(lastCheckTime: number): Promise<{hasNew: boolean, newSignals: Signal[]}> {
    try {
      // Get signals from the last minute
      const response = await fetch(`/api/signals/latest?since=${lastCheckTime}&_t=${Date.now()}`);
      
      if (!response.ok) {
        return { hasNew: false, newSignals: [] };
      }
      
      const data = await response.json();
      
      if (data.signals && Array.isArray(data.signals) && data.signals.length > 0) {
        // Process new signals
        const validatedSignals = this.processSignals(data.signals);
        logger.info(`Found ${validatedSignals.length} new signals`);
        return { hasNew: true, newSignals: validatedSignals };
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
      if (!signalId || signalId === "undefined") {
        logger.error("Cannot execute action: Signal ID is undefined or invalid");
        throw new Error("Invalid signal ID. Action cannot be processed.");
      }
      
      logger.info(`Executing ${action} on signal ${signalId}`);
      
      const body: Record<string, any> = {};
      if (percentage !== undefined) {
        body.percentage = percentage;
      }
      
      // First check if this is a temporary ID (starts with temp_)
      if (signalId.startsWith('temp_')) {
        logger.info(`Processing temporary signal ID: ${signalId}`);
        
        // For temporary IDs, we need to create the signal in the database first
        // Extract the signal from cached signals
        const signal = this.cachedSignals.find(s => s.id === signalId);
        
        if (!signal) {
          throw new Error(`Signal with ID ${signalId} not found in cache`);
        }
        
        // Store signal in database to get a real MongoDB ID
        try {
          const storeResponse = await fetch("/api/signals/store", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(signal),
          });
          
          if (!storeResponse.ok) {
            throw new Error(`Failed to store signal: ${storeResponse.status}`);
          }
          
          const storeData = await storeResponse.json();
          
          if (!storeData.success || !storeData.signalId) {
            throw new Error("No signal ID returned from store operation");
          }
          
          // Use the real MongoDB ID for the action
          signalId = storeData.signalId;
          logger.info(`Temporary signal stored successfully with real ID: ${signalId}`);
        } catch (storeError) {
          logger.error(`Error storing temporary signal: ${storeError instanceof Error ? storeError.message : "Unknown error"}`);
          throw new Error("Failed to prepare signal for action");
        }
      }
      
      // Now execute the action with the real ID
      const response = await fetch(`/api/signals/${signalId}/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Error ${response.status}` }));
        const errorMessage = errorData.error || errorData.message || `Error ${response.status}`;
        throw new Error(errorMessage);
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