"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import type { Socket } from "socket.io-client"
import type { SessionUser } from "@/lib/auth"
import { formatCurrency } from "@/lib/utils"
import { SignalCard } from "@/components/signal-card"
import { CycleCard } from "@/components/cycle-card"
import { MarketOverview } from "@/components/market-overview"
import { ConnectExchangeModal } from "@/components/connect-exchange-modal"
import { ExchangeConnectionBanner } from "@/components/exchange-connection-banner"
import { logger } from "@/lib/logger"

interface DashboardProps {
  user: SessionUser
  socket: Socket | null
}

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

interface Cycle {
  id: string
  token: string
  state: "entry" | "hold" | "exit" | "completed"
  entryPrice: number
  exitPrice?: number
  pnl?: number
  pnlPercentage?: number
  createdAt: string
  updatedAt: string
}

interface UserHolding {
  token: string
  amount: number
}

export function Dashboard({ user, socket }: DashboardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [activeSignal, setActiveSignal] = useState<Signal | null>(null)
  const [activeCycles, setActiveCycles] = useState<Cycle[]>([])
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [pnl, setPnl] = useState({ realized: 0, unrealized: 0 })
  const [showConnectExchangeModal, setShowConnectExchangeModal] = useState(false)
  const [userHoldings, setUserHoldings] = useState<UserHolding[]>([])

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch active signal (always fetch signals regardless of exchange connection)
        const signalResponse = await fetch("/api/signals/active")
        if (signalResponse.ok) {
          const signalData = await signalResponse.json()
          setActiveSignal(signalData.signal || null)
          
          if (signalData.signal) {
            logger.info(`Received signal: ${signalData.signal.type} for ${signalData.signal.token}`, {
              context: "Dashboard",
              userId: user.id
            })
          }
        }

        // Only fetch cycles and portfolio if exchange is connected
        if (user.exchangeConnected) {
          // Fetch active cycles
          const cyclesResponse = await fetch("/api/cycles/active")
          if (cyclesResponse.ok) {
            const cyclesData = await cyclesResponse.json()
            setActiveCycles(cyclesData.cycles || [])
          }

          // Fetch portfolio summary
          const portfolioResponse = await fetch("/api/portfolio/summary")
          if (portfolioResponse.ok) {
            const portfolioData = await portfolioResponse.json()
            setPortfolioValue(portfolioData.totalValue || 0)
            setPnl({
              realized: portfolioData.realizedPnl || 0,
              unrealized: portfolioData.unrealizedPnl || 0,
            })
          }
          
          // Fetch user holdings for SELL signal filtering
          const portfolioFullResponse = await fetch("/api/portfolio")
          if (portfolioFullResponse.ok) {
            const portfolioFullData = await portfolioFullResponse.json()
            if (portfolioFullData.holdings) {
              const holdings = portfolioFullData.holdings.filter((h: UserHolding) => h.amount > 0)
              setUserHoldings(holdings)
              
              logger.info(`User has ${holdings.length} token holdings`, {
                context: "Dashboard",
                userId: user.id,
                data: { tokens: holdings.map((h: UserHolding) => h.token).join(', ') }
              })
            }
          }
        }
      } catch (error) {
        logger.error("Error fetching dashboard data:", error instanceof Error ? error : new Error(String(error)), {
          context: "Dashboard",
          userId: user.id
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()

    // Listen for socket events
    if (socket) {
      socket.on("new-signal", (signal: Signal) => {
        logger.info(`Received real-time signal: ${signal.type} for ${signal.token}`, {
          context: "Dashboard",
          userId: user.id
        })
        
        // For SELL signals, verify the user owns the token
        if (signal.type === "SELL") {
          const hasToken = userHoldings.some(h => h.token === signal.token && h.amount > 0)
          if (hasToken) {
            setActiveSignal(signal)
            logger.info(`Accepting SELL signal for ${signal.token} - user owns this token`, {
              context: "Dashboard",
              userId: user.id
            })
          } else {
            logger.info(`Ignoring SELL signal for ${signal.token} - user doesn't own this token`, {
              context: "Dashboard",
              userId: user.id
            })
          }
        } else {
          // Always accept BUY signals
          setActiveSignal(signal)
        }
      })

      if (user.exchangeConnected) {
        socket.on("cycle-update", (cycle: Cycle) => {
          setActiveCycles((prev) => {
            const exists = prev.some((c) => c.id === cycle.id)
            if (exists) {
              return prev.map((c) => (c.id === cycle.id ? cycle : c))
            } else {
              return [...prev, cycle]
            }
          })
        })

        socket.on("portfolio-update", (data: any) => {
          setPortfolioValue(data.totalValue || 0)
          setPnl({
            realized: data.realizedPnl || 0,
            unrealized: data.unrealizedPnl || 0,
          })
          
          // Update holdings when portfolio changes
          if (data.holdings) {
            const holdings = data.holdings.filter((h: UserHolding) => h.amount > 0)
            setUserHoldings(holdings)
          }
        })
      }
    }

    return () => {
      if (socket) {
        socket.off("new-signal")
        socket.off("cycle-update")
        socket.off("portfolio-update")
      }
    }
  }, [socket, user.exchangeConnected, user.id])

  const handleSignalAction = async (action: "accept" | "skip", signalId: string) => {
    try {
      // If user tries to accept a signal but has no exchange connected, redirect to connect exchange
      if (action === "accept" && !user.exchangeConnected) {
        // Show a message that they need to connect an exchange first
        setShowConnectExchangeModal(true)
        return
      }
      
      // For SELL signals, verify the user actually owns the token
      if (activeSignal?.type === "SELL" && action === "accept") {
        const hasToken = userHoldings.some(h => h.token === activeSignal.token && h.amount > 0)
        if (!hasToken) {
          logger.error(`Cannot execute SELL for ${activeSignal.token} - user doesn't own this token`, {
            context: "Dashboard",
            userId: user.id
          })
          return
        }
      }

      logger.info(`Processing ${action} action for ${activeSignal?.type} signal on ${activeSignal?.token}`, {
        context: "Dashboard",
        userId: user.id
      })

      const response = await fetch(`/api/signals/${signalId}/${action}`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error("Failed to process signal action")
      }

      // If skipped, remove the signal
      if (action === "skip") {
        setActiveSignal(null)
      }

      // If accepted, it will be updated via socket
    } catch (error) {
      logger.error("Error handling signal action:", error instanceof Error ? error : new Error(String(error)), {
        context: "Dashboard",
        userId: user.id
      })
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading dashboard...</span>
      </div>
    )
  }

  // For SELL signals, verify the user owns the token before displaying
  const shouldDisplaySignal = () => {
    if (!activeSignal) return false
    
    if (activeSignal.type === "SELL") {
      // Only show SELL signals if the user has connected an exchange AND owns the token
      return user.exchangeConnected && userHoldings.some(h => h.token === activeSignal.token && h.amount > 0)
    }
    
    // Always show BUY signals
    return true
  }

  // Check if user owns the token in the active signal (for SELL signals)
  const userOwnsToken = activeSignal ? 
    userHoldings.some(h => h.token === activeSignal.token && h.amount > 0) : 
    false

  return (
    <div className="container mx-auto p-4 pb-20">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      {/* Exchange Connection Banner - Only show when exchange is not connected */}
      {!user.exchangeConnected && <ExchangeConnectionBanner />}

      {/* Portfolio Summary */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle>Portfolio</CardTitle>
          <CardDescription>Your trading portfolio summary</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-2xl font-bold">{formatCurrency(portfolioValue)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Realized P&L</p>
              <p className={`text-2xl font-bold ${pnl.realized >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatCurrency(pnl.realized)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Unrealized P&L</p>
              <p className={`text-2xl font-bold ${pnl.unrealized >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatCurrency(pnl.unrealized)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Active Signal */}
      <h2 className="text-xl font-semibold mb-3">Active Signal</h2>
      {activeSignal && shouldDisplaySignal() ? (
        <SignalCard 
          signal={activeSignal} 
          onAction={handleSignalAction} 
          exchangeConnected={user.exchangeConnected} 
          userOwnsToken={userOwnsToken}
        />
      ) : (
        <Card className="mb-6">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No active signals at the moment</p>
          </CardContent>
        </Card>
      )}

      {/* Market Overview */}
      <h2 className="text-xl font-semibold mb-3 mt-6">Market Overview</h2>
      <MarketOverview exchange={user.exchange || "binance"} />

      {/* Active Cycles */}
      <h2 className="text-xl font-semibold mb-3 mt-6">Active Cycles</h2>
      {activeCycles.length > 0 ? (
        <div className="space-y-4">
          {activeCycles.map((cycle) => (
            <CycleCard key={cycle.id} cycle={cycle} />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No active trading cycles</p>
          </CardContent>
        </Card>
      )}
      {/* Connect Exchange Modal */}
      <ConnectExchangeModal open={showConnectExchangeModal} onOpenChange={setShowConnectExchangeModal} />
    </div>
  )
};