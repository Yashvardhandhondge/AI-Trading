"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, AlertCircle, Bell, ArrowUp, ArrowDown, Info, Clock } from "lucide-react"
import { SignalCard } from "@/components/signal-card"
import { ConnectExchangeModal } from "@/components/connect-exchange-modal"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { logger } from "@/lib/logger"
import { tradingProxy } from "@/lib/trading-proxy"
import { toast } from "sonner"
import { useSocketStore } from "@/lib/socket-client"
import { telegramService } from "@/lib/telegram-service"

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
  const [unreadNotifications, setUnreadNotifications] = useState<number>(0)
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [lastNotificationId, setLastNotificationId] = useState<string | null>(null)
  const [notificationPermissionRequested, setNotificationPermissionRequested] = useState(false)
  const [notificationSent, setNotificationSent] = useState(false)
  
  // Get socket from store
  const { socket } = useSocketStore()

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
        
        // Check if this is a new signal (different from what we already have)
        const isNewSignal = !activeSignal || activeSignal.id !== data.signal.id
        
        if (isNewSignal) {
          // Show a toast notification for new signals
          toast(`New ${data.signal.type} signal for ${data.signal.token} at $${data.signal.price}`, {
            duration: 10000, // 10 seconds
            action: {
              label: "View",
              onClick: () => {
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }
            }
          })
          
          // Try Telegram's native notification if available
          if (window.Telegram?.WebApp) {
            try {
              window.Telegram.WebApp.HapticFeedback.notificationOccurred('success')
            } catch (e) {
              console.error("Error with Telegram haptic feedback:", e)
            }
          }
        }
        
        setActiveSignal(data.signal)
        setNotificationSent(false) // Reset notification flag for new signals
      } else {
        setActiveSignal(null)
      }
      
      setLastRefreshed(new Date())
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

  const fetchUnreadNotifications = async () => {
    try {
      const response = await fetch("/api/notifications/unread")
      if (response.ok) {
        const data = await response.json()
        if (data.notifications) {
          setUnreadNotifications(data.notifications.length)
        }
      }
    } catch (error) {
      logger.error("Error fetching unread notifications count:", error instanceof Error ? error : new Error(String(error)))
    }
  }

  useEffect(() => {
    fetchSignals()
    fetchUnreadNotifications()
    
    // Refresh signals every 2 minutes
    const signalIntervalId = setInterval(fetchSignals, 120000)
    
    // Refresh notification count more frequently
    const notificationIntervalId = setInterval(fetchUnreadNotifications, 30000)
    
    return () => {
      clearInterval(signalIntervalId)
      clearInterval(notificationIntervalId)
    }
  }, [userId])

  // Enhanced notification effect for active signals
  useEffect(() => {
    if (activeSignal && !notificationSent) {
      // Calculate expiration time
      const expiresAt = new Date(activeSignal.expiresAt)
      const minutesLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000))
      const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000) % 60)
      
      // Show custom toast for signal
      toast.custom((t) => (
        <div className="bg-blue-600 text-white p-4 rounded-lg shadow-lg max-w-md w-full">
          <div className="flex items-center">
            <div className={`rounded-full p-2 ${activeSignal.type === "BUY" ? "bg-green-500" : "bg-red-500"}`}>
              {activeSignal.type === "BUY" ? (
                <ArrowUp className="h-5 w-5 text-white" />
              ) : (
                <ArrowDown className="h-5 w-5 text-white" />
              )}
            </div>
            <div className="ml-3">
              <h3 className="font-bold text-lg">New {activeSignal.type} Signal!</h3>
              <p>{activeSignal.token} at ${activeSignal.price}</p>
            </div>
          </div>
          
          <div className="mt-3">
            <div className="flex justify-between text-sm mb-1">
              <span>Auto-executes in:</span>
              <span className="font-bold">{minutesLeft}:{secondsLeft.toString().padStart(2, '0')}</span>
            </div>
            <div className="w-full bg-blue-700 rounded-full h-2">
              <div
                className="bg-white h-2 rounded-full"
                style={{ width: `${(minutesLeft * 60 + secondsLeft) / 600 * 100}%` }}
              ></div>
            </div>
          </div>
          
          <div className="mt-4 flex justify-end space-x-2">
            <button 
              onClick={() => toast.dismiss(t)}
              className="px-3 py-1 rounded text-sm"
            >
              Dismiss
            </button>
            <button 
              className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-bold"
              onClick={() => {
                toast.dismiss(t)
                // Scroll to signal at the top
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              View Signal
            </button>
          </div>
        </div>
      ), { duration: 15000, position: "top-center" })
      
      // Try using Telegram's native notification features
      try {
        // Haptic feedback
        telegramService.triggerHapticFeedback('notification')
        
        // Show popup notification
        telegramService.showPopup(
          `🔔 New ${activeSignal.type} signal for ${activeSignal.token} at $${activeSignal.price}!\n\n⏰ Auto-executes in ${minutesLeft} minutes ${secondsLeft} seconds.`,
          [{ type: "default", text: "View Signal" }],
          () => {
            window.scrollTo({ top: 0, behavior: 'smooth' })
          }
        )
      } catch (error) {
        console.error("Error with Telegram notification:", error)
      }
      
      setNotificationSent(true)
    }
  }, [activeSignal, notificationSent])

  // Enhanced socket listener effect
  useEffect(() => {
    if (socket) {
      // Enhanced notification listener for new signals
      const handleNewSignal = (signal: Signal) => {
        // Don't show multiple notifications for the same signal
        if (signal.id === lastNotificationId) return
        
        setLastNotificationId(signal.id)
        
        // Calculate remaining time until auto-execution
        const expiresAt = new Date(signal.expiresAt)
        const minutesLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 60000))
        const secondsLeft = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000) % 60)
        
        // Use rich toast for prominent notification
        toast.custom((t) => (
          <div className="bg-blue-600 text-white p-4 rounded-lg shadow-lg max-w-md w-full">
            <div className="flex items-center">
              <div className={`rounded-full p-2 ${signal.type === "BUY" ? "bg-green-500" : "bg-red-500"}`}>
                {signal.type === "BUY" ? (
                  <ArrowUp className="h-5 w-5 text-white" />
                ) : (
                  <ArrowDown className="h-5 w-5 text-white" />
                )}
              </div>
              <div className="ml-3">
                <h3 className="font-bold text-lg">New {signal.type} Signal!</h3>
                <p>{signal.token} at ${signal.price}</p>
              </div>
            </div>
            
            <div className="mt-3">
              <div className="flex justify-between text-sm mb-1">
                <span>Auto-executes in:</span>
                <span className="font-bold">{minutesLeft}:{secondsLeft.toString().padStart(2, '0')}</span>
              </div>
              <div className="w-full bg-blue-700 rounded-full h-2">
                <div
                  className="bg-white h-2 rounded-full"
                  style={{ width: `${(minutesLeft * 60 + secondsLeft) / 600 * 100}%` }}
                ></div>
              </div>
            </div>
            
            <div className="mt-4 flex justify-end space-x-2">
              <button 
                onClick={() => toast.dismiss(t)}
                className="px-3 py-1 rounded text-sm"
              >
                Dismiss
              </button>
              <button 
                className="bg-white text-blue-600 px-3 py-1 rounded text-sm font-bold"
                onClick={() => {
                  toast.dismiss(t)
                  // Scroll to signal at the top
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                  // Force refresh signals
                  fetchSignals()
                }}
              >
                View Signal
              </button>
            </div>
          </div>
        ), { duration: 15000, position: "top-center" })
        
        // Try using Telegram's native notification features
        try {
          // Haptic feedback
          telegramService.triggerHapticFeedback('notification')
          
          // Show popup notification
          telegramService.showPopup(
            `🔔 New ${signal.type} signal for ${signal.token} at $${signal.price}!\n\n⏰ Auto-executes in ${minutesLeft} minutes ${secondsLeft} seconds.`,
            [{ type: "default", text: "View Signal" }],
            () => {
              window.scrollTo({ top: 0, behavior: 'smooth' })
              fetchSignals()
            }
          )
        } catch (error) {
          console.error("Error with Telegram notification:", error)
        }
        
        // Update the signal list
        fetchSignals()
      }
      
      // Helper functions to parse notification messages
      function parseTokenFromMessage(message: string): string {
        const tokenMatch = message.match(/for\s+(\w+)/)
        return tokenMatch ? tokenMatch[1] : "Unknown"
      }
      
      function parseNumberFromMessage(message: string): number {
        const priceMatch = message.match(/\$?(\d+(\.\d+)?)/)
        return priceMatch ? parseFloat(priceMatch[1]) : 0
      }
      
      // Setup enhanced socket listeners
      socket.on("new-signal", handleNewSignal)
      socket.on("notification", (notification: any) => {
        if (notification.type === "signal") {
          // Try to parse the notification data for signal information
          const signalData = notification.data || {}
          handleNewSignal({
            id: signalData.signalId || notification.id,
            type: signalData.signalType || (notification.message.includes("BUY") ? "BUY" : "SELL"),
            token: signalData.token || parseTokenFromMessage(notification.message),
            price: signalData.price || parseNumberFromMessage(notification.message),
            expiresAt: signalData.expiresAt || new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            riskLevel: signalData.riskLevel || "medium",
            createdAt: signalData.createdAt || new Date().toISOString()
          })
        }
      })
      
      return () => {
        socket.off("new-signal", handleNewSignal)
        socket.off("notification")
      }
    }
  }, [socket, lastNotificationId, fetchSignals])

  // Request Telegram notification permissions on component mount
  useEffect(() => {
    if (!notificationPermissionRequested) {
      // Request notification permissions
      telegramService.requestNotificationPermission().then(granted => {
        if (granted) {
          console.log("Notification permission granted")
        } else {
          console.log("Notification permission denied")
        }
        setNotificationPermissionRequested(true)
      })
    }
  }, [notificationPermissionRequested])

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
            
            // Show success toast
            toast.success(`Successfully bought ${activeSignal.token}`, {
              description: `Bought ${quantity.toFixed(6)} ${activeSignal.token} at $${activeSignal.price}`
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
            
            // Show success toast
            toast.success(`Successfully sold ${activeSignal.token}`, {
              description: `Sold ${holding.amount.toFixed(6)} ${activeSignal.token} at $${activeSignal.price}`
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
          
          // Show error toast
          toast.error("Trade execution failed", {
            description: errorMessage
          })
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

  // Calculate the time since last refresh
  const timeSinceRefresh = Math.floor((new Date().getTime() - lastRefreshed.getTime()) / 1000)

  const handleManualRefresh = () => {
    fetchSignals()
    fetchUnreadNotifications()
  }

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
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Error loading signals: {error}</AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button onClick={handleManualRefresh}>Retry</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Signal refresh info bar */}
      <div className="flex justify-between items-center mb-2 px-1">
        <div className="flex items-center text-sm text-muted-foreground">
          <span>Last checked: {timeSinceRefresh < 60 ? `${timeSinceRefresh}s ago` : `${Math.floor(timeSinceRefresh/60)}m ago`}</span>
        </div>
        <div className="flex items-center space-x-2">
          {unreadNotifications > 0 && (
            <div className="flex items-center">
              <Bell className="h-4 w-4 mr-1 text-blue-500" />
              <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                {unreadNotifications}
              </Badge>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={handleManualRefresh} className="h-8 px-2">
            Refresh
          </Button>
        </div>
      </div>
      
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
            <p className="text-sm text-muted-foreground mt-2">
              We'll notify you when new signals are available
            </p>
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