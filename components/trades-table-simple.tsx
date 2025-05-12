// components/trades-table-simple.tsx
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Loader2, RefreshCw, AlertCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { logger } from "@/lib/logger"
import { toast } from "sonner"

interface Trade {
  id: string
  type: "BUY" | "SELL"
  token: string
  price: number
  amount: number
  createdAt: string
  status: string
  autoExecuted: boolean
  exchangeTradeId?: string
  metadata?: {
    commission?: number
    commissionAsset?: string
    total?: string
    isMaker?: boolean
  }
}

interface TradesTableProps {
  userId: number | string
}

export function TradesTableSimple({ userId }: TradesTableProps) {
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  
  // Fetch trades (this will auto-sync if needed)
  const fetchTrades = async (forceSync = false) => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Use the new API endpoint
      const url = `/api/trades${forceSync ? '?forceSync=true' : ''}`
      const response = await fetch(url)
      
      if (!response.ok) {
        throw new Error(`Failed to fetch trades: ${response.status}`)
      }
      
      const data = await response.json()
      setTrades(data.trades || [])
      setLastSync(new Date())
      
      logger.info(`Fetched ${data.trades?.length || 0} trades`, {
        context: "TradesTable"
      })
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load trades"
      setError(errorMessage)
      logger.error(`Error fetching trades: ${errorMessage}`)
    } finally {
      setIsLoading(false)
    }
  }
  
  // Manual sync
  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      // Use the new API endpoint
      const response = await fetch('/api/trades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ limit: 100, forceSync: true })
      })
      
      if (!response.ok) {
        throw new Error(`Failed to sync trades: ${response.status}`)
      }
      
      const data = await response.json()
      
      if (data.synced > 0) {
        toast.success(`Synced ${data.synced} new trades from Binance`)
      } else {
        toast.info("No new trades to sync")
      }
      
      // Refresh the trades list
      await fetchTrades(true)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to sync trades"
      toast.error(errorMessage)
      logger.error(`Error syncing trades: ${errorMessage}`)
    } finally {
      setIsSyncing(false)
    }
  }
  
  // Initial load
  useEffect(() => {
    fetchTrades()
  }, [userId])
  
  if (isLoading && trades.length === 0) {
    return (
      <div className="flex justify-center items-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2">Loading trades...</span>
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="p-4 text-red-500">
        <AlertCircle className="h-5 w-5 inline mr-2" />
        {error}
      </div>
    )
  }
  
  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>Recent Trades</CardTitle>
          <div className="flex items-center gap-2">
            {lastSync && (
              <span className="text-xs text-muted-foreground">
                Last updated: {lastSync.toLocaleTimeString()}
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleManualSync}
              disabled={isSyncing}
            >
              {isSyncing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Syncing...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Sync from Binance
                </>
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <p>No trades found</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-4"
              onClick={handleManualSync}
            >
              Sync from Binance
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium">Token</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Type</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Price</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Amount</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Time</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {trades.map((trade) => (
                  <tr key={trade.id}>
                    <td className="py-3 px-4 text-sm">{trade.token}</td>
                    <td className="py-3 px-4 text-sm">
                      <span className={trade.type === "BUY" ? "text-green-500" : "text-red-500"}>
                        {trade.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm">{formatCurrency(trade.price)}</td>
                    <td className="py-3 px-4 text-sm">
                      {trade.amount.toFixed(6)}
                      {trade.metadata?.commission && (
                        <span className="text-xs text-muted-foreground ml-1">
                          (Fee: {trade.metadata.commission} {trade.metadata.commissionAsset})
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {new Date(trade.createdAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {trade.autoExecuted ? "Auto" : trade.exchangeTradeId ? "Binance" : "Signal"}
                      {trade.metadata?.isMaker && (
                        <span className="text-xs bg-blue-100 text-blue-800 ml-1 px-1 rounded">
                          Maker
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}