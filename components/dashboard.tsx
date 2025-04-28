"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, ArrowUp, ArrowDown, Settings, Info, RefreshCw, Clock, AlertCircle } from "lucide-react"
import { ConnectExchangeModal } from "@/components/connect-exchange-modal"
import { formatCurrency } from "@/lib/utils"
import { logger } from "@/lib/logger"
import { toast } from "sonner"
import type { SessionUser } from "@/lib/auth"
import { signalService, type Signal } from "@/lib/signal-service"
import { telegramService } from "@/lib/telegram-service"

interface DashboardProps {
  user: SessionUser
}

export function Dashboard({ user }: DashboardProps) {
  const [signals, setSignals] = useState<Signal[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [userHoldings, setUserHoldings] = useState<Record<string, number>>({})
  const [showConnectModal, setShowConnectModal] = useState(false)
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [positionAccumulation, setPositionAccumulation] = useState<Record<string, number>>({})
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [lastSignalCheckTime, setLastSignalCheckTime] = useState<number>(Date.now())
  
  // Fetch active signals - wrapped in useCallback to be reusable
  const fetchSignals = useCallback(async (showLoadingState = true) => {
    try {
      if (showLoadingState) {
        setIsLoading(true)
      } else {
        setRefreshing(true)
      }
      
      setError(null)
      
      // Use our signal service to fetch signals
      const fetchedSignals = await signalService.getSignals({
        riskLevel: user.riskLevel as "low" | "medium" | "high",
        limit: 10
      })
      
      if (fetchedSignals.length > 0) {
        setSignals(fetchedSignals)
        logger.info(`Fetched ${fetchedSignals.length} signals successfully`, {
          context: "Dashboard", 
          userId: user.id
        })
      } else {
        logger.info("No signals returned from service", {
          context: "Dashboard",
          userId: user.id
        })
        // Keep existing signals if we have them, otherwise empty array
        setSignals(signals => signals.length > 0 ? signals : [])
      }
      
      // Update last fetched timestamp
      setLastUpdated(new Date())
      setLastSignalCheckTime(Date.now())
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load signals"
      setError(errorMessage)
      logger.error(`Error fetching signals: ${errorMessage}`)
    } finally {
      setIsLoading(false)
      setRefreshing(false)
    }
  }, [user.id, user.riskLevel])
  
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
    const intervalId = setInterval(() => fetchSignals(false), 120000)
    
    return () => {
      clearInterval(intervalId)
    }
  }, [user.id, user.exchangeConnected, fetchSignals])
  
  // Handle manual refresh
  const handleRefresh = () => {
    fetchSignals(false)
  }
  
  // Check for new signals periodically
  const checkForNewSignals = useCallback(async () => {
    try {
      const result = await signalService.checkForNewSignals(lastSignalCheckTime)
      
      if (result.hasNew && result.newSignals.length > 0) {
        // Add the new signals to the list (avoiding duplicates)
        setSignals(prev => {
          const prevIds = new Set(prev.map(s => s.id))
          const newSignalsToAdd = result.newSignals.filter(s => !prevIds.has(s.id))
          
          if (newSignalsToAdd.length === 0) return prev
          
          // Get the newest signal for notification
          const newestSignal = newSignalsToAdd[0]
          
          // Show notification
          toast(`New ${newestSignal.type} signal for ${newestSignal.token}`, {
            description: `Price: ${formatCurrency(newestSignal.price)}`,
            action: {
              label: "View",
              onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' })
            },
            duration: 10000 // 10 seconds
          })
          
          // Try Telegram's native notification if available
          try {
            telegramService.triggerHapticFeedback('notification')
            telegramService.showPopup(
              `🔔 New ${newestSignal.type} signal for ${newestSignal.token} at ${formatCurrency(newestSignal.price)}`,
              [{ type: "default", text: "View" }],
              () => window.scrollTo({ top: 0, behavior: 'smooth' })
            )
          } catch (e) {
            // Ignore errors with Telegram API
          }
          
          // Update last check time
          setLastSignalCheckTime(Date.now())
          
          // Return combined array with new signals first
          return [...newSignalsToAdd, ...prev]
        })
      }
    } catch (error) {
      logger.error(`Error checking for new signals: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }, [lastSignalCheckTime])
  
  // Check for new signals every minute
  useEffect(() => {
    const checkInterval = setInterval(checkForNewSignals, 60000)
    return () => clearInterval(checkInterval)
  }, [checkForNewSignals])
  
  // Handle signal actions (Buy/Skip)
  const handleSignalAction = async (action: "accept" | "skip" | "accept-partial", signal: Signal, percentage?: number) => {
    try {
      // If not connected to exchange and trying to accept, show connect modal
      if ((action === "accept" || action === "accept-partial") && !user.exchangeConnected) {
        setShowConnectModal(true)
        return
      }
      
      // For SELL signals, verify user has the token
      if (signal.type === "SELL" && (action === "accept" || action === "accept-partial") && (!userHoldings[signal.token] || userHoldings[signal.token] <= 0)) {
        toast.error(`You don't own any ${signal.token} to sell`)
        return
      }
      
      // Set loading state for this specific signal
      setActionLoading(prev => ({ ...prev, [signal.id]: action }))
      
      // Call our signal service to handle the action
      await signalService.executeSignalAction(signal.id, action, percentage)
      
      // Handle success
      if (action === "accept" || action === "accept-partial") {
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
        } else if (action === "accept") {
          // For full SELL, remove from position accumulation
          const newAccumulation = { ...positionAccumulation }
          delete newAccumulation[signal.token]
          setPositionAccumulation(newAccumulation)
          localStorage.setItem('positionAccumulation', JSON.stringify(newAccumulation))
          
          toast.success(`Successfully sold ${signal.token}`)
        } else if (action === "accept-partial" && percentage) {
          // For partial SELL, reduce the accumulated percentage
          const currentAccumulation = positionAccumulation[signal.token] || 0
          if (currentAccumulation > 0) {
            const newPercentage = Math.max(0, currentAccumulation - (currentAccumulation * (percentage / 100)))
            const newAccumulation = { ...positionAccumulation, [signal.token]: newPercentage }
            setPositionAccumulation(newAccumulation)
            localStorage.setItem('positionAccumulation', JSON.stringify(newAccumulation))
            
            toast.success(`Successfully sold ${percentage}% of ${signal.token}`)
          }
        }
        
        // Refresh holdings
        fetchUserHoldings()
      } else if (action === "skip") {
        toast.info(`Skipped ${signal.type} signal for ${signal.token}`)
      }
      
      // Mark signal as processed in the UI
      setSignals(prev => 
        prev.map(s => 
          s.id === signal.id 
            ? { ...s, processed: true, action } 
            : s
        )
      )
      
      // Trigger haptic feedback if available
      try {
        telegramService.triggerHapticFeedback(action === "skip" ? "selection" : "notification")
      } catch (e) {
        // Ignore errors
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      toast.error(`Action failed: ${errorMessage}`)
      logger.error(`Signal action error: ${errorMessage}`)
    } finally {
      // Clear loading state
      setActionLoading(prev => {
        const newState = { ...prev }
        delete newState[signal.id]
        return newState
      })
    }
  }
  
  if (isLoading && signals.length === 0) {
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
  
  // Calculate time left until auto-execution
  const getTimeLeft = (expiresAt: string) => {
    const expiry = new Date(expiresAt).getTime()
    const now = new Date().getTime()
    const diffMs = Math.max(0, expiry - now)
    const diffMins = Math.floor(diffMs / 60000)
    const diffSecs = Math.floor((diffMs % 60000) / 1000)
    
    return `${diffMins}:${diffSecs.toString().padStart(2, '0')}`
  }
  
  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Bot Trades</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRefresh}
            disabled={refreshing}
            className={refreshing ? "animate-spin" : ""}
          >
            <RefreshCw className="h-5 w-5" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => refreshing}>
            <Settings className="h-5 w-5" />
          </Button>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4 text-red-800">
          <div className="flex items-start">
            <AlertCircle className="h-4 w-4 mt-0.5 mr-2 flex-shrink-0" />
            <p>{error}</p>
          </div>
        </div>
      )}
      
      <div className="text-xs text-muted-foreground mb-2">
        Last updated: {lastUpdated.toLocaleTimeString()}
      </div>
      
      {signals.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No active signals at the moment</p>
            <p className="text-sm text-muted-foreground mt-2">We'll notify you when new signals are available</p>
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
            const timeLeft = getTimeLeft(signal.expiresAt)
            const isExpiringSoon = parseInt(timeLeft.split(':')[0]) === 0 // Less than 1 minute left
            
            // Skip signals that don't match our criteria
            if (signal.type === "SELL" && !userOwnsToken) {
              return null
            }
            
            return (
              <Card key={signal.id} className={`border-l-4 ${signal.type === "BUY" ? "border-l-green-500" : "border-l-red-500"} ${isProcessed ? "opacity-70" : ""}`}>
                <CardContent className="p-4">
                  <div className="grid grid-cols-[auto_1fr_auto] gap-3">
                    {/* Signal type indicator */}
                    <div className="flex flex-col items-center justify-center">
                      <div className={`p-2 rounded-md ${signal.type === "BUY" ? "bg-green-100" : "bg-red-100"}`}>
                        <span className={`font-medium ${signal.type === "BUY" ? "text-green-700" : "text-red-700"}`}>
                          {signal.type}
                        </span>
                      </div>
                    </div>
                    
                    {/* Signal details */}
                    <div className="flex flex-col py-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold">{signal.token}</span>
                        <span className="text-sm font-medium">${signal.price.toFixed(2)}</span>
                        <span className="text-xs text-muted-foreground">{getTimeSince(signal.createdAt)}</span>
                      </div>
                      
                      {/* Auto-execution timer */}
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center gap-1">
                          <Clock className={`h-3.5 w-3.5 ${isExpiringSoon ? "text-red-500 animate-pulse" : "text-muted-foreground"}`} />
                          <span className={`text-sm ${isExpiringSoon ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
                            {timeLeft}
                          </span>
                        </div>
                        
                        {/* Risk level badge */}
                        <Badge className="text-xs" variant="outline">
                          {signal.riskLevel.toUpperCase()} RISK
                        </Badge>
                        
                        {/* Details button */}
                        {(signal.positives?.length || signal.warnings?.length) ? (
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
                            Details
                          </Button>
                        ) : null}
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
                  
                  {/* Position accumulation display for BUY signals */}
                  {signal.type === "BUY" && accumulatedPercentage > 0 && !isProcessed && (
                    <div className="mt-3 p-2 bg-green-50 dark:bg-green-900/20 rounded-md">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-xs font-medium text-green-800 dark:text-green-300">Position Built:</span>
                        <span className="text-xs font-bold text-green-800 dark:text-green-300">{accumulatedPercentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div 
                          className="bg-green-500 h-1.5 rounded-full" 
                          style={{ width: `${Math.min(accumulatedPercentage, 100)}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                  
                  {/* Action buttons */}
                  {!isProcessed && (
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      {signal.type === "BUY" ? (
                        <>
                          <Button 
                            className={showBuyButton ? "bg-green-600 hover:bg-green-700 text-white" : "bg-blue-600 text-white"}
                            disabled={!!actionLoading[signal.id]}
                            onClick={() => handleSignalAction("accept", signal)}
                          >
                            {actionLoading[signal.id] === "accept" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            {showBuyButton ? "Buy 10%" : "Connect Wallet"}
                          </Button>
                          <Button 
                            variant="outline"
                            disabled={!!actionLoading[signal.id]}
                            onClick={() => handleSignalAction("skip", signal)}
                          >
                            {actionLoading[signal.id] === "skip" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Skip
                          </Button>
                        </>
                      ) : (
                        <>
                          {/* SELL action buttons */}
                          <Button 
                            className="bg-red-600 hover:bg-red-700 text-white"
                            disabled={!!actionLoading[signal.id]}
                            onClick={() => handleSignalAction("accept", signal)}
                          >
                            {actionLoading[signal.id] === "accept" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Sell Fully
                          </Button>
                          <Button 
                            className="bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:bg-amber-100 text-amber-800"
                            disabled={!!actionLoading[signal.id]}
                            onClick={() => handleSignalAction("accept-partial", signal, 50)}
                          >
                            {actionLoading[signal.id] === "accept-partial" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Sell 50%
                          </Button>
                          <Button 
                            variant="outline" 
                            className="col-span-2 mt-1" 
                            onClick={() => handleSignalAction("skip", signal)} 
                            disabled={!!actionLoading[signal.id]}
                          >
                            {actionLoading[signal.id] === "skip" && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Don't Sell
                          </Button>
                        </>
                      )}
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