"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import type { Socket } from "socket.io-client"
import type { SessionUser } from "@/lib/auth"
import { formatCurrency } from "@/lib/utils"
import { CycleCard } from "@/components/cycle-card"
import { MarketOverview } from "@/components/market-overview"
import { ExchangeConnectionBanner } from "@/components/exchange-connection-banner"
import { logger } from "@/lib/logger"
import SignalDashboard from "./signal-dashboard"

interface DashboardProps {
  user: SessionUser
  socket: Socket | null
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
  const [activeCycles, setActiveCycles] = useState<Cycle[]>([])
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [pnl, setPnl] = useState({ realized: 0, unrealized: 0 })
  const [userHoldings, setUserHoldings] = useState<UserHolding[]>([])

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
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
    if (socket && user.exchangeConnected) {
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

    return () => {
      if (socket) {
        socket.off("cycle-update")
        socket.off("portfolio-update")
      }
    }
  }, [socket, user.exchangeConnected, user.id])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading dashboard...</span>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

      {/* Exchange Connection Banner - Only show when exchange is not connected */}
      {!user.exchangeConnected && <ExchangeConnectionBanner />}

      {/* Portfolio Summary - Only show when exchange is connected */}
      {user.exchangeConnected && (
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
      )}

      {/* Active Signal - Show for all users regardless of exchange connection */}
      <h2 className="text-xl font-semibold mb-3">Active Signal</h2>
      <SignalDashboard 
        userId={user.id} 
        isExchangeConnected={user.exchangeConnected} 
        userHoldings={userHoldings}
      />

      {/* Market Overview */}
      <h2 className="text-xl font-semibold mb-3 mt-6">Market Overview</h2>
      <MarketOverview exchange={user.exchange || "binance"} />

      {/* Active Cycles - Only show when exchange is connected */}
      {user.exchangeConnected && (
        <>
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
        </>
      )}
    </div>
  );
}