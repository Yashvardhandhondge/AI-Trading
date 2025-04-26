"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, ExternalLink, Shield, Check, AlertCircle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ConnectExchangeModal } from "@/components/connect-exchange-modal"
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"

interface TradingPanelProps {
  userId: string | number
}

export default function TradingPanel({ userId }: TradingPanelProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [accountInfo, setAccountInfo] = useState<any>(null)
  const [isExchangeConnected, setIsExchangeConnected] = useState(false)
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Check if user has registered API keys with the proxy server
  useEffect(() => {
    const checkExchangeConnection = async () => {
      try {
        setIsLoading(true)
        setError(null)
        
        // Check if user has API keys registered with the proxy server
        const isConnected = await tradingProxy.checkApiKeyStatus(userId)
        setIsExchangeConnected(isConnected)
        
        if (isConnected) {
          // If connected, fetch basic account information
          try {
            const accountData = await tradingProxy.getAccountInfo(userId)
            setAccountInfo(accountData)
            
            // Update connection status in the database to ensure consistency
            await fetch("/api/exchange/update", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                connected: true
              }),
            })
            
            logger.info("Account information fetched successfully", {
              context: "TradingPanel",
              userId
            })
          } catch (accountError) {
            logger.error(`Error fetching account info: ${accountError instanceof Error ? accountError.message : "Unknown error"}`)
            
            // Don't show error to user, just log it
            // We still show the connected state if keys are registered
          }
        } else {
          // Update connection status in the database if needed
          await fetch("/api/exchange/update", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              connected: false
            }),
          })
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err : "Unknown error"
        logger.error(`Error checking exchange connection: ${errorMessage}`)
        
        setError("Could not connect to trading server. Please try again later.")
      } finally {
        setIsLoading(false)
      }
    }
    
    if (userId) {
      checkExchangeConnection()
    }
  }, [userId])

  // Handle connecting exchange
  const handleConnectExchange = () => {
    setShowConnectModal(true)
  }
  
  // Handle successful connection
  const handleConnectionSuccess = () => {
    setIsExchangeConnected(true)
    window.location.reload() // Refresh the app to update state
  }

  if (isLoading) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-center justify-center p-6">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          <span>Checking exchange connection...</span>
        </CardContent>
      </Card>
    )
  }
  
  if (error) {
    return (
      <Card className="mb-6 border-amber-500 bg-amber-50 dark:bg-amber-900/30">
        <CardContent className="p-4">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Connection Issue</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!isExchangeConnected) {
    return (
      <Card className="mb-6 border-blue-500 bg-blue-50 dark:bg-blue-950/30">
        <CardHeader className="pb-2">
          <CardTitle>Connect Your Exchange</CardTitle>
          <CardDescription>
            To start trading, you need to connect your exchange API keys
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col sm:flex-row items-center justify-between p-4">
          <div className="flex items-center mb-3 sm:mb-0">
            <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-2 mr-3">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-sm">
              <p className="text-blue-600 dark:text-blue-400">
                Your API keys will be securely stored on our proxy server
              </p>
            </div>
          </div>
          <Button 
            className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
            onClick={handleConnectExchange}
          >
            Connect Exchange
          </Button>
        </CardContent>
      </Card>
    )
  }

  // If exchange is connected, show status and basic account info
  return (
    <Card className="mb-6 border-green-500 bg-green-50 dark:bg-green-900/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center">
          <Check className="h-5 w-5 mr-2 text-green-600 dark:text-green-400" />
          Exchange Connected
        </CardTitle>
        <CardDescription>
          Your exchange API keys are securely connected
        </CardDescription>
      </CardHeader>
      {accountInfo && (
        <CardContent className="px-6 py-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Account Type:</span>
              <span className="ml-2 font-medium capitalize">{accountInfo.accountType || "Spot"}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Trading Enabled:</span>
              <span className="ml-2 font-medium">{accountInfo.canTrade ? "Yes" : "No"}</span>
            </div>
          </div>
        </CardContent>
      )}
      <CardContent className="pt-0 pb-4">
        <Button 
          variant="outline" 
          size="sm" 
          className="mt-2"
          onClick={() => setShowConnectModal(true)}
        >
          Update API Keys
        </Button>
      </CardContent>
      
      {/* Connection Modal */}
      <ConnectExchangeModal 
        open={showConnectModal} 
        onOpenChange={setShowConnectModal}
        userId={Number(userId)}
        onSuccess={handleConnectionSuccess}
      />
    </Card>
  )
}