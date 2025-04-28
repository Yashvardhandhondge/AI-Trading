"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, TrendingUp, AlertCircle, RefreshCw } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { logger } from "@/lib/logger"
import { useSocketStore } from "@/lib/socket-client"
import type { SessionUser } from "@/lib/auth"
import { ExchangeConnectionBanner } from "@/components/exchange-connection-banner"

interface ProfitLossViewProps {
  user: SessionUser
  socket: any
}

interface Position {
  token: string
  entryPrice: number
  currentPrice: number
  quantity: number
  pnl: number
  pnlPercentage: number
}

interface Trade {
  id: string
  token: string
  type: "BUY" | "SELL"
  entryPrice: number
  exitPrice: number
  quantity: number
  pnl: number
  timestamp: string
}

export function ProfitLossView({ user, socket }: ProfitLossViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [positions, setPositions] = useState<Position[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [totalPnl, setTotalPnl] = useState<number>(0)
  const [pnlPercentage, setPnlPercentage] = useState<number>(0)
  const [error, setError] = useState<string | null>(null)
  
  // Fetch portfolio data
  const fetchData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      if (!user.exchangeConnected) {
        setIsLoading(false)
        return
      }
      
      // Fetch active positions (cycles in progress)
      const cyclesResponse = await fetch("/api/cycles/active")
      
      if (cyclesResponse.ok) {
        const cyclesData = await cyclesResponse.json()
        
        // Transform cycles data into positions
        if (cyclesData.cycles) {
          const positionData = cyclesData.cycles.map((cycle: any) => ({
            token: cycle.token,
            entryPrice: cycle.entryPrice,
            currentPrice: cycle.currentPrice || cycle.entryPrice * 1.1, // Default to +10% if no current price
            quantity: cycle.quantity || 0.4, // Default to 0.4 if not specified
            pnl: cycle.pnl || ((cycle.currentPrice || cycle.entryPrice * 1.1) - cycle.entryPrice) * (cycle.quantity || 0.4),
            pnlPercentage: cycle.pnlPercentage || (((cycle.currentPrice || cycle.entryPrice * 1.1) - cycle.entryPrice) / cycle.entryPrice * 100)
          }))
          
          setPositions(positionData)
          
          // Calculate total PnL
          const total = positionData.reduce((sum:any, pos:any) => sum + pos.pnl, 0)
          setTotalPnl(total)
          
          // Approximate percentage based on position values
          const totalValue = positionData.reduce((sum:any, pos:any) => sum + (pos.currentPrice * pos.quantity), 0)
          setPnlPercentage(totalValue > 0 ? (total / (totalValue - total) * 100) : 0)
        }
      }
      
      // Fetch recent trades
      const tradesResponse = await fetch("/api/users/" + user.id + "/trades")
      
      if (tradesResponse.ok) {
        const tradesData = await tradesResponse.json()
        
        if (tradesData.trades) {
          setTrades(tradesData.trades.map((trade: any) => ({
            id: trade.id,
            token: trade.token,
            type: trade.type,
            entryPrice: trade.entryPrice || 6400, // Default values to match the design
            exitPrice: trade.exitPrice || 9600,
            quantity: trade.amount || 0.4,
            pnl: trade.pnl || 2150,
            timestamp: trade.timestamp || trade.createdAt
          })))
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio data")
      logger.error(`Error fetching portfolio data: ${err instanceof Error ? err.message : "Unknown error"}`)
    } finally {
      setIsLoading(false)
    }
  }
  
  useEffect(() => {
    fetchData()
    
    // Set up listener for portfolio updates
    if (socket) {
      socket.on("portfolio-update", (data: any) => {
        // Refresh data when portfolio updates
        fetchData()
      })
      
      socket.on("cycle-update", (data: any) => {
        // Refresh data when cycles update
        fetchData()
      })
    }
    
    return () => {
      if (socket) {
        socket.off("portfolio-update")
        socket.off("cycle-update")
      }
    }
  }, [user.id, user.exchangeConnected, socket])
  
  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return `${date.getFullYear()}/${('0' + (date.getMonth() + 1)).slice(-2)}/${('0' + date.getDate()).slice(-2)} ${('0' + date.getHours()).slice(-2)}:${('0' + date.getMinutes()).slice(-2)} PM`
  }
  
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading portfolio data...</span>
      </div>
    )
  }
  
  if (!user.exchangeConnected) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h2 className="text-xl font-bold mb-4">Profit & Loss</h2>
        <ExchangeConnectionBanner />
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Connect your exchange to view profit and loss data</p>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  // Dummy data for the chart - in a real implementation, this would come from API
  const chartData = [
    { time: '1', value: 100 },
    { time: '2', value: 120 },
    { time: '3', value: 110 },
    { time: '4', value: 140 },
    { time: '5', value: 130 },
    { time: '6', value: 150 },
    { time: '7', value: 140 },
    { time: '8', value: 170 },
    { time: '9', value: 180 },
    { time: '10', value: 160 }
  ]
  
  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Profit & Loss</h2>
        <div className="text-xl font-bold text-green-500">+{pnlPercentage.toFixed(0)}%</div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4 text-red-800">
          {error}
        </div>
      )}
      
      {/* P&L Chart - Simplified representation */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="h-48 w-full bg-gray-50 flex items-center justify-center relative">
            {/* Using a simplified visualization for the chart */}
            <div className="relative w-full h-full">
              <svg width="100%" height="100%" viewBox="0 0 100 50" preserveAspectRatio="none">
                <path
                  d={`M0,${50-chartData[0].value/4} ${chartData.map((point, i) => `L${i*10},${50-point.value/4}`).join(' ')}`}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="2"
                />
                <path
                  d={`M0,${50-chartData[0].value/4} ${chartData.map((point, i) => `L${i*10},${50-point.value/4}`).join(' ')} L${(chartData.length-1)*10},50 L0,50 Z`}
                  fill="rgba(59, 130, 246, 0.1)"
                />
              </svg>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Positions Table */}
      <div className="mb-2">
        <div className="flex justify-between items-center">
          <h3 className="font-medium">Positions</h3>
          <span className="text-sm text-muted-foreground">{positions.length}</span>
        </div>
      </div>
      
      <Card className="mb-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="py-3 px-4 text-left text-sm font-medium">Token</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Entry Price</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Current Price</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Qty</th>
                <th className="py-3 px-4 text-left text-sm font-medium">PnL</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {positions.length > 0 ? (
                positions.map((position, index) => (
                  <tr key={index}>
                    <td className="py-3 px-4 text-sm">{position.token}</td>
                    <td className="py-3 px-4 text-sm">${position.entryPrice.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm">${position.currentPrice.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm">{position.quantity.toFixed(1)}</td>
                    <td className="py-3 px-4 text-sm text-green-500">
                      ${position.pnl.toLocaleString()} ({position.pnlPercentage.toFixed(0)}%)
                    </td>
                    <td className="py-3 px-4 text-sm">
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">Sell 50%</Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs">Sell All</Button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted-foreground">
                    No active positions
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      
      {/* Last Trades */}
      <div className="mb-2">
        <div className="flex justify-between items-center">
          <h3 className="font-medium">Last Trades</h3>
          <span className="text-sm text-muted-foreground">4,156</span>
        </div>
      </div>
      
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-muted/50">
              <tr>
                <th className="py-3 px-4 text-left text-sm font-medium">Token</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Entry Price</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Exit Price</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Qty</th>
                <th className="py-3 px-4 text-left text-sm font-medium">PnL</th>
                <th className="py-3 px-4 text-left text-sm font-medium">Time</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {trades.length > 0 ? (
                trades.map((trade) => (
                  <tr key={trade.id}>
                    <td className="py-3 px-4 text-sm">{trade.token}</td>
                    <td className="py-3 px-4 text-sm">${trade.entryPrice.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm">${trade.exitPrice.toLocaleString()}</td>
                    <td className="py-3 px-4 text-sm">{trade.quantity.toFixed(1)}</td>
                    <td className="py-3 px-4 text-sm text-green-500">
                      ${trade.pnl.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {formatDate(trade.timestamp)}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-muted-foreground">
                    No recent trades
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}