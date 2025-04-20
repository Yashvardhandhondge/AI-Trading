import axios from "axios"
import crypto from "crypto"
import { decryptApiKey } from "./db"

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
        .map(([key, value]) => `${key}=${value}`)
        .join("&")

      // Generate signature
      const signature = this.generateSignature(queryString)

      // Build URL
      const url = `${this.baseUrl}${endpoint}?${queryString}&signature=${signature}`

      // Make request
      const response = await axios({
        method,
        url,
        headers: {
          "X-MBX-APIKEY": this.apiKey,
        },
      })

      return response.data
    } catch (error) {
      console.error(`Exchange API error:`, error)

      // Handle API errors
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(`Exchange API error: ${error.response.data.msg || error.message}`)
      }

      throw error
    }
  }

  async validateConnection(): Promise<boolean> {
    try {
      if (this.exchange === "binance") {
        // Test Binance API connection
        await this.makeRequest("/api/v3/account")
      } else {
        // Test BTCC API connection
        await this.makeRequest("/api/v1/account")
      }
      return true
    } catch (error) {
      console.error(`Failed to connect to ${this.exchange}:`, error)
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
      console.error(`Error fetching balances:`, error)
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
      console.error(`Error fetching portfolio:`, error)
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
        price: Number.parseFloat(response.price || response.fills[0].price),
        status: response.status,
        timestamp: response.transactTime,
      }
    } catch (error) {
      console.error(`Error executing trade:`, error)
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
      console.error(`Error fetching market price:`, error)

      // Fallback to CoinGecko API if exchange API fails
      try {
        const token = symbol.replace("USDT", "").toLowerCase()
        const response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${token}&vs_currencies=usd`)
        return response.data[token].usd
      } catch (fallbackError) {
        console.error(`Fallback price fetch failed:`, fallbackError)
        throw error
      }
    }
  }
}
