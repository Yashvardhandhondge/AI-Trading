/**
 * Ekin API Service
 *
 * This module provides functions to interact with Ekin's API endpoints
 * for trading signals and risk data.
 */

export interface EkinSignal {
    type: "BUY" | "SELL";

    symbol: string
    warnings: string[]
    price: number
    link: string
    warning_count: number
    positives: string[]
    risk: number
    risk_usdt: number
    date: string
  }
  
  export interface EkinRiskData {
    name: string
    symbol: string
    price: string
    volume: string
    chainId: string
    tokenAddress: string
    icon: string
    risk: number
    risk_usdt: number
    "3mChange": string
    "1mChange": string
    "2wChange": string
    bubbleSize: string
    warnings: string[]
  }
  
  export type EkinRiskResponse = Record<string, EkinRiskData>
  
  export class EkinApiService {
    private static BASE_URL = "https://api.coinchart.fun"
  
    /**
     * Fetch trading signals from Ekin's API
     */
    static async getSignals(): Promise<EkinSignal[]> {
      try {
        const response = await fetch(`${this.BASE_URL}/signals`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        })
  
        if (!response.ok) {
          throw new Error(`Failed to fetch signals: ${response.status}`)
        }
  
        return await response.json()
      } catch (error) {
        console.error("Error fetching signals from Ekin API:", error)
        throw error
      }
    }
  
    /**
     * Fetch risk data for Binance from Ekin's API
     */
    static async getBinanceRisks(): Promise<EkinRiskResponse> {
      try {
        const response = await fetch(`${this.BASE_URL}/risks/binance`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        })
  
        if (!response.ok) {
          throw new Error(`Failed to fetch Binance risks: ${response.status}`)
        }
  
        return await response.json()
      } catch (error) {
        console.error("Error fetching Binance risks from Ekin API:", error)
        throw error
      }
    }
  
    /**
     * Fetch risk data for BTCC from Ekin's API
     */
    static async getBtccRisks(): Promise<EkinRiskResponse> {
      try {
        const response = await fetch(`${this.BASE_URL}/risks/btcc`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        })
  
        if (!response.ok) {
          throw new Error(`Failed to fetch BTCC risks: ${response.status}`)
        }
  
        return await response.json()
      } catch (error) {
        console.error("Error fetching BTCC risks from Ekin API:", error)
        throw error
      }
    }
  
    /**
     * Get risk data for a specific exchange
     */
    static async getRisksByExchange(exchange: "binance" | "btcc"): Promise<EkinRiskResponse> {
      if (exchange === "binance") {
        return this.getBinanceRisks()
      } else {
        return this.getBtccRisks()
      }
    }
  
    // Update the convertToAppSignal method to handle signal type determination
    static convertToAppSignal(ekinSignal: EkinSignal): any {
      // Determine signal type based on risk
      // Lower risk suggests BUY, higher risk suggests SELL
      const type = ekinSignal.risk < 50 ? "BUY" : "SELL"
  
      // Map risk level
      let riskLevel: "low" | "medium" | "high"
      if (ekinSignal.risk < 30) {
        riskLevel = "low"
      } else if (ekinSignal.risk < 70) {
        riskLevel = "medium"
      } else {
        riskLevel = "high"
      }
  
      // Calculate expiration time (10 minutes from now)
      const expiresAt = new Date()
      expiresAt.setMinutes(expiresAt.getMinutes() + 10)
  
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
      }
    }
  
    /**
     * Get risk level based on numeric risk value
     */
    static getRiskLevel(risk: number): "low" | "medium" | "high" {
      if (risk < 30) {
        return "low"
      } else if (risk < 70) {
        return "medium"
      } else {
        return "high"
      }
    }
  }
  