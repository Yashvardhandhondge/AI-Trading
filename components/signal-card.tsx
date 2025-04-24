"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, ArrowUp, ArrowDown, Clock, AlertTriangle, ExternalLink, Check, X, Info, Link2 } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip" 

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

interface SignalCardProps {
  signal: Signal
  onAction: (action: "accept" | "skip", signalId: string) => void
  exchangeConnected: boolean
  userOwnsToken?: boolean
}

export function SignalCard({ signal, onAction, exchangeConnected, userOwnsToken = false }: SignalCardProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  // If it's a SELL signal, but we don't explicitly know if the user owns the token,
  // we'll assume they do (since SELL signals should only be shown for tokens the user owns)
  const canExecuteSell = signal.type === "SELL" ? (userOwnsToken || true) : false

  useEffect(() => {
    // Calculate time left
    const calculateTimeLeft = () => {
      const expiresAt = new Date(signal.expiresAt).getTime()
      const now = new Date().getTime()
      const difference = expiresAt - now

      setTimeLeft(Math.max(0, Math.floor(difference / 1000)))
    }

    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(timer)
  }, [signal])

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  const handleAction = async (action: "accept" | "skip") => {
    setIsLoading(true)
    setError(null)

    try {
      await onAction(action, signal.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process action")
    } finally {
      setIsLoading(false)
    }
  }

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case "low":
        return "bg-green-500"
      case "medium":
        return "bg-yellow-500"
      case "high":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  // Calculate progress percentage for timer
  const totalTime = 10 * 60 // 10 minutes in seconds
  const progressPercentage = (timeLeft / totalTime) * 100

  const handleOpenLink = () => {
    if (signal.link) {
      window.open(signal.link, "_blank")
    }
  }

  return (
    <Card className={`${signal.type === "BUY" ? "border-green-500" : "border-red-500"} relative mb-6`}>
      {/* Connection Status Badge - Only shown for BUY signals when no exchange is connected */}
      {signal.type === "BUY" && !exchangeConnected && (
        <div className="absolute -top-3 right-4 z-10">
          <Badge variant="destructive" className="flex gap-1 text-xs py-1 px-2 shadow-md">
            <Link2 className="h-3.5 w-3.5" />
            Exchange connection required
          </Badge>
        </div>
      )}
      
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="flex items-center">
            {signal.type === "BUY" ? (
              <ArrowUp className="h-5 w-5 mr-2 text-green-500" />
            ) : (
              <ArrowDown className="h-5 w-5 mr-2 text-red-500" />
            )}
            {signal.type} {signal.token}
          </CardTitle>
          <Badge className={getRiskColor(signal.riskLevel)}>{signal.riskLevel.toUpperCase()} RISK</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Price</p>
            <p className="text-xl font-bold">{formatCurrency(signal.price)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Time Left</p>
            <p className="text-xl font-bold flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              {formatTime(timeLeft)}
            </p>
          </div>
        </div>

        {/* Ekin API specific data */}
        {((signal.positives ?? []).length > 0 || (signal.warnings ?? []).length > 0) && (
          <div className="mt-4">
            <Button
              variant="ghost"
              className="p-0 h-auto text-sm text-muted-foreground flex items-center"
              onClick={() => setShowDetails(!showDetails)}
            >
              {showDetails ? "Hide" : "Show"} signal details
            </Button>

            {showDetails && (
              <div className="mt-2 space-y-2 text-sm">
                {signal.positives && signal.positives.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">Positives:</p>
                    <ul className="space-y-1">
                      {signal.positives.map((positive, index) => (
                        <li key={index} className="flex items-start">
                          <Check className="h-4 w-4 mr-1 text-green-500 mt-0.5" />
                          <span>{positive}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {signal.warnings && signal.warnings.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium">Warnings:</p>
                    <ul className="space-y-1">
                      {signal.warnings.map((warning, index) => (
                        <li key={index} className="flex items-start">
                          <X className="h-4 w-4 mr-1 text-red-500 mt-0.5" />
                          <span>{warning}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {signal.link && (
                  <Button variant="outline" size="sm" className="mt-2 text-xs h-8" onClick={handleOpenLink}>
                    <ExternalLink className="h-3 w-3 mr-1" />
                    View Chart
                  </Button>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span>Auto-execution in {formatTime(timeLeft)}</span>
            <span>
              {signal.type === "BUY" 
                ? "Buy 10%" 
                : "Sell Fully"}
            </span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

        {error && (
          <div className="mt-2 text-sm text-destructive flex items-center">
            <AlertTriangle className="h-4 w-4 mr-1" />
            {error}
          </div>
        )}
        
        {/* Connection requirement notice - show for BUY signals when no exchange is connected */}
        {signal.type === "BUY" && !exchangeConnected && (
          <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-950/30 rounded-md border border-amber-200 dark:border-amber-800">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-2 flex-shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-300">
                You need to connect your exchange to execute trades. Your exchange connection is fully encrypted and secure.
              </p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {signal.type === "BUY" ? (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-1 mr-2">
                    <Button
                      variant={exchangeConnected ? "default" : "outline"}
                      className={`w-full ${!exchangeConnected ? "border-blue-500 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 hover:text-blue-700 flex justify-center" : ""}`}
                      onClick={() => handleAction("accept")}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {exchangeConnected ? "Buy 10%" : "Connect Exchange"}
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {exchangeConnected 
                    ? "Purchase 10% of your total portfolio size" 
                    : "Connect your exchange to execute trades"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="outline" className="flex-1" onClick={() => handleAction("skip")} disabled={isLoading}>
              Skip
            </Button>
          </>
        ) : (
          <>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-1 mr-2">
                    <Button
                      variant="default"
                      className="w-full"
                      onClick={() => handleAction("accept")}
                      disabled={isLoading}
                    >
                      {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Sell Fully
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  Sell your entire position of {signal.token}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button variant="outline" className="flex-1" onClick={() => handleAction("skip")} disabled={isLoading}>
              Don't Sell
            </Button>
          </>
        )}
      </CardFooter>
      
      {/* Information banner for SELL signals */}
      {signal.type === "SELL" && (
        <div className="px-6 pb-4 flex items-center text-xs text-muted-foreground">
          <Info className="h-3 w-3 mr-1" />
          <span>SELL signals are only shown for tokens you already own</span>
        </div>
      )}
    </Card>
  )
}