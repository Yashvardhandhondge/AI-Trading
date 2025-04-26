"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, AlertCircle } from "lucide-react"
import { SignalCard } from "@/components/signal-card"
import { ConnectExchangeModal } from "@/components/connect-exchange-modal"
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"

// Define types
interface Signal {
  id: string
  type: "BUY" | "SELL"
  token: string
  price: number
  riskLevel: "low" | "medium" | "high"
  createdAt: string
  expiresAt: string
  link?: string
  positives?: string[]
  warnings?: string[]
  warning_count?: number
}

interface UserHolding {
  token: string
  amount: number
}

interface SignalDashboardProps {
  userId: number
  isExchangeConnected: boolean
  userHoldings?: UserHolding[]
}

export default function SignalDashboard({ 
  userId, 
  isExchangeConnected, 
  userHoldings = [] 
}: SignalDashboardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [activeSignal, setActiveSignal] = useState<Signal | null>(null)
  const [showConnectExchangeModal, setShowConnectExchangeModal] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchSignals = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Always fetch signals regardless of exchange connection
      const response = await fetch("/api/signals/active")
      
      if (!response.ok) {
        throw new Error(`Failed to fetch signals: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.signal) {
        logger.info(`Received signal: ${data.signal.type} for ${data.signal.token}`, {
          context: "SignalDashboard",
          userId
        })
        setActiveSignal(data.signal)
      } else {
        setActiveSignal(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch signals")
      logger.error("Error fetching signals:", err instanceof Error ? err : new Error(String(err)), {
        context: "SignalDashboard",
        userId
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSignals()
    
    // Refresh signals every 2 minutes
    const intervalId = setInterval(fetchSignals, 120000)
    
    return () => clearInterval(intervalId)
  }, [userId])

  const handleSignalAction = async (action: "accept" | "skip", signalId: string) => {
    try {
      // If user tries to accept a signal but has no exchange connected, show modal
      if (action === "accept" && !isExchangeConnected) {
        setShowConnectExchangeModal(true)
        return
      }
      
      // For SELL signals, verify the user actually owns the token
      if (activeSignal?.type === "SELL" && action === "accept") {
        const hasToken = userHoldings.some(h => h.token === activeSignal.token && h.amount > 0)
        if (!hasToken) {
          logger.error(`Cannot execute SELL for ${activeSignal.token} - user doesn't own this token`)
          setError(`You don't own any ${activeSignal.token} to sell`)
          return
        }
      }

      logger.info(`Processing ${action} action for ${activeSignal?.type} signal on ${activeSignal?.token}`, {
        context: "SignalDashboard",
        userId
      })

      // For Skip signals, simply update UI
      if (action === "skip") {
        setActiveSignal(null)
        return
      }
      
      // For Accept signals, execute the trade via proxy
      if (action === "accept" && isExchangeConnected && activeSignal) {
        try {
          setIsLoading(true)
          
          // For BUY signals, calculate 10% of portfolio value
          if (activeSignal.type === "BUY") {
            // Get portfolio summary to calculate trade size
            const portfolioData = await tradingProxy.getPortfolio(userId)
            const tradeValue = portfolioData.totalValue * 0.1 // 10% of portfolio
            
            if (tradeValue <= 0) {
              throw new Error("Insufficient portfolio value for trading")
            }
            
            const quantity = tradeValue / activeSignal.price
            
            // Execute the trade
            await tradingProxy.executeTrade(
              userId,
              `${activeSignal.token}USDT`,
              "BUY",
              quantity
            )
            
            logger.info(`Successfully executed BUY for ${activeSignal.token}`, {
              context: "SignalDashboard",
              userId,
              data: { quantity, value: tradeValue }
            })
          } 
          // For SELL signals, sell the entire holding
          else if (activeSignal.type === "SELL") {
            // Find the token in holdings
            const holding = userHoldings.find(h => h.token === activeSignal.token)
            
            if (!holding || holding.amount <= 0) {
              throw new Error(`No ${activeSignal.token} holdings found`)
            }
            
            // Execute sell order
            await tradingProxy.executeTrade(
              userId,
              `${activeSignal.token}USDT`,
              "SELL",
              holding.amount
            )
            
            logger.info(`Successfully executed SELL for ${activeSignal.token}`, {
              context: "SignalDashboard",
              userId,
              data: { amount: holding.amount }
            })
          }
          
          // Record the signal as processed in our database
          await fetch(`/api/signals/${signalId}/${action}`, {
            method: "POST"
          })
          
          // Clear the signal and fetch a new one if available
          setTimeout(() => {
            fetchSignals()
          }, 1000)
        } catch (tradeError) {
          const errorMessage = tradeError instanceof Error ? tradeError.message : "Failed to execute trade"
          logger.error(`Trade execution failed: ${errorMessage}`)
          setError(errorMessage)
        } finally {
          setIsLoading(false)
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Error handling signal action"
      logger.error(errorMessage)
      setError(errorMessage)
      setIsLoading(false)
    }
  }
  
  // Helper function to check if we should display a signal (especially for SELL signals)
  const shouldDisplaySignal = () => {
    if (!activeSignal) return false
    
    if (activeSignal.type === "SELL") {
      // Only show SELL signals if the user has connected an exchange AND owns the token
      return isExchangeConnected && userHoldings.some(h => h.token === activeSignal.token && h.amount > 0)
    }
    
    // Always show BUY signals regardless of exchange connection
    return true
  }
  
  // Check if user owns the token in the active signal (for SELL signals)
  const userOwnsToken = activeSignal ? 
    userHoldings.some(h => h.token === activeSignal.token && h.amount > 0) : 
    false

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading signals...</span>
      </div>
    )
  }

  if (error) {
    return (
      <Card className="mb-6">
        <CardContent className="p-6">
          <div className="flex items-center text-destructive">
            <AlertCircle className="h-5 w-5 mr-2" />
            <p>Error loading signals: {error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {activeSignal && shouldDisplaySignal() ? (
        <SignalCard 
          signal={activeSignal} 
          onAction={handleSignalAction} 
          exchangeConnected={isExchangeConnected}
          userOwnsToken={userOwnsToken}
        />
      ) : (
        <Card className="mb-6">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No active signals at the moment</p>
          </CardContent>
        </Card>
      )}
      
      {/* Connect Exchange Modal */}
      <ConnectExchangeModal 
        open={showConnectExchangeModal} 
        onOpenChange={setShowConnectExchangeModal}
        userId={userId}
        onSuccess={() => window.location.reload()} // Force a refresh when connection is successful
      />
    </div>
  )
}