
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, ArrowUp, ArrowDown, Clock, AlertTriangle, ExternalLink, Check, X, Info, AlertCircle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { telegramService } from "@/lib/telegram-service"
import { toast } from "sonner"
import { logger } from "@/lib/logger"
import { useState, useEffect, useRef } from "react"

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
  processed?: boolean
  action?: string
  canExecute?: boolean
}

interface SignalCardProps {
  signal: Signal
  onAction: (action: "accept" | "skip" | "accept-partial", signalId: string, percentage?: number) => void
  exchangeConnected: boolean
  userOwnsToken?: boolean
  accumulatedPercentage?: number
}

export function SignalCard({ 
  signal, 
  onAction, 
  exchangeConnected, 
  userOwnsToken = false,
  accumulatedPercentage = 0
}: SignalCardProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [showDetails, setShowDetails] = useState<boolean>(false)
  const [actionType, setActionType] = useState<"full" | "partial" | "skip" | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [signalTimestamp, setSignalTimestamp] = useState<Date | null>(null)
  
  // Calculate timer based on how much time is left until signal expires for execution
  useEffect(() => {
    try {
      const createdAt = new Date(signal.createdAt)
      const now = new Date()
      
      setSignalTimestamp(createdAt)
      
      // Calculate remaining time until 10-minute execution window expires
      const tenMinutesMS = 10 * 60 * 1000
      const elapsedTime = now.getTime() - createdAt.getTime()
      const remainingTime = Math.max(0, tenMinutesMS - elapsedTime)
      
      // Convert to seconds
      const secondsLeft = Math.floor(remainingTime / 1000)
      setTimeLeft(secondsLeft)
      
      // Only set up timer if there's time left
      if (secondsLeft > 0) {
        timerRef.current = setInterval(() => {
          setTimeLeft((prevTime) => {
            if (prevTime <= 1) {
              if (timerRef.current) {
                clearInterval(timerRef.current)
                timerRef.current = null
              }
              return 0
            }
            return prevTime - 1
          })
        }, 1000)
      }
    } catch (e) {
      logger.error(`Error setting up timer: ${e instanceof Error ? e.message : "Unknown error"}`)
      setTimeLeft(0)
    }
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [signal.id, signal.createdAt])

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const handleAction = async (action: "accept" | "skip" | "accept-partial", percentage?: number): Promise<void> => {
    if (timeLeft <= 0 && action !== "skip") {
      toast.error("This signal has expired and can no longer be executed")
      return
    }
    
    if (!signal.id) {
      logger.error("Cannot process action: Signal ID is missing")
      setError("Invalid signal data. Cannot process action.")
      return
    }

    setIsLoading(true)
    setError(null)
    setActionType(action === "accept" ? "full" : action === "accept-partial" ? "partial" : "skip")
    
    try {
      await onAction(action, signal.id, percentage)
      
      try {
        telegramService.triggerHapticFeedback(action === "skip" ? "selection" : "notification")
      } catch (e) {
        // Ignore haptic errors
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to process action"
      setError(errorMessage)
      logger.error(`Error processing signal action: ${errorMessage}`)
    } finally {
      setIsLoading(false)
      setActionType(null)
    }
  }

  const getRiskColor = (risk: string): string => {
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

  const progressPercentage = Math.min(100, Math.max(0, (timeLeft / 600) * 100))
  const isTimeRunningOut = timeLeft < 60 && timeLeft > 0

  const getTimeSinceReceived = (): string => {
    if (!signalTimestamp) return "Unknown time"
    
    try {
      const now = new Date()
      const diffMs = now.getTime() - signalTimestamp.getTime()
      const diffMins = Math.floor(diffMs / 60000)
      
      if (diffMins < 1) {
        return "Just now"
      } else if (diffMins === 1) {
        return "1m ago"
      } else if (diffMins < 60) {
        return `${diffMins}m ago`
      } else {
        const hours = Math.floor(diffMins / 60)
        if (hours < 24) {
          return `${hours}h ago`
        } else {
          return `${Math.floor(hours / 24)}d ago`
        }
      }
    } catch (e) {
      return "Unknown time"
    }
  }

  const canExecute = signal.canExecute !== false && timeLeft > 0;

  return (
    <Card className={`${signal.type === "BUY" ? "border-green-500" : "border-red-500"} relative mb-6`}>
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
          <div className="flex items-center space-x-2">
            <Badge className={getRiskColor(signal.riskLevel)}>{signal.riskLevel.toUpperCase()} RISK</Badge>
            {signal.processed && (
              <Badge variant="outline" className="bg-gray-100">Processed</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Price</p>
            <p className="text-xl font-bold">{formatCurrency(signal.price)}</p>
          </div>
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">Received</p>
            <p className="text-xl font-bold flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              {getTimeSinceReceived()}
            </p>
          </div>
        </div>

        {!canExecute && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-md border border-gray-200 dark:border-gray-800">
            <div className="flex items-start">
              <AlertCircle className="h-5 w-5 text-gray-600 dark:text-gray-400 mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  Signal has expired
                </p>
                <p className="text-xs mt-1 text-gray-700 dark:text-gray-400">
                  This signal is older than 10 minutes and can no longer be executed.
                </p>
              </div>
            </div>
          </div>
        )}

        {canExecute && exchangeConnected && (
          <div className="mt-4 relative">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium">Execute within {formatTime(timeLeft)}</span>
              <span className="font-medium">
                {signal.type === "BUY" ? "10% position" : "Full sell"}
              </span>
            </div>
            <Progress value={progressPercentage} className={`h-2 ${isTimeRunningOut ? "bg-red-200" : ""}`} />
            
            {isTimeRunningOut && (
              <div className="mt-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3 w-3 inline mr-1" />
                Signal expires soon - execute now!
              </div>
            )}
          </div>
        )}

        {showDetails && (signal.positives?.length || signal.warnings?.length) && (
          <div className="mt-4 space-y-2 text-sm">
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
          </div>
        )}

        {((signal.positives?.length || signal.warnings?.length) || signal.link) && (
          <div className="mt-4 flex items-center gap-2">
            {(signal.positives?.length || signal.warnings?.length) ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowDetails(!showDetails)}
              >
                {showDetails ? "Hide" : "Show"} details
              </Button>
            ) : null}
            
            {signal.link && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => window.open(signal.link, "_blank")}
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                Chart
              </Button>
            )}
          </div>
        )}

        {error && (
          <div className="mt-2 text-sm text-destructive flex items-center">
            <AlertTriangle className="h-4 w-4 mr-1" />
            {error}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        {signal.type === "BUY" ? (
          <>
            <Button
              variant={exchangeConnected ? "default" : "default"}
              className={`w-full mr-2 ${!exchangeConnected ? "bg-blue-600 hover:bg-blue-700" : ""}`}
              onClick={() => handleAction("accept")}
              disabled={isLoading || !canExecute}
            >
              {isLoading && actionType === "full" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {exchangeConnected ? "Buy 10%" : "Connect Exchange"}
            </Button>
            <Button 
              variant="outline" 
              className="w-full"
              onClick={() => handleAction("skip")} 
              disabled={isLoading}
            >
              {isLoading && actionType === "skip" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Skip
            </Button>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-2 w-full">
            <Button
              variant="default"
              onClick={() => handleAction("accept")}
              disabled={isLoading || !canExecute || !userOwnsToken}
            >
              {isLoading && actionType === "full" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sell All
            </Button>
            
            <Button
              variant="outline"
              onClick={() => handleAction("accept-partial", 50)}
              disabled={isLoading || !canExecute || !userOwnsToken}
            >
              {isLoading && actionType === "partial" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Sell 50%
            </Button>
            
            <Button 
              variant="outline"
              onClick={() => handleAction("skip")} 
              disabled={isLoading}
            >
              {isLoading && actionType === "skip" && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Skip
            </Button>
          </div>
        )}
      </CardFooter>
    </Card>
  )
}