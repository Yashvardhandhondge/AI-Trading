import axios from "axios"
import crypto from "crypto"
import { decryptApiKey } from "./db"
import { logger } from "./logger"

const API_SECRET_KEY = process.env.API_SECRET_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

export interface ExchangeCredentials {
  apiKey: string
  apiSecret: string
}

export interface Balance {
  asset: string
  free: number
  locked: number
  total: number
}

export interface Portfolio {
  totalValue: number
  freeCapital: number
  allocatedCapital: number
  holdings: {
    token: string
    amount: number
    averagePrice: number
    currentPrice: number
    value: number
    pnl: number
    pnlPercentage: number
  }[]
}

export interface TradeParams {
  symbol: string
  side: "BUY" | "SELL"
  quantity: number
  price?: number // For limit orders
}

export interface TradeResult {
  orderId: string
  symbol: string
  side: "BUY" | "SELL"
  quantity: number
  price: number
  status: "FILLED" | "PARTIALLY_FILLED" | "REJECTED"
  timestamp: number
}

export class ExchangeService {
  private apiKey: string
  private apiSecret: string
  private exchange: "binance" | "btcc"
  private baseUrl: string

  constructor(exchange: "binance" | "btcc", credentials: ExchangeCredentials) {
    this.exchange = exchange

    // Decrypt API credentials if they're encrypted
    if (credentials.apiKey.includes(":")) {
      this.apiKey = decryptApiKey(credentials.apiKey, API_SECRET_KEY)
    } else {
      this.apiKey = credentials.apiKey
    }

    if (credentials.apiSecret.includes(":")) {
      this.apiSecret = decryptApiKey(credentials.apiSecret, API_SECRET_KEY)
    } else {
      this.apiSecret = credentials.apiSecret
    }

    // Set base URL based on exchange
    this.baseUrl = exchange === "binance" ? "https://api.binance.com" : "https://api.btcc.com"
    
    logger.info(`ExchangeService initialized for ${exchange}`, {
      context: "ExchangeService",
      data: { baseUrl: this.baseUrl }
    })
  }

  private generateSignature(queryString: string): string {
    return crypto.createHmac("sha256", this.apiSecret).update(queryString).digest("hex")
  }

  private async makeRequest(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    params: Record<string, any> = {},
  ): Promise<any> {
    try {
      // Add timestamp for signature
      const timestamp = Date.now()
      params.timestamp = timestamp

      // Generate query string
      const queryString = Object.entries(params)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("&")

      // Generate signature
      const signature = this.generateSignature(queryString)

      // Build URL with query string and signature
      const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`
      
      logger.debug(`Making ${method} request to ${this.exchange}`, { 
        context: "ExchangeService",
        data: { 
          endpoint,
          method,
          // Don't log full URL to avoid exposing signature in logs
          baseUrl: this.baseUrl,
          paramsCount: Object.keys(params).length
        }
      })

      // Make request with proper headers
      const response = await axios({
        method,
        url,
        headers: {
          "X-MBX-APIKEY": this.apiKey,
          "User-Agent": "Mozilla/5.0" // Add User-Agent header like in Postman
        },
        timeout: 10000 // Add timeout to prevent hanging requests
      })

      logger.debug(`Request to ${this.exchange} successful`, {
        context: "ExchangeService"
      })
      
      return response.data
    } catch (error) {
      // Detailed error logging
      if (axios.isAxiosError(error)) {
        logger.error(`Exchange API error: ${this.exchange}`)
        
        // Throw detailed error with response data if available
        if (error.response) {
          throw new Error(`Exchange API error (${error.response.status}): ${JSON.stringify(error.response.data)}`)
        }
      }

      logger.error(`Exchange request failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      logger.info(`Validating connection to ${this.exchange}`, {
        context: "ExchangeService"
      })
      
      if (this.exchange === "binance") {
        // Test Binance API connection - use a simpler endpoint first
        try {
          // Try ping endpoint first as a simple connectivity test
          await axios({
            method: "GET",
            url: `${this.baseUrl}/api/v3/ping`,
            headers: {
              "X-MBX-APIKEY": this.apiKey,
              "User-Agent": "Mozilla/5.0"
            },
            timeout: 5000
          })
          
          logger.info("Binance ping successful, testing account access", {
            context: "ExchangeService"
          })
          
          // Then test actual account access
          await this.makeRequest("/api/v3/account")
          
          logger.info("Binance API connection validated successfully", {
            context: "ExchangeService"
          })
          return true
        } catch (error) {
          logger.error(`Failed to validate Binance connection: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return false
        }
      } else {
        // Test BTCC API connection
        try {
          await this.makeRequest("/api/v1/account")
          logger.info("BTCC API connection validated successfully", {
            context: "ExchangeService"
          })
          return true
        } catch (error) {
          logger.error(`Failed to validate BTCC connection: ${error instanceof Error ? error.message : 'Unknown error'}`)
          return false
        }
      }
    } catch (error) {
      logger.error(`Failed to connect to ${this.exchange}: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return false
    }
  }

  async getBalances(): Promise<Balance[]> {
    try {
      let data: any

      if (this.exchange === "binance") {
        data = await this.makeRequest("/api/v3/account")

        return data.balances.map((balance: any) => ({
          asset: balance.asset,
          free: Number.parseFloat(balance.free),
          locked: Number.parseFloat(balance.locked),
          total: Number.parseFloat(balance.free) + Number.parseFloat(balance.locked),
        }))
      } else {
        data = await this.makeRequest("/api/v1/account")

        // Map BTCC response to our Balance interface
        return data.balances.map((balance: any) => ({
          asset: balance.asset,
          free: Number.parseFloat(balance.free),
          locked: Number.parseFloat(balance.locked),
          total: Number.parseFloat(balance.free) + Number.parseFloat(balance.locked),
        }))
      }
    } catch (error) {
      logger.error(`Error fetching balances: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  async getPortfolio(): Promise<Portfolio> {
    try {
      // Get account balances
      const balances = await this.getBalances()

      // Filter out zero balances and stablecoins
      const nonZeroBalances = balances.filter(
        (balance) => balance.total > 0 && !["USDT", "USDC", "BUSD", "DAI"].includes(balance.asset),
      )

      // Get current prices for all assets
      const holdings = await Promise.all(
        nonZeroBalances.map(async (balance) => {
          const currentPrice = await this.getMarketPrice(`${balance.asset}USDT`)
          const value = balance.total * currentPrice

          // For demo purposes, we'll use current price as average price with a small difference
          // In a real app, this would come from trade history
          const averagePrice = currentPrice * (0.9 + Math.random() * 0.2) // +/- 10%
          const pnl = (currentPrice - averagePrice) * balance.total
          const pnlPercentage = ((currentPrice - averagePrice) / averagePrice) * 100

          return {
            token: balance.asset,
            amount: balance.total,
            averagePrice,
            currentPrice,
            value,
            pnl,
            pnlPercentage,
          }
        }),
      )

      // Calculate portfolio totals
      const totalValue = holdings.reduce((sum, holding) => sum + holding.value, 0)

      // Get stablecoin balances for free capital
      const stablecoins = balances.filter((balance) => ["USDT", "USDC", "BUSD", "DAI"].includes(balance.asset))
      const freeCapital = stablecoins.reduce((sum, coin) => sum + coin.free, 0)

      return {
        totalValue: totalValue + freeCapital,
        freeCapital,
        allocatedCapital: totalValue,
        holdings,
      }
    } catch (error) {
      logger.error(`Error fetching portfolio: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  async executeTrade(params: TradeParams): Promise<TradeResult> {
    try {
      let endpoint = ""
      const requestParams: Record<string, any> = {
        symbol: params.symbol,
        side: params.side,
        quantity: params.quantity.toFixed(5), // Format to 5 decimal places
        type: params.price ? "LIMIT" : "MARKET",
      }

      if (params.price) {
        requestParams.price = params.price.toFixed(2)
        requestParams.timeInForce = "GTC" // Good Till Canceled
      }

      if (this.exchange === "binance") {
        endpoint = "/api/v3/order"
      } else {
        endpoint = "/api/v1/order"
      }

      const response = await this.makeRequest(endpoint, "POST", requestParams)

      return {
        orderId: response.orderId,
        symbol: response.symbol,
        side: response.side,
        quantity: Number.parseFloat(response.executedQty),
        price: Number.parseFloat(response.price || response.fills?.[0]?.price || 0),
        status: response.status,
        timestamp: response.transactTime,
      }
    } catch (error) {
      logger.error(`Error executing trade: ${error instanceof Error ? error.message : 'Unknown error'}`)
      throw error
    }
  }

  async getMarketPrice(symbol: string): Promise<number> {
    try {
      let endpoint = ""
      const params = { symbol }

      if (this.exchange === "binance") {
        endpoint = "/api/v3/ticker/price"
      } else {
        endpoint = "/api/v1/ticker/price"
      }

      const response = await this.makeRequest(endpoint, "GET", params)
      return Number.parseFloat(response.price)
    } catch (error) {
      logger.error(`Error fetching market price: ${error instanceof Error ? error.message : 'Unknown error'}`)

      // Fallback to CoinGecko API if exchange API fails
      try {
        const token = symbol.replace("USDT", "").toLowerCase()
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`)
        return response.data[token].usd
      } catch (fallbackError) {
        logger.error(`Fallback price fetch failed: ${fallbackError instanceof Error ? fallbackError.message : 'Unknown error'}`)
        throw error
      }
    }
  }
}