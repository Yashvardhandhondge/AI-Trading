"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { 
  ArrowRight, 
  Shield, 
  Loader2, 
  AlertCircle,
  Check
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"

interface ConnectExchangeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId?: number
  onSuccess?: () => void
}

export function ConnectExchangeModal({ open, onOpenChange, userId, onSuccess }: ConnectExchangeModalProps) {
  const router = useRouter()
  const [exchange, setExchange] = useState<"binance" | "btcc">("binance")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [proxyServerAvailable, setProxyServerAvailable] = useState(true)
  const [userIp, setUserIp] = useState<string>("")
  const [isLoadingIp, setIsLoadingIp] = useState(true)

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

  // Check proxy server availability and reset form state when modal opens
  useEffect(() => {
    if (open) {
      setError(null)
      setShowSuccess(false)
      setApiKey("")
      setApiSecret("")
      checkProxyServer()
    }
  }, [open])

  // Check if the proxy server is available
  const checkProxyServer = async () => {
    try {
      const proxyUrl =  'https://binance.yashvardhandhondge.tech'
      const response = await fetch(`${proxyUrl}/health`, { 
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setShowSuccess(false)
    
    try {
      if (!proxyServerAvailable) {
        throw new Error("Proxy server is not available. Please try again later.")
      }
      
      if (!apiKey || !apiSecret) {
        throw new Error("API key and secret are required")
      }
      
      if (!userId) {
        throw new Error("User ID is required")
      }
      
      // Use our trading proxy service to register the API key
      try {
        // Register API key with the proxy server
        await tradingProxy.registerApiKey(
          userId.toString(),
          apiKey,
          apiSecret,
          exchange
        )
        
        // Update the user record in our database to reflect the connected status
        const response = await fetch("/api/exchange/connect", {
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
          const errorData = await response.json()
          throw new Error(errorData.error || `Failed to update user record (${response.status})`)
        }
        
        // Show success message
        setShowSuccess(true)
        
        // Clean up sensitive data
        setApiKey("")
        setApiSecret("")
        
        // Log success
        logger.info("Exchange connected successfully", {
          context: "ConnectExchangeModal",
          userId: userId
        })
        
        // Handle success callback after a delay
        setTimeout(() => {
          onOpenChange(false)
          if (onSuccess) {
            onSuccess()
          } else {
            router.refresh()
          }
        }, 1500)
      } catch (proxyError) {
        const errorMessage = proxyError instanceof Error ? proxyError.message : "Unknown error"
        logger.error(`Failed to register API key with proxy: ${errorMessage}`)
        throw new Error(errorMessage)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      setError(errorMessage)
      logger.error(`Exchange connection error: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Connect Exchange</DialogTitle>
          <DialogDescription className="pt-2">
            Connect your cryptocurrency exchange to execute trades and track your portfolio automatically.
          </DialogDescription>
        </DialogHeader>

        {!proxyServerAvailable && (
          <Alert variant="destructive" className="mb-4 border-red-500 bg-red-50 dark:bg-red-900/20">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle className="text-red-800 dark:text-red-300">Proxy Server Not Available</AlertTitle>
            <AlertDescription className="text-red-700 dark:text-red-400">
              Cannot connect to proxy server. Please try again later.
            </AlertDescription>
          </Alert>
        )}

        {showSuccess ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <div className="mt-3 text-center sm:mt-5">
              <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">
                Connection Successful!
              </h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Your exchange has been connected successfully. Redirecting to dashboard...
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col space-y-4 py-2">
              <div className="rounded-md bg-blue-50 p-3 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 flex items-start">
                <Shield className="h-5 w-5 mr-2 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <p className="text-sm">
                  Your exchange API keys are encrypted and stored securely on the proxy server.
                  Only keys with <strong>trading permissions</strong> will work with this app.
                </p>
              </div>

              {error && (
                <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-900/20">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-red-800 dark:text-red-300">Connection Error</AlertTitle>
                  <AlertDescription className="text-red-700 dark:text-red-400">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
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
                      required
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
                      required
                      disabled={!proxyServerAvailable}
                    />
                  </div>
                </div>
              </form>

              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-md text-sm">
                <h4 className="font-semibold mb-3">Setup instructions for {exchange === "binance" ? "Binance" : "BTCC"}:</h4>
                <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 mb-3">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-2" />
                    <div className="text-sm text-amber-800 dark:text-amber-300">
                      <strong>Important:</strong> When creating API keys, you MUST enable trading permissions.
                    </div>
                  </div>
                </div>
                
                <ol className="list-decimal list-inside space-y-2 pl-1">
                  <li>Log in to your {exchange === "binance" ? "Binance" : "BTCC"} account</li>
                  <li>Go to <strong>API Management</strong> in your account settings</li>
                  <li>Create a new API key</li>
                  <li>Enable the <strong>{exchange === "binance" ? "Enable Spot & Margin Trading" : "Trading"}</strong> permission</li>
                  <li>Copy your API key and secret</li>
                  <li>Enter them in the form above</li>
                </ol>
                
                <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md flex items-center">
                  <div>
                    <p className="font-medium">Your current IP address:</p>
                    <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200">
                      {isLoadingIp ? "Loading..." : userIp}
                    </code>
                    <p className="text-xs mt-1">You must whitelist this IP in your exchange API settings</p>
                  </div>
                </div>
                
                <div className="mt-4 space-y-2">
                  <div className="flex items-center">
                    <div className="h-4 w-4 rounded-full bg-green-500 mr-2 flex-shrink-0"></div>
                    <span>Execute trades directly from signals</span>
                  </div>
                  <div className="flex items-center">
                    <div className="h-4 w-4 rounded-full bg-green-500 mr-2 flex-shrink-0"></div>
                    <span>Track your portfolio performance automatically</span>
                  </div>
                  <div className="flex items-center">
                    <div className="h-4 w-4 rounded-full bg-green-500 mr-2 flex-shrink-0"></div>
                    <span>Receive SELL signals for tokens you own</span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={isLoading || !apiKey || !apiSecret || !proxyServerAvailable}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect Exchange <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}