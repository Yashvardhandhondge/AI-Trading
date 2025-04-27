"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2, Shield, AlertCircle, Check } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { SessionUser } from "@/lib/auth"
import { tradingProxy } from "@/lib/trading-proxy"
import { logger } from "@/lib/logger"

interface SettingsProps {
  user: SessionUser
}

export function Settings({ user }: SettingsProps) {
  const router = useRouter()
  const [exchange, setExchange] = useState<"binance" | "btcc">(user.exchange || "binance")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high">("medium")
  const [isLoadingExchange, setIsLoadingExchange] = useState(false)
  const [isLoadingRisk, setIsLoadingRisk] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [proxyServerAvailable, setProxyServerAvailable] = useState(true)
  const [userIp, setUserIp] = useState<string>("")
  const [isLoadingIp, setIsLoadingIp] = useState(true)
  const [proxyServerUrl, setProxyServerUrl] = useState('https://binance.yashvardhandhondge.tech')
  const [exchangeStatus, setExchangeStatus] = useState({
    connected: user.exchangeConnected || false,
    lastChecked: new Date()
  })

  // Get the user's IP address for whitelisting
  useEffect(() => {
    const fetchIp = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json')
        const data = await response.json()
        setUserIp(data.ip)
      } catch (error) {
        console.error("Error fetching IP:", error)
      } finally {
        setIsLoadingIp(false)
      }
    }

    fetchIp()
  }, [])

  // Check if the proxy server is available
  useEffect(() => {
    const checkProxyServer = async () => {
      try {
        const response = await fetch(`${proxyServerUrl}/health`, { 
          signal: AbortSignal.timeout(3000)
        })
        
        setProxyServerAvailable(response.ok)
        
        if (!response.ok) {
          logger.error(`Proxy server health check failed: ${response.status}`)
        }
      } catch (error) {
        logger.error(`Proxy server unavailable: ${error instanceof Error ? error.message : 'Unknown error'}`)
        setProxyServerAvailable(false)
      }
    }
    
    checkProxyServer()
  }, [proxyServerUrl])

  // Load user's risk level from the database
  useEffect(() => {
    const fetchUserSettings = async () => {
      try {
        const response = await fetch('/api/user/settings')
        if (response.ok) {
          const data = await response.json()
          if (data.riskLevel) {
            setRiskLevel(data.riskLevel as "low" | "medium" | "high")
          }
        }
      } catch (error) {
        logger.error(`Error fetching user settings: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    }

    fetchUserSettings()
  }, [])

  // Handle updating exchange settings
  const handleExchangeUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoadingExchange(true)
    setError(null)
    setSuccess(null)
    
    try {
      if (!proxyServerAvailable) {
        throw new Error("Proxy server is currently unavailable. Please try again later.")
      }
      
      // Only update credentials if both API key and secret are provided
      if (apiKey && apiSecret) {
        try {
          // Register the API keys with the proxy server
          await tradingProxy.registerApiKey(
            user.id.toString(),
            apiKey,
            apiSecret,
            exchange
          )
          
          // Now update the user's record in the database
          const response = await fetch("/api/exchange/update", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              exchange,
              connected: true
            }),
          })
          
          if (!response.ok) {
            const data = await response.json()
            throw new Error(data.error || "Failed to update exchange settings")
          }
          
          setSuccess("Exchange settings updated successfully")
          
          // Clear sensitive form fields
          setApiKey("")
          setApiSecret("")
          
          // Update the local exchange status
          setExchangeStatus({
            connected: true,
            lastChecked: new Date()
          })
          
          // Refresh the page to update the UI
          setTimeout(() => router.refresh(), 1500)
        } catch (proxyError) {
          throw new Error(proxyError instanceof Error ? proxyError.message : "Failed to register with proxy server")
        }
      } else if (exchange !== user.exchange) {
        // If no API keys provided but exchange type changed, just update the exchange type
        const response = await fetch("/api/exchange/update", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            exchange,
            connected: false
          }),
        })
        
        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Failed to update exchange type")
        }
        
        setSuccess("Exchange type updated successfully")
        setTimeout(() => router.refresh(), 1500)
      } else {
        setSuccess("No changes detected")
      }
    } catch (err) {
      console.error("Error in handleExchangeUpdate:", err)
      setError(err instanceof Error ? err.message : "Failed to update exchange settings")
    } finally {
      setIsLoadingExchange(false)
    }
  }

  // Handle updating risk level
  const handleRiskUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoadingRisk(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/user/risk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          riskLevel,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update risk settings")
      }

      setSuccess("Risk level updated successfully")
      setTimeout(() => router.refresh(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update risk settings")
    } finally {
      setIsLoadingRisk(false)
    }
  }

  // Handle disconnecting the exchange
  const handleDisconnectExchange = async () => {
    setIsLoadingExchange(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/exchange/disconnect", {
        method: "POST",
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to disconnect exchange")
      }

      setSuccess("Exchange disconnected successfully")
      
      // Update local state
      setExchangeStatus({
        connected: false,
        lastChecked: new Date()
      })
      
      setTimeout(() => router.refresh(), 1500)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect exchange")
    } finally {
      setIsLoadingExchange(false)
    }
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Exchange Settings</CardTitle>
          <CardDescription>Update your exchange API credentials</CardDescription>
        </CardHeader>
        <CardContent>
          {!proxyServerAvailable && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Proxy Server Unavailable</AlertTitle>
              <AlertDescription>
                The proxy server is currently unavailable. API management is temporarily disabled.
              </AlertDescription>
            </Alert>
          )}

          {exchangeStatus.connected && (
            <Alert className="mb-4 bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="text-green-800 dark:text-green-300">Exchange Connected</AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-400">
                Your {user.exchange} account is currently connected
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleExchangeUpdate}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Exchange</Label>
                <RadioGroup
                  value={exchange}
                  onValueChange={(value) => setExchange(value as "binance" | "btcc")}
                  className="flex flex-col space-y-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="binance" id="binance" />
                    <Label htmlFor="binance">Binance (Spot)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="btcc" id="btcc" />
                    <Label htmlFor="btcc">BTCC (Futures)</Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter new API key"
                  disabled={!proxyServerAvailable}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Enter new API secret"
                  disabled={!proxyServerAvailable}
                />
              </div>

              <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md">
                <div>
                  <p className="font-medium">Important: Whitelist BOTH these IP addresses:</p>
                  <div className="mt-2 space-y-2">
                    <div>
                      <p className="text-sm font-medium">1. Your current IP address:</p>
                      <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200">
                        {isLoadingIp ? "Loading..." : userIp}
                      </code>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium">2. Our server IP address:</p>
                      <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200">
                        13.60.210.111
                      </code>
                    </div>
                  </div>
                  <p className="text-xs mt-2 text-blue-700 dark:text-blue-300">
                    <strong>Note:</strong> Both IP addresses must be added to your exchange API whitelist settings for the application to work correctly
                  </p>
                </div>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            type="button"
            onClick={handleExchangeUpdate}
            className="w-full sm:w-auto"
            disabled={isLoadingExchange || !proxyServerAvailable}
          >
            {isLoadingExchange ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Exchange Settings"
            )}
          </Button>

          {exchangeStatus.connected && (
            <Button
              type="button"
              variant="destructive"
              onClick={handleDisconnectExchange}
              className="w-full sm:w-auto"
              disabled={isLoadingExchange}
            >
              {isLoadingExchange ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                "Disconnect Exchange"
              )}
            </Button>
          )}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk Settings</CardTitle>
          <CardDescription>Configure your risk tolerance for trading signals</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRiskUpdate}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Risk Level</Label>
                <RadioGroup
                  value={riskLevel}
                  onValueChange={(value) => setRiskLevel(value as "low" | "medium" | "high")}
                  className="flex flex-col space-y-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="low" id="low" />
                    <Label htmlFor="low">Low Risk (Conservative)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="medium" id="medium" />
                    <Label htmlFor="medium">Medium Risk (Balanced)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="high" id="high" />
                    <Label htmlFor="high">High Risk (Aggressive)</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-start space-y-2">
          <Button type="submit" onClick={handleRiskUpdate} className="w-full" disabled={isLoadingRisk}>
            {isLoadingRisk ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Risk Settings"
            )}
          </Button>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}
          {success && <p className="text-sm font-medium text-green-500">{success}</p>}
        </CardFooter>
      </Card>
    </div>
  )
}
