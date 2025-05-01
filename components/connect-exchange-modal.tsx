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
      const proxyUrl = process.env.NEXT_PUBLIC_PROXY_SERVER_URL || 'https://binance.yashvardhandhondge.tech'
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
        
        logger.info("API key registered with proxy server successfully", {
          context: "ConnectExchangeModal",
          userId: userId
        })
        
        // Update the user record in our database to reflect the connected status
        // Note: We do NOT send the API keys to our backend
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
          // Close the modal
          onOpenChange(false)
          
          // Call the onSuccess callback if provided
          if (onSuccess) {
            onSuccess()
          } else {
            // Refresh the page if no callback provided
            window.location.reload()
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
            <div className="space-y-4 mb-4">
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
                  placeholder="Enter your API key"
                  disabled={isLoading || !proxyServerAvailable}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Enter your API secret"
                  disabled={isLoading || !proxyServerAvailable}
                />
              </div>
            </div>

            <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-200 dark:border-blue-800">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-300 mb-2">
                Important: Whitelist BOTH these IP addresses
              </p>
              
              <div className="space-y-3">
                <div className="flex items-start">
                  <div className="bg-blue-100 dark:bg-blue-800 rounded-full p-1 mr-2 text-blue-600 dark:text-blue-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4" />
                      <path d="M4 6v12c0 1.1.9 2 2 2h14v-4" />
                      <path d="M18 12a2 2 0 0 0-2 2c0 1.1.9 2 2 2h4v-4h-4z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">1. Your current IP address:</p>
                    <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200 text-sm">
                      {isLoadingIp ? "Loading..." : userIp}
                    </code>
                  </div>
                </div>
                
                <div className="flex items-start">
                  <div className="bg-blue-100 dark:bg-blue-800 rounded-full p-1 mr-2 text-blue-600 dark:text-blue-300">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                      <line x1="6" y1="6" x2="6.01" y2="6"></line>
                      <line x1="6" y1="18" x2="6.01" y2="18"></line>
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-blue-700 dark:text-blue-400">2. Our server IP address:</p>
                    <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200 text-sm">
                      13.60.210.111
                    </code>
                  </div>
                </div>
              </div>
              
              <p className="text-xs mt-2 text-blue-600 dark:text-blue-400">
                Both IP addresses must be added to your exchange API whitelist settings
              </p>
            </div>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

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