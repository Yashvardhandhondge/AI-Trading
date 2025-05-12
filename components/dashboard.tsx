"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Loader2, 
  Settings, 
  Info, 
  RefreshCw, 
  Clock, 
  AlertCircle, 
  History, 
  Bell 
} from "lucide-react"
import { SignalCard } from "@/components/signal-card"

import { ConnectExchangeModal } from "@/components/connect-exchange-modal"
import { ExchangeConnectionBanner } from "@/components/exchange-connection-banner"
import { ActivityLogTable } from "./activity-log-table"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import type { SessionUser } from "@/lib/auth"
import { signalService, type Signal } from "@/lib/signal-service"
import { telegramService } from "@/lib/telegram-service"

interface DashboardProps {
  user: SessionUser;
  onExchangeStatusChange?: () => void;
  onSwitchToSettings?: () => void;
}

export function Dashboard({ user, onExchangeStatusChange, onSwitchToSettings }: DashboardProps) {
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
  const [notifiedSignalIds, setNotifiedSignalIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<string>("signals");
  
  // Fetch active signals - wrapped in useCallback to be reusable
  const fetchSignals = useCallback(async (showLoadingState = true) => {
    // Implementation remains the same
    try {
      if (showLoadingState) {
        setIsLoading(true)
      } else {
        setRefreshing(true)
      }
      
      setError(null)
      
      logger.info(`Fetching signals for risk level: ${user.riskLevel}`, {
        context: "Dashboard", 
        userId: user.id
      })
      
      // Use our signal service to fetch signals
      const fetchedSignals = await signalService.getSignals({
        riskLevel: user.riskLevel as "low" | "medium" | "high",
        limit: 10
      })
      
      // Process signals to identify if they're old (received more than 10 minutes ago)
      const processedSignals = fetchedSignals.map(signal => {
        // Create a Date object from the createdAt string
        const createdDate = new Date(signal.createdAt);
        const now = new Date();
        
        // Calculate how long ago the signal was created (in minutes)
        const minutesAgo = Math.floor((now.getTime() - createdDate.getTime()) / (1000 * 60));
        
        // Mark signals older than 10 minutes
        const isOldSignal = minutesAgo >= 10;
        
        return {
          ...signal,
          isOldSignal
        };
      });
      
      if (processedSignals.length > 0) {
        setSignals(processedSignals)
        logger.info(`Fetched ${processedSignals.length} signals successfully`, {
          context: "Dashboard", 
          userId: user.id
        })
      } else {
        logger.info("No signals returned from service", {
          context: "Dashboard",
          userId: user.id
        })
        // Keep existing signals if we have them, otherwise empty array
        setSignals([])
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
          
          logger.info(`Fetched user holdings: ${Object.keys(holdings).join(', ')}`, {
            context: "Dashboard",
            userId: user.id
          })
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
    
    // Refresh signals every 1 minute
    const intervalId = setInterval(() => fetchSignals(false), 60000)
    
    return () => {
      clearInterval(intervalId)
    }
  }, [user.id, user.exchangeConnected, fetchSignals])
  
  // Check for new signals periodically
  const checkForNewSignals = useCallback(async () => {
    try {
      // Don't check too frequently
      const now = Date.now();
      if (now - lastSignalCheckTime < 15000) { // Only check every 15+ seconds
        return;
      }
      
      setLastSignalCheckTime(now);
      const result = await signalService.checkForNewSignals(lastSignalCheckTime);
      
      if (result.hasNew && result.newSignals.length > 0) {
        // Filter out signals with price of 0 or invalid prices
        const validNewSignals = result.newSignals.filter(signal => {
          // Check for valid price
          if (!signal.price || signal.price <= 0) {
            logger.warn(`Ignoring signal with invalid price: ${signal.token}`, {
              context: "Dashboard",
              userId: user.id,
              data: { price: signal.price }
            });
            return false;
          }
          
          // Deduplicate based on signal ID
          if (notifiedSignalIds.has(signal.id)) {
            logger.debug(`Skipping already notified signal: ${signal.id}`, {
              context: "Dashboard"
            });
            return false;
          }
          
          // Add to notified set
          return true;
        });
        
        if (validNewSignals.length === 0) {
          return; // No valid signals to notify about
        }
        
        // Add the new signals to the list (avoiding duplicates)
        setSignals(prev => {
          const prevIds = new Set(prev.map(s => s.id));
          const newSignalsToAdd = validNewSignals.filter(s => !prevIds.has(s.id));
          
          if (newSignalsToAdd.length === 0) return prev;
          
          // Get the newest signal for notification
          const newestSignal = newSignalsToAdd[0];
          
          // Add to notified IDs set to prevent duplicate notifications
          setNotifiedSignalIds(prev => {
            const newSet = new Set(prev);
            newSet.add(newestSignal.id);
            return newSet;
          });
          
          // Only show notification for signals with valid prices
          if (newestSignal.price > 0) {
            // Show notification
            toast(`New ${newestSignal.type} signal for ${newestSignal.token}`, {
              description: `Price: ${newestSignal.price}`,
              action: {
                label: "View",
                onClick: () => {
                  setActiveTab("signals");
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              },
              duration: 10000 // 10 seconds
            });
            
            // Try Telegram's native notification if available
            try {
              telegramService.triggerHapticFeedback('notification');
              telegramService.showPopup(
                `🔔 New ${newestSignal.type} signal for ${newestSignal.token}`,
                [{ type: "default", text: "View" }],
                () => {
                  setActiveTab("signals");
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }
              );
            } catch (e) {
              // Ignore errors with Telegram API
            }
          }
          
          // Return combined array with new signals first
          return [...newSignalsToAdd, ...prev];
        });
      }
    } catch (error) {
      logger.error(`Error checking for new signals: ${error instanceof Error ? error.message : "Unknown error"}`);
    }
  }, [lastSignalCheckTime, user.id, notifiedSignalIds]);
  
  // Update the useEffect for checking new signals
  useEffect(() => {
    // Check for new signals every 2 minutes
    const checkInterval = setInterval(checkForNewSignals, 120000); // 2 minutes
    return () => clearInterval(checkInterval);
  }, [checkForNewSignals]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchSignals(false)
  }
  
  // Handle settings click - Now changes the active tab instead of using router
  const handleSettingsClick = () => {
    if (onSwitchToSettings) {
      onSwitchToSettings();
    }
  }
  
  // Handle tab change
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  }

  // Handle signal actions (Buy/Skip)
  const handleSignalAction = async (action: "accept" | "skip" | "accept-partial", signalId: string, percentage?: number) => {
    try {
      // Get the signal from our state
      const signal = signals.find(s => s.id === signalId);
      
      if (!signal) {
        throw new Error("Signal not found");
      }
      
      // For Skip actions, we want to handle it even if exchange is not connected
      if (action === "skip") {
        // Just update the UI to show this signal as skipped
        setSignals(prev => 
          prev.map(s => 
            s.id === signalId 
              ? { ...s, processed: true, action: "skip" } 
              : s
          )
        );
        
        // Show a toast message
        toast.info(`Skipped ${signal.type} signal for ${signal.token}`);
        
        // Try to trigger haptic feedback
        try {
          telegramService.triggerHapticFeedback('selection');
        } catch (e) {
          // Ignore errors with haptics
        }
        
        // No need to call the API for skip if user is not connected
        if (!user.exchangeConnected) {
          return;
        }
      }
      
      // If not skip and user is not connected, show connect modal
      if ((action === "accept" || action === "accept-partial") && !user.exchangeConnected) {
        setShowConnectModal(true);
        return;
      }
      
      // For SELL signals, verify user has the token
      if (signal.type === "SELL" && (action === "accept" || action === "accept-partial") && 
          (!userHoldings[signal.token] || userHoldings[signal.token] <= 0)) {
        toast.error(`You don't own any ${signal.token} to sell`);
        return;
      }
      
      // Set loading state for this specific signal
      setActionLoading(prev => ({ ...prev, [signalId]: action }));
      
      // Log the signal action attempt
      logger.info(`Attempting signal action: ${action} for ${signal.type} ${signal.token} (ID: ${signalId})`, {
        context: "Dashboard",
        userId: user.id
      });
      
      // For actions other than skip, call our signal service to handle the action
      if (action !== "skip" || user.exchangeConnected) {
        // Call our signal service to handle the action
        await signalService.executeSignalAction(signalId, action, percentage);
      }
      
      // Handle success
      if (action === "accept" || action === "accept-partial") {
        // Update position accumulation for BUY signals
        if (signal.type === "BUY") {
          // Increment by 10% for each buy
          const newAccumulation = { 
            ...positionAccumulation,
            [signal.token]: (positionAccumulation[signal.token] || 0) + 10
          };
          setPositionAccumulation(newAccumulation);
          localStorage.setItem('positionAccumulation', JSON.stringify(newAccumulation));
          
          toast.success(`Successfully bought ${signal.token}`, {
            description: `Position accumulation: ${newAccumulation[signal.token]}%`
          });
          
          // Switch to activity log tab to show the result
          setTimeout(() => {
            setActiveTab("activity");
          }, 1500);
        } else if (action === "accept") {
          // For full SELL, remove from position accumulation
          const newAccumulation = { ...positionAccumulation };
          delete newAccumulation[signal.token];
          setPositionAccumulation(newAccumulation);
          localStorage.setItem('positionAccumulation', JSON.stringify(newAccumulation));
          
          toast.success(`Successfully sold ${signal.token}`);
          
          // Switch to activity log tab to show the result
          setTimeout(() => {
            setActiveTab("activity");
          }, 1500);
        } else if (action === "accept-partial" && percentage) {
          // For partial SELL, reduce the accumulated percentage
          const currentAccumulation = positionAccumulation[signal.token] || 0;
          if (currentAccumulation > 0) {
            const newPercentage = Math.max(0, currentAccumulation - (currentAccumulation * (percentage / 100)));
            const newAccumulation = { ...positionAccumulation, [signal.token]: newPercentage };
            setPositionAccumulation(newAccumulation);
            localStorage.setItem('positionAccumulation', JSON.stringify(newAccumulation));
            
            toast.success(`Successfully sold ${percentage}% of ${signal.token}`);
            
            // Switch to activity log tab to show the result
            setTimeout(() => {
              setActiveTab("activity");
            }, 1500);
          }
        }
        
        // Refresh holdings
        fetchUserHoldings();
      } else if (action === "skip") {
        toast.info(`Skipped ${signal.type} signal for ${signal.token}`);
      }
      
      // Mark signal as processed in the UI
      setSignals(prev => 
        prev.map(s => 
          s.id === signalId 
            ? { ...s, processed: true, action } 
            : s
        )
      );
      
      // Try to trigger haptic feedback for better UX
      try {
        telegramService.triggerHapticFeedback(action === "skip" ? "selection" : "notification");
      } catch (e) {
        // Ignore errors with haptics
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to process action";
      toast.error(`Action failed: ${errorMessage}`);
      logger.error(`Signal action error: ${errorMessage}`);
      
      // Switch to activity log tab to show the error details
      setTimeout(() => {
        setActiveTab("activity");
      }, 1500);
    } finally {
      // Clear loading state
      setActionLoading(prev => {
        const newState = { ...prev };
        delete newState[signalId];
        return newState;
      });
    }
  }

  // Handle successful exchange connection
  const handleExchangeConnected = () => {
    // Refresh user data
    if (onExchangeStatusChange) {
      onExchangeStatusChange();
    }
    
    // Fetch holdings after connection
    fetchUserHoldings();
    
    // Close the modal
    setShowConnectModal(false);
  }

  if (isLoading && signals.length === 0) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Bot Trading Dashboard</h2>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="icon" 
              disabled={true}
            >
              <Loader2 className="h-5 w-5 animate-spin" />
            </Button>
            
            {/* Settings button - now switches to settings tab */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={handleSettingsClick}
            >
              <Settings className="h-5 w-5" />
            </Button>
          </div>
        </div>
        
        <div className="flex justify-center items-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading signals...</span>
        </div>
      </div>
    )
  }
  
  if (!user.exchangeConnected) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h2 className="text-xl font-bold mb-4">Trading Dashboard</h2>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">Connect your exchange to start trading</p>
            <Button 
              onClick={() => onSwitchToSettings && onSwitchToSettings()}
              className="w-full sm:w-auto"
            >
              Connect Exchange
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Bot Trading Dashboard</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          
          {/* Settings button - now switches to settings tab */}
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleSettingsClick}
          >
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
      
      {/* Tabs for Signals and Log */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="mt-2">
        <TabsList className="grid grid-cols-2 mb-4">
          <TabsTrigger value="signals" className="flex items-center gap-1">
            <Bell className="h-4 w-4" />
            <span>Signals</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="flex items-center gap-1">
            <History className="h-4 w-4" />
            <span>Activity Log</span>
          </TabsTrigger>
        </TabsList>
          
        <TabsContent value="signals">
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
                const isProcessed = !!(signal as any).processed;
                const isOldSignal = !!(signal as any).isOldSignal;
                const userOwnsToken = !!userHoldings[signal.token] && userHoldings[signal.token] > 0;
                const showBuyButton = signal.type === "BUY" || (signal.type === "SELL" && userOwnsToken);
                const accumulatedPercentage = positionAccumulation[signal.token] || 0;
                
                // Skip signals that don't match our criteria
                if (signal.type === "SELL" && !userOwnsToken) {
                  return null;
                }
                
                return (
                  <SignalCard 
                    key={signal.id} 
                    signal={signal} 
                    onAction={handleSignalAction} 
                    exchangeConnected={user.exchangeConnected}
                    userOwnsToken={userOwnsToken}
                    accumulatedPercentage={accumulatedPercentage}
                    isOldSignal={isOldSignal} // Pass the flag to indicate if this is an old signal
                  />
                );
              })}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="activity">
          <ActivityLogTable userId={user.id} />
        </TabsContent>
      </Tabs>
      
      {/* Connect Exchange Modal */}
      <ConnectExchangeModal 
        open={showConnectModal} 
        onOpenChange={setShowConnectModal}
        userId={Number(user.id)}
        onSuccess={handleExchangeConnected}
      />
    </div>
  )
}