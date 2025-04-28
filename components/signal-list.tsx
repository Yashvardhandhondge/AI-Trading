"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Loader2, AlertCircle, Info } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { toast } from "sonner"
import { logger } from "@/lib/logger"

// Define types
interface Signal {
  id: string
  type: "BUY" | "SELL"
  token: string
  price: number
  riskLevel: "low" | "medium" | "high"
  createdAt: string
  expiresAt: string
  status?: "active" | "executed" | "skipped"
  risk?: number
}

interface SignalListProps {
  userId: number
  isExchangeConnected: boolean
}

export function SignalList({ userId, isExchangeConnected }: SignalListProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [signals, setSignals] = useState<Signal[]>([])
  const [error, setError] = useState<string | null>(null)
  const [processingSignalId, setProcessingSignalId] = useState<string | null>(null)

  // Fetch all signals
  const fetchSignals = async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Fetch signals from the API - use mock data for demo
      setTimeout(() => {
        // Mock signals data
        const mockSignals: Signal[] = [
          {
            id: "signal-1",
            type: "BUY",
            token: "SOL",
            price: 142.15,
            riskLevel: "medium",
            risk: 64,
            createdAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
          },
          {
            id: "signal-2",
            type: "BUY",
            token: "SOL",
            price: 142.15,
            riskLevel: "medium",
            risk: 64,
            status: "executed",
            createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
            expiresAt: new Date(Date.now() - 5 * 60 * 1000).toISOString()
          },
          {
            id: "signal-3",
            type: "BUY",
            token: "SOL",
            price: 142.15,
            riskLevel: "medium",
            risk: 64,
            status: "skipped",
            createdAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
            expiresAt: new Date(Date.now() - 15 * 60 * 1000).toISOString()
          },
          {
            id: "signal-4",
            type: "BUY",
            token: "SOL",
            price: 142.15,
            riskLevel: "medium",
            risk: 64,
            status: "executed",
            createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
            expiresAt: new Date(Date.now() - 25 * 60 * 1000).toISOString()
          }
        ];
        
        setSignals(mockSignals);
        setIsLoading(false);
      }, 1000);
      
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch signals")
      logger.error("Error fetching signals:", err instanceof Error ? err : new Error(String(err)), {
        context: "SignalList",
        userId
      })
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSignals()
    
    // Refresh signals every 30 seconds
    const intervalId = setInterval(fetchSignals, 30000)
    
    return () => clearInterval(intervalId)
  }, [userId])

  // Handle signal action (buy or skip)
  const handleSignalAction = async (action: "accept" | "skip", signalId: string) => {
    try {
      // If user tries to accept a signal but has no exchange connected, show warning
      if (action === "accept" && !isExchangeConnected) {
        toast.warning("Exchange not connected", {
          description: "Connect your exchange in settings to execute trades",
          duration: 5000
        })
        return
      }
      
      setProcessingSignalId(signalId)
      
      // Mock API call with timeout
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Update the UI based on the action
      const actionText = action === "accept" ? "executed" : "skipped"
      toast.success(`Signal ${actionText} successfully`)
      
      // Update the signal status in the local state
      setSignals(prevSignals => 
        prevSignals.map(signal => 
          signal.id === signalId 
            ? { ...signal, status: action === "accept" ? "executed" : "skipped" } 
            : signal
        )
      )
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Failed to process action"
      toast.error(errorMessage)
      logger.error(`Error processing signal action: ${errorMessage}`)
    } finally {
      setProcessingSignalId(null)
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-4 h-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <span className="ml-2">Loading signals...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 text-center">
        <AlertCircle className="h-6 w-6 mx-auto mb-2 text-destructive" />
        <p className="text-destructive">{error}</p>
      </div>
    )
  }

  if (signals.length === 0) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p>No signals available at the moment</p>
      </div>
    )
  }

  // Function to format percentage with + sign
  const formatPercentage = (value: number) => {
    return value >= 0 ? `+${value.toFixed(2)}%` : `${value.toFixed(2)}%`;
  }

  // Calculate price change percentage (mock for example)
  const getPriceChange = (signal: Signal) => {
    // In a real app, this would come from the signal data
    // For now we'll generate a random value between -2 and +4
    return 1.14;
  }

  const getRiskColor = (risk: number) => {
    if (risk < 33) return "border-green-500 bg-green-50 text-green-700";
    if (risk < 66) return "border-yellow-500 bg-yellow-50 text-yellow-700";
    return "border-red-500 bg-red-50 text-red-700";
  }

  return (
    <div className="h-full overflow-auto pb-16">
      <div className="flex justify-between items-center mb-4 px-4">
        <h2 className="text-lg font-semibold">Bot Trades</h2>
        <Button 
          variant="outline" 
          size="sm"
          onClick={fetchSignals}
          className="text-xs h-7"
        >
          <svg className="h-4 w-4 mr-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.798 0 3.5-.593 4.95-1.565m-4.95 1.565c-1.798 0-3.5-.593-4.95-1.565M12 3a9 9 0 019 9m-9-9c-1.798 0-3.5.593-4.95 1.565M12 3c1.798 0 3.5.593 4.95 1.565" />
          </svg>
          Refresh
        </Button>
      </div>
      
      <div className="space-y-3 px-2">
        {signals.map((signal) => {
          const priceChange = getPriceChange(signal);
          const riskValue = signal.risk || 64;
          
          return (
            <div 
              key={signal.id}
              className={`border rounded-md overflow-hidden ${signal.status === "skipped" ? "opacity-70" : ""}`}
            >
              <div className="flex">
                {/* Left side - Buy badge */}
                <div className={`w-20 flex items-center justify-center ${signal.type === "BUY" ? "bg-green-100" : "bg-red-100"}`}>
                  <span className={`font-semibold ${signal.type === "BUY" ? "text-green-600" : "text-red-600"}`}>
                    {signal.type}
                  </span>
                </div>
                
                {/* Right side - Signal info */}
                <div className="flex-1 p-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center">
                        <span className="font-semibold">${signal.token}</span>
                        <span className={`ml-2 text-xs ${priceChange >= 0 ? "text-green-600" : "text-red-600"}`}>
                          (+{priceChange}%)
                        </span>
                        <span className="text-xs ml-3 text-gray-500">09:42</span>
                      </div>
                      
                      {signal.status && (
                        <div className="flex items-center mt-1">
                          <span className={`text-xs ${signal.status === "executed" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-700"} px-1 py-0.5 rounded`}>
                            {signal.status === "executed" ? "Executed" : "Skipped"}
                          </span>
                          {signal.status === "executed" && (
                            <svg className="h-4 w-4 ml-1 text-blue-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6L9 17l-5-5" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center">
                      <div className="text-right mr-2">
                        <div className="flex items-center justify-end">
                          <span className="text-xs text-muted-foreground mr-1">Risk:</span>
                          <span className="text-xs font-medium px-1 py-0.5 rounded border border-blue-500 bg-blue-50 text-blue-800">
                            {riskValue}/100
                          </span>
                        </div>
                      </div>
                      
                      <button className="text-gray-500 hover:text-gray-700">
                        <span className="text-xs underline">Details</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              
              {!signal.status && (
                <div className="flex border-t">
                  <Button 
                    className="flex-1 rounded-none h-10"
                    disabled={processingSignalId === signal.id || !isExchangeConnected}
                    onClick={() => handleSignalAction("accept", signal.id)}
                  >
                    {processingSignalId === signal.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-1" />
                    ) : null}
                    Buy 10%
                  </Button>
                  <Button 
                    variant="outline" 
                    className="flex-1 rounded-none h-10 border-l"
                    disabled={processingSignalId === signal.id}
                    onClick={() => handleSignalAction("skip", signal.id)}
                  >
                    Skip
                  </Button>
                </div>
              )}
            </div>
          )
        })}
      </div>
      
      {/* Exchange connection notice at the bottom */}
      {!isExchangeConnected && (
        <div className="p-3 mx-2 mt-4 bg-blue-50 border border-blue-200 rounded-md">
          <div className="flex items-start">
            <Info className="h-4 w-4 text-blue-600 mt-0.5 mr-2" />
            <p className="text-xs text-blue-700">
              Connect your exchange in Settings to execute trades automatically
            </p>
          </div>
        </div>
      )}
    </div>
  )
}