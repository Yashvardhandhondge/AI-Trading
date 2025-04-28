"use client"

import { useState, useEffect, useCallback } from "react"
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
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date())
  const [lastNotificationId, setLastNotificationId] = useState<string | null>(null)
  const [positionAccumulation, setPositionAccumulation] = useState<Record<string, number>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastSignalCheckTime, setLastSignalCheckTime] = useState<number>(Date.now())

  // Create a throttled fetch signals function
  const fetchSignals = useCallback(async (forceRefresh = false) => {
    // If not force refreshing and we refreshed recently (within 15 seconds), skip
    const now = Date.now();
    if (!forceRefresh && now - lastSignalCheckTime < 15000) {
      return;
    }
    
    // Don't refresh if already refreshing
    if (isRefreshing) {
      return;
    }
    
    try {
      setIsRefreshing(true);
      setLastSignalCheckTime(now);
      
      // Always fetch signals regardless of exchange connection
      const response = await fetch("/api/signals/active");
      
      if (!response.ok) {
        throw new Error(`Failed to fetch signals: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.signal) {
        // Check if this is a new signal (different from what we already have)
        const isNewSignal = !activeSignal || activeSignal.id !== data.signal.id;
        
        if (isNewSignal) {
          // Only log and show notifications for new signals
          logger.info(`Received new signal: ${data.signal.type} for ${data.signal.token}`, {
            context: "SignalDashboard",
            userId
          });
          
          // Show a toast notification for new signals
          toast(`New ${data.signal.type} signal for ${data.signal.token}`, {
            duration: 10000,
            action: {
              label: "View",
              onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' })
            }
          });
          
          // Try Telegram's native notification if available
          try {
            telegramService.triggerHapticFeedback('notification');
          } catch (e) {
            // Ignore errors
          }
        }
        
        setActiveSignal(data.signal);
      } else if (data.signal === null && activeSignal) {
        // Only clear active signal if we're explicitly told there's no signal
        setActiveSignal(null);
      }
      
      setLastRefreshed(new Date());
      setIsLoading(false);
    } catch (err) {
      // Only set error if we don't have a signal already
      if (!activeSignal) {
        setError(err instanceof Error ? err.message : "Failed to fetch signals");
        logger.error("Error fetching signals:", err instanceof Error ? err : new Error(String(err)));
      }
    } finally {
      setIsRefreshing(false);
    }
  }, [activeSignal, userId, isRefreshing, lastSignalCheckTime]);

  // Check for new signals periodically
  const checkForNewSignals = useCallback(async () => {
    try {
      const response = await fetch("/api/signals/latest");
      
      if (response.ok) {
        const data = await response.json();
        if (data.signal && data.signal.id) {
          // Check if this is a new signal not in our current list
          const isNew = !activeSignal || activeSignal.id !== data.signal.id;
          
          if (isNew) {
            // Add the new signal to the state
            setActiveSignal(data.signal);
            
            // Don't show multiple notifications for the same signal
            if (data.signal.id !== lastNotificationId) {
              setLastNotificationId(data.signal.id);
              
              // Show notification
              toast(`New ${data.signal.type} signal for ${data.signal.token}`, {
                description: `Price: ${data.signal.price}`,
                action: {
                  label: "View",
                  onClick: () => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }
                }
              });
              
              // Try Telegram's native notification if available
              try {
                telegramService.triggerHapticFeedback('notification');
                telegramService.showPopup(
                  `🔔 New ${data.signal.type} signal for ${data.signal.token}`,
                  [{ type: "default", text: "View" }],
                  () => window.scrollTo({ top: 0, behavior: 'smooth' })
                );
              } catch (e) {
                // Ignore errors with Telegram API
              }
            }
          }
        }
      }
    } catch (error) {
      logger.error(`Error checking for new signals: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [activeSignal, lastNotificationId]);

  useEffect(() => {
    // Load position accumulation data from localStorage only once at component mount
    try {
      const storedAccumulation = localStorage.getItem('positionAccumulation');
      if (storedAccumulation) {
        setPositionAccumulation(JSON.parse(storedAccumulation));
      }
    } catch (e) {
      console.error("Failed to load position accumulation from localStorage:", e);
    }
    
    fetchSignals(true);
    
    // Refresh signals every 1 minute
    const signalIntervalId = setInterval(() => fetchSignals(), 60000);
    
    // Check for new signals every 30 seconds
    const newSignalCheckInterval = setInterval(() => checkForNewSignals(), 30000);
    
    return () => {
      clearInterval(signalIntervalId);
      clearInterval(newSignalCheckInterval);
    };
  }, [userId, fetchSignals, checkForNewSignals]);

  const handleSignalAction = async (action: "accept" | "skip" | "accept-partial", signalId: string, percentage?: number) => {
    try {
      // If user tries to accept a signal but has no exchange connected, show modal
      if ((action === "accept" || action === "accept-partial") && !isExchangeConnected) {
        setShowConnectExchangeModal(true)
        return
      }
      
      // For SELL signals, verify the user actually owns the token
      if (activeSignal?.type === "SELL" && (action === "accept" || action === "accept-partial")) {
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
      if ((action === "accept" || action === "accept-partial") && isExchangeConnected && activeSignal) {
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
            
            // Update position accumulation for this token
            // Increment by 10% each time (for multiple buys tracking)
            setPositionAccumulation(prev => {
              const currentPercentage = prev[activeSignal.token] || 0;
              return {
                ...prev,
                [activeSignal.token]: currentPercentage + 10
              };
            });
            
            // Store accumulated percentage in localStorage to persist between sessions
            try {
              const storedAccumulation = localStorage.getItem('positionAccumulation');
              const accumulation = storedAccumulation ? JSON.parse(storedAccumulation) : {};
              accumulation[activeSignal.token] = (accumulation[activeSignal.token] || 0) + 10;
              localStorage.setItem('positionAccumulation', JSON.stringify(accumulation));
            } catch (e) {
              // Ignore localStorage errors
              console.error("Failed to store position accumulation in localStorage:", e);
            }
            
            logger.info(`Successfully executed BUY for ${activeSignal.token}`, {
              context: "SignalDashboard",
              userId,
              data: { quantity, value: tradeValue }
            })
            
            // Show success toast with accumulation info
            const newAccumulatedPercentage = (positionAccumulation[activeSignal.token] || 0) + 10;
            toast.success(`Successfully bought ${activeSignal.token}`, {
              description: `Bought ${quantity.toFixed(6)} ${activeSignal.token} at $${activeSignal.price} (Total position: ${newAccumulatedPercentage}%)`
            })
          } 
          // For SELL signals, sell entire or partial holding based on action
          else if (activeSignal.type === "SELL") {
            // Find the token in holdings
            const holding = userHoldings.find(h => h.token === activeSignal.token)
            
            if (!holding || holding.amount <= 0) {
              throw new Error(`No ${activeSignal.token} holdings found`)
            }
            
            // Calculate sell amount (either full or partial based on action)
            const sellAmount = action === "accept-partial" && percentage 
              ? holding.amount * (percentage / 100) 
              : holding.amount;
            
            // Execute sell order
            await tradingProxy.executeTrade(
              userId,
              `${activeSignal.token}USDT`,
              "SELL",
              sellAmount
            )
            
            // If selling partially, update position accumulation
            if (action === "accept-partial" && percentage) {
              const remainingPercentage = positionAccumulation[activeSignal.token] || 0;
              if (remainingPercentage > 0) {
                const newPercentage = Math.max(0, remainingPercentage - (remainingPercentage * (percentage / 100)));
                setPositionAccumulation(prev => ({
                  ...prev,
                  [activeSignal.token]: newPercentage
                }));
                
                // Update localStorage
                try {
                  const storedAccumulation = localStorage.getItem('positionAccumulation');
                  const accumulation = storedAccumulation ? JSON.parse(storedAccumulation) : {};
                  accumulation[activeSignal.token] = newPercentage;
                  localStorage.setItem('positionAccumulation', JSON.stringify(accumulation));
                } catch (e) {
                  console.error("Failed to update position accumulation in localStorage:", e);
                }
              }
            } else {
              // If selling fully, reset the position accumulation for this token
              setPositionAccumulation(prev => {
                const newAccumulation = { ...prev };
                delete newAccumulation[activeSignal.token];
                return newAccumulation;
              });
              
              // Update localStorage
              try {
                const storedAccumulation = localStorage.getItem('positionAccumulation');
                if (storedAccumulation) {
                  const accumulation = JSON.parse(storedAccumulation);
                  delete accumulation[activeSignal.token];
                  localStorage.setItem('positionAccumulation', JSON.stringify(accumulation));
                }
              } catch (e) {
                console.error("Failed to update position accumulation in localStorage:", e);
              }
            }
            
            logger.info(`Successfully executed SELL for ${activeSignal.token}`, {
              context: "SignalDashboard",
              userId,
              data: { 
                amount: sellAmount,
                percentage: action === "accept-partial" ? percentage : 100
              }
            })
            
            // Show success toast
            const sellType = action === "accept-partial" ? `${percentage}%` : "all";
            toast.success(`Successfully sold ${sellType} of ${activeSignal.token}`, {
              description: `Sold ${sellAmount.toFixed(6)} ${activeSignal.token} at $${activeSignal.price}`
            })
          }
          
          // Record the signal as processed in our database
          await fetch(`/api/signals/${signalId}/${action}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ 
              percentage: percentage // Include percentage parameter for partial sells
            })
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

  return (
    <div className="space-y-4">
      {/* Signal refresh info bar */}
      <div className="flex justify-between items-center mb-2 px-1">
        <div className="flex items-center text-sm text-muted-foreground">
          {isRefreshing ? (
            <span className="flex items-center">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              Refreshing...
            </span>
          ) : (
            <span>Last updated: {Math.floor((new Date().getTime() - lastRefreshed.getTime()) / 1000)}s ago</span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => fetchSignals(true)} 
            disabled={isRefreshing}
            className="h-8 px-2"
          >
            {isRefreshing ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              "Refresh"
            )}
          </Button>
        </div>
      </div>
      
      {activeSignal && shouldDisplaySignal() ? (
        <SignalCard 
          signal={activeSignal} 
          onAction={handleSignalAction} 
          exchangeConnected={isExchangeConnected}
          userOwnsToken={userOwnsToken}
          accumulatedPercentage={positionAccumulation[activeSignal.token] || 0}
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