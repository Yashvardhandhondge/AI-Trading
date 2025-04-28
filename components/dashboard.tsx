"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowUp, ArrowDown, Settings, Info } from "lucide-react"
import { ConnectExchangeModal } from "@/components/connect-exchange-modal"
import { formatCurrency } from "@/lib/utils"
import { logger } from "@/lib/logger"
import { toast } from "sonner"
import { useSocketStore } from "@/lib/socket-client"
import type { SessionUser } from "@/lib/auth"

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

interface DashboardProps {
  user: SessionUser
  socket: any
}

export function Dashboard({ user, socket }: DashboardProps) {
  const [signals, setSignals] = useState<Signal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userHoldings, setUserHoldings] = useState<Record<string, number>>({})
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [positionAccumulation, setPositionAccumulation] = useState<Record<string, number>>({})
  
  // Fetch active signals
  const fetchSignals = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // We'll fetch multiple signals instead of just the active one
      const response = await fetch("/api/signals/list") // Adjust endpoint to fetch multiple signals
      
      if (!response.ok) {
        throw new Error(`Failed to fetch signals: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.signals && data.signals.length > 0) {
        setSignals(data.signals)
        logger.info(`Fetched ${data.signals.length} signals successfully`, {
          context: "Dashboard", 
          userId: user.id
        })
      } else {
        setSignals([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load signals")
      logger.error(`Error fetching signals: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setIsLoading(false)
    }
  }
  
  // Fetch user holdings
  const fetchUserHoldings = async () => {
    if (!user.exchangeConnected) return
    
    try {
      const response = await fetch('/api/portfolio')
      if (response.ok) {
        const data = await response.json()
        
        if (data.holdings) {
          const holdings: Record<string, number> = {}
          data.holdings.forEach((holding: any) => {
            holdings[holding.token] = holding.amount
          })
          setUserHoldings(holdings)
        }
      }
    } catch (error) {
      logger.error(`Error fetching user holdings: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }
  
  useEffect(() => {
    fetchSignals()
    fetchUserHoldings()
    
    // Load position accumulation data from localStorage
    try {
      const storedAccumulation = localStorage.getItem('positionAccumulation')
      if (storedAccumulation) {
        setPositionAccumulation(JSON.parse(storedAccumulation))
      }
    } catch (e) {
      logger.error("Failed to load position accumulation from localStorage")
    }
    
    // Refresh signals every 2 minutes
    const intervalId = setInterval(fetchSignals, 120000)
    
    // Listen for socket events
    if (socket) {
      socket.on("new-signal", (signal: Signal) => {
        // Add the new signal to the list
        setSignals(prev => {
          const exists = prev.some(s => s.id === signal.id)
          if (exists) return prev
          return [signal, ...prev]
        })
        
        // Show notification
        toast(`New ${signal.type} signal for ${signal.token}`, {
          description: `Price: ${formatCurrency(signal.price)}`,
          action: {
            label: "View",
            onClick: () => {
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }
          }
        })
      })
    }
    
    return () => {
      clearInterval(intervalId)
      if (socket) {
        socket.off("new-signal")
      }
    }
  }, [user.id, user.exchangeConnected, socket])
  
  // Handle signal actions (Buy/Skip)
  const handleSignalAction = async (action: "accept" | "skip", signal: Signal) => {
    try {
      // If not connected to exchange and trying to accept, show connect modal
      if (action === "accept" && !user.exchangeConnected) {
        setShowConnectModal(true)
        return
      }
      
      // For SELL signals, verify user has the token
      if (signal.type === "SELL" && action === "accept" && (!userHoldings[signal.token] || userHoldings[signal.token] <= 0)) {
        toast.error(`You don't own any ${signal.token} to sell`)
        return
      }
      
      // Set loading state for this specific signal
      setActionLoading(prev => ({ ...prev, [signal.id]: action }))
      
      // Call API to handle the action
      const response = await fetch(`/api/signals/${signal.id}/${action}`, {
        method: "POST"
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to process action")
      }
      
      // Handle success
      if (action === "accept") {
        // Update position accumulation for BUY signals
        if (signal.type === "BUY") {
          // Increment by 10% for each buy
          const newAccumulation = { 
            ...positionAccumulation,
            [signal.token]: (positionAccumulation[signal.token] || 0) + 10
          }
          setPositionAccumulation(newAccumulation)
          localStorage.setItem('positionAccumulation', JSON.stringify(newAccumulation))
          
          toast.success(`Successfully bought ${signal.token}`, {
            description: `Position accumulation: ${newAccumulation[signal.token]}%`
          })
        } else {
          // For SELL, remove from position accumulation
          const newAccumulation = { ...positionAccumulation }
          delete newAccumulation[signal.token]
          setPositionAccumulation(newAccumulation)
          localStorage.setItem('positionAccumulation', JSON.stringify(newAccumulation))
          
          toast.success(`Successfully sold ${signal.token}`)
        }
        
        // Refresh holdings
        fetchUserHoldings()
      }
      
      // Mark signal as processed in the UI
      setSignals(prev => 
        prev.map(s => 
          s.id === signal.id 
            ? { ...s, processed: true, action } 
            : s
        )
      )
    } catch (error) {
      toast.error(`Action failed: ${error instanceof Error ? error.message : "Unknown error"}`)
      logger.error(`Signal action error: ${error instanceof Error ? error.message : "Unknown error"}`)
    } finally {
      // Clear loading state
      setActionLoading(prev => {
        const newState = { ...prev }
        delete newState[signal.id]
        return newState
      })
    }
  }
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading signals...</span>
      </div>
    )
  }
  
  // Function to get time since signal creation
  const getTimeSince = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.round(diffMs / 60000)
    
    if (diffMins < 60) return `${diffMins}m ago`
    return `${Math.floor(diffMins / 60)}h ago`
  }
  
  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Bot Trades</h2>
        <Button variant="ghost" size="icon" onClick={fetchSignals}>
          <Settings className="h-5 w-5" />
        </Button>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4 text-red-800">
          {error}
        </div>
      )}
      
      {signals.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No active signals at the moment</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {signals.map(signal => {
            // Check if this signal has been processed
            const isProcessed = !!(signal as any).processed
            const userOwnsToken = !!userHoldings[signal.token] && userHoldings[signal.token] > 0
            const showBuyButton = signal.type === "BUY" || (signal.type === "SELL" && userOwnsToken)
            const accumulatedPercentage = positionAccumulation[signal.token] || 0
            const signalAction = (signal as any).action
            
            return (
              <Card key={signal.id} className="border-l-4 border-l-primary">
                <CardContent className="p-4">
                  <div className="grid grid-cols-[auto_1fr_auto] gap-3">
                    {/* Signal type indicator */}
                    <div className="flex flex-col items-center justify-center">
                      <div className={`p-2 rounded-md ${signal.type === "BUY" ? "bg-green-100" : "bg-red-100"}`}>
                        <span className="font-medium">
                          {signal.type === "BUY" ? "Buy" : "SELL"}
                        </span>
                      </div>
                    </div>
                    
                    {/* Signal details */}
                    <div className="flex flex-col py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">${signal.token}</span>
                        <span className="text-sm text-green-600">(+1.14%)</span>
                        <span className="text-xs text-muted-foreground">{getTimeSince(signal.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1">
                          <span className="text-sm">Risk:</span>
                          <span className="text-sm font-medium">64/100</span>
                        </div>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                          Details
                        </Button>
                      </div>
                    </div>
                    
                    {/* Signal status */}
                    <div className="flex items-center">
                      {isProcessed ? (
                        <Badge className={signalAction === "accept" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
                          {signalAction === "accept" ? "Executed" : "Skipped"}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  
                  {/* Action buttons */}
                  {!isProcessed && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <Button 
                        className={showBuyButton ? "bg-green-100 hover:bg-green-200 text-green-800" : "bg-blue-600 text-white"}
                        disabled={!!actionLoading[signal.id]}
                        onClick={() => handleSignalAction("accept", signal)}
                      >
                        {actionLoading[signal.id] === "accept" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        {showBuyButton ? (signal.type === "BUY" ? "Buy 10%" : "Sell") : "Connect Wallet"}
                      </Button>
                      <Button 
                        variant="outline"
                        disabled={!!actionLoading[signal.id]}
                        onClick={() => handleSignalAction("skip", signal)}
                      >
                        {actionLoading[signal.id] === "skip" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Skip
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
      
      {/* Connect Exchange Modal */}
      <ConnectExchangeModal 
        open={showConnectModal} 
        onOpenChange={setShowConnectModal}
        userId={Number(user.id)}
        onSuccess={() => window.location.reload()} 
      />
    </div>
  )
}