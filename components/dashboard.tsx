
import { useState, useEffect, useCallback } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { 
  Loader2, 
  Settings, 
  RefreshCw, 
  Clock, 
  AlertCircle, 
  History, 
  Bell,
  Archive
} from "lucide-react"
import { SignalCard } from "@/components/signal-card"
import { ConnectExchangeModal } from "@/components/connect-exchange-modal"
import { ActivityLogTable } from "./activity-log-table"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import type { SessionUser } from "@/lib/auth"
import { telegramService } from "@/lib/telegram-service"

interface Signal {
  id: string;
  type: "BUY" | "SELL";
  token: string;
  price: number;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
  expiresAt: string;
  autoExecuted: boolean;
  link?: string;
  positives?: string[];
  warnings?: string[];
  warning_count?: number;
  processed?: boolean;
  action?: string;
  canExecute?: boolean;
}

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
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [refreshing, setRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState<string>("signals")
  const [signalFilterTab, setSignalFilterTab] = useState<string>("active")
  
  // Fetch signals from database - get all signals from the last 24 hours
  const fetchSignals = useCallback(async (showLoadingState = true) => {
    try {
      if (showLoadingState) {
        setIsLoading(true)
      } else {
        setRefreshing(true)
      }
      
      setError(null)
      
      // Calculate time 24 hours ago
      const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000
      
      // Use _t parameter to prevent caching
      const response = await fetch(`/api/signals/latest?since=${twentyFourHoursAgo}&_t=${Date.now()}`)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch signals: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.signals && Array.isArray(data.signals)) {
        setSignals(data.signals)
        logger.info(`Fetched ${data.signals.length} signals (${data.signals.filter((s: any) => s.canExecute).length} can be executed)`)
      } else {
        setSignals([])
      }
      
      setLastUpdated(new Date())
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load signals"
      setError(errorMessage)
      logger.error(`Error fetching signals: ${errorMessage}`)
    } finally {
      setIsLoading(false)
      setRefreshing(false)
    }
  }, [])
  
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
  
  // Effect to fetch signals and holdings on mount and set up polling
  useEffect(() => {
    fetchSignals()
    fetchUserHoldings()
    
    // Poll for new signals every 30 seconds
    const intervalId = setInterval(() => {
      fetchSignals(false)
    }, 30000)
    
    return () => clearInterval(intervalId)
  }, [fetchSignals])
  
  // Handle signal actions
  const handleSignalAction = async (action: "accept" | "skip" | "accept-partial", signalId: string, percentage?: number) => {
    try {
      const signal = signals.find(s => s.id === signalId)
      
      if (!signal) {
        throw new Error("Signal not found")
      }
      
      // Skip action doesn't require exchange connection
      if (action === "skip") {
        setSignals(prev => 
          prev.map(s => 
            s.id === signalId 
              ? { ...s, processed: true, action: "skip" } 
              : s
          )
        )
        
        toast.info(`Skipped ${signal.type} signal for ${signal.token}`)
        return
      }
      
      // Other actions require exchange connection
      if (!user.exchangeConnected) {
        setShowConnectModal(true)
        return
      }
      
      // Set loading state
      setActionLoading(prev => ({ ...prev, [signalId]: action }))
      
      const response = await fetch(`/api/signals/${signalId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ percentage })
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || `Failed to ${action} signal`)
      }
      
      // Success
      const message = action === "accept-partial" 
        ? `Sold ${percentage}% of ${signal.token}`
        : `${signal.type === "BUY" ? "Bought" : "Sold"} ${signal.token}`
        
      toast.success(message)
      
      setSignals(prev => 
        prev.map(s => 
          s.id === signalId 
            ? { ...s, processed: true, action } 
            : s
        )
      )
      
      // Refresh holdings after trade
      fetchUserHoldings()
      
      // Switch to activity tab
      setTimeout(() => setActiveTab("activity"), 1500)
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to process action"
      toast.error(errorMessage)
      logger.error(`Signal action error: ${errorMessage}`)
    } finally {
      setActionLoading(prev => {
        const newState = { ...prev }
        delete newState[signalId]
        return newState
      })
    }
  }
  
  if (isLoading && signals.length === 0) {
    return (
      <div className="container mx-auto p-4 pb-20">
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
  
  // Filtered signals based on active/history tab
  const filteredSignals = signals.filter(signal => {
    if (signalFilterTab === "active") {
      return signal.canExecute === true;
    } else {
      return signal.canExecute === false;
    }
  });
  
  // Get counts for tabs
  const activeSignalCount = signals.filter(s => s.canExecute === true).length;
  const historySignalCount = signals.filter(s => s.canExecute === false).length;
  
  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Bot Trading Dashboard</h2>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => fetchSignals(false)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onSwitchToSettings}
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
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-2">
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
          <div className="flex items-center justify-between mb-4">
            <div className="text-xs text-muted-foreground">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </div>
            
            <TabsList>
              <TabsTrigger 
                value="active" 
                onClick={() => setSignalFilterTab("active")}
                className={signalFilterTab === "active" ? "bg-primary text-white" : ""}
              >
                Active ({activeSignalCount})
              </TabsTrigger>
              <TabsTrigger 
                value="history" 
                onClick={() => setSignalFilterTab("history")}
                className={signalFilterTab === "history" ? "bg-primary text-white" : ""}
              >
                History ({historySignalCount})
              </TabsTrigger>
            </TabsList>
          </div>
          
          {filteredSignals.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">
                  {signalFilterTab === "active" 
                    ? "No active signals available" 
                    : "No historical signals found"}
                </p>
                <p className="text-sm text-muted-foreground mt-2">
                  {signalFilterTab === "active" 
                    ? "New signals will appear here automatically" 
                    : "Past signals will appear here when they expire"}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filteredSignals.map(signal => {
                const userOwnsToken = !!userHoldings[signal.token] && userHoldings[signal.token] > 0;
                
                // Skip SELL signals for tokens the user doesn't own
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
      
      <ConnectExchangeModal 
        open={showConnectModal} 
        onOpenChange={setShowConnectModal}
        userId={Number(user.id)}
        onSuccess={() => {
          onExchangeStatusChange?.()
          setShowConnectModal(false)
        }}
      />
    </div>
  )
}