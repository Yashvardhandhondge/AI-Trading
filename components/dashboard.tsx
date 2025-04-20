"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"
import type { Socket } from "socket.io-client"
import type { SessionUser } from "@/lib/auth"
import { formatCurrency } from "@/lib/utils"
import { SignalCard } from "@/components/signal-card"
import { CycleCard } from "@/components/cycle-card"

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

export function Dashboard({ user, socket }: DashboardProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [activeSignal, setActiveSignal] = useState<Signal | null>(null)
  const [activeCycles, setActiveCycles] = useState<Cycle[]>([])
  const [portfolioValue, setPortfolioValue] = useState(0)
  const [pnl, setPnl] = useState({ realized: 0, unrealized: 0 })

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        // Fetch active signal
        const signalResponse = await fetch("/api/signals/active")
        if (signalResponse.ok) {
          const signalData = await signalResponse.json()
          setActiveSignal(signalData.signal || null)
        }

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
      } catch (error) {
        console.error("Error fetching dashboard data:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDashboardData()

    // Listen for socket events
    if (socket && process.env.NODE_ENV !== "development") {
      socket.on("new-signal", (signal: Signal) => {
        setActiveSignal(signal)
      })
  
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
      })
    }
  
    return () => {
      if (socket) {
        socket.off("new-signal")
        socket.off("cycle-update")
        socket.off("portfolio-update")
      }
    }
  }, [socket])

  const handleSignalAction = async (action: "accept" | "skip", signalId: string) => {
    try {
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
      console.error("Error handling signal action:", error)
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

  return (
    <div className="container mx-auto p-4 pb-20">
      <h1 className="text-2xl font-bold mb-4">Dashboard</h1>

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
      {activeSignal ? (
        <SignalCard signal={activeSignal} onAction={handleSignalAction} />
      ) : (
        <Card className="mb-6">
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No active signals at the moment</p>
          </CardContent>
        </Card>
      )}

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
    </div>
  )
}
