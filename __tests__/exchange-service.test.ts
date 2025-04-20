/**
 * Exchange Service Tests
 *
 * This file contains unit tests for the Exchange Service.
 */

import { ExchangeService } from "@/lib/exchange"
import axios from "axios"

// Mock axios
jest.mock("axios")
const mockedAxios = axios as jest.Mocked<typeof axios>

describe("ExchangeService", () => {
  // Test credentials
  const credentials = {
    apiKey: "test-api-key",
    apiSecret: "test-api-secret",
  }

  // Reset mocks before each test
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("validateConnection", () => {
    it("should return true for successful Binance connection", async () => {
      // Mock successful response
      mockedAxios.mockResolvedValueOnce({ data: {} })

      const service = new ExchangeService("binance", credentials)
      const result = await service.validateConnection()

      expect(result).toBe(true)
      expect(mockedAxios).toHaveBeenCalledTimes(1)
    })

    it("should return false for failed Binance connection", async () => {
      // Mock failed response
      mockedAxios.mockRejectedValueOnce(new Error("Connection failed"))

      const service = new ExchangeService("binance", credentials)
      const result = await service.validateConnection()

      expect(result).toBe(false)
      expect(mockedAxios).toHaveBeenCalledTimes(1)
    })

    it("should return true for successful BTCC connection", async () => {
      // Mock successful response
      mockedAxios.mockResolvedValueOnce({ data: {} })

      const service = new ExchangeService("btcc", credentials)
      const result = await service.validateConnection()

      expect(result).toBe(true)
      expect(mockedAxios).toHaveBeenCalledTimes(1)
    })
  })

  describe("getBalances", () => {
    it("should return formatted balances from Binance", async () => {
      // Mock Binance response
      mockedAxios.mockResolvedValueOnce({
        data: {
          balances: [
            { asset: "BTC", free: "1.0", locked: "0.5" },
            { asset: "ETH", free: "10.0", locked: "2.0" },
          ],
        },
      })

      const service = new ExchangeService("binance", credentials)
      const balances = await service.getBalances()

      expect(balances).toHaveLength(2)
      expect(balances[0]).toEqual({
        asset: "BTC",
        free: 1.0,
        locked: 0.5,
        total: 1.5,
      })
      expect(balances[1]).toEqual({
        asset: "ETH",
        free: 10.0,
        locked: 2.0,
        total: 12.0,
      })
    })

    it("should handle errors when fetching balances", async () => {
      // Mock error response
      mockedAxios.mockRejectedValueOnce(new Error("API error"))

      const service = new ExchangeService("binance", credentials)

      await expect(service.getBalances()).rejects.toThrow("API error")
    })
  })

  describe("getMarketPrice", () => {
    it("should return the market price for a symbol", async () => {
      // Mock price response
      mockedAxios.mockResolvedValueOnce({
        data: { price: "50000.00" },
      })

      const service = new ExchangeService("binance", credentials)
      const price = await service.getMarketPrice("BTCUSDT")

      expect(price).toBe(50000)
      expect(mockedAxios).toHaveBeenCalledWith(
        expect.objectContaining({
          url: expect.stringContaining("BTCUSDT"),
        }),
      )
    })

    it("should fall back to CoinGecko if exchange API fails", async () => {
      // Mock exchange API failure
      mockedAxios.mockRejectedValueOnce(new Error("Exchange API error"))

      // Mock CoinGecko success
      mockedAxios.mockResolvedValueOnce({
        data: { btc: { usd: 48000 } },
      })

      const service = new ExchangeService("binance", credentials)
      const price = await service.getMarketPrice("BTCUSDT")

      expect(price).toBe(48000)
      expect(mockedAxios).toHaveBeenCalledTimes(2)
    })
  })

  describe("executeTrade", () => {
    it("should execute a market buy order successfully", async () => {
      // Mock successful order response
      mockedAxios.mockResolvedValueOnce({
        data: {
          orderId: "12345",
          symbol: "BTCUSDT",
          side: "BUY",
          executedQty: "0.1",
          fills: [{ price: "50000.00" }],
          status: "FILLED",
          transactTime: 1625097600000,
        },
      })

      const service = new ExchangeService("binance", credentials)
      const result = await service.executeTrade({
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.1,
      })

      expect(result).toEqual({
        orderId: "12345",
        symbol: "BTCUSDT",
        side: "BUY",
        quantity: 0.1,
        price: 50000,
        status: "FILLED",
        timestamp: 1625097600000,
      })
    })

    it("should execute a limit sell order successfully", async () => {
      // Mock successful order response
      mockedAxios.mockResolvedValueOnce({
        data: {
          orderId: "12346",
          symbol: "BTCUSDT",
          side: "SELL",
          executedQty: "0.2",
          price: "52000.00",
          status: "FILLED",
          transactTime: 1625097700000,
        },
      })

      const service = new ExchangeService("binance", credentials)
      const result = await service.executeTrade({
        symbol: "BTCUSDT",
        side: "SELL",
        quantity: 0.2,
        price: 52000,
      })

      expect(result).toEqual({
        orderId: "12346",
        symbol: "BTCUSDT",
        side: "SELL",
        quantity: 0.2,
        price: 52000,
        status: "FILLED",
        timestamp: 1625097700000,
      })
    })

    it("should handle trade execution errors", async () => {
      // Mock error response
      mockedAxios.mockRejectedValueOnce({
        response: {
          data: {
            code: -2010,
            msg: "Account has insufficient balance for requested action.",
          },
        },
      })

      const service = new ExchangeService("binance", credentials)

      await expect(
        service.executeTrade({
          symbol: "BTCUSDT",
          side: "BUY",
          quantity: 10,
        }),
      ).rejects.toThrow("Exchange API error: Account has insufficient balance for requested action.")
    })
  })
})
