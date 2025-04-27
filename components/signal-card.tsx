"use client"

import { useState, useEffect } from "react"
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
  // To avoid duplicate notifications
  const [notificationsSent, setNotificationsSent] = useState<Set<number>>(new Set())

  useEffect(() => {
    // Calculate time left
    const calculateTimeLeft = () => {
      const expiresAt = new Date(signal.expiresAt).getTime()
      const now = new Date().getTime()
      const difference = expiresAt - now

      const secondsLeft = Math.max(0, Math.floor(difference / 1000))
      setTimeLeft(secondsLeft)
      
      // Notifications at specific time thresholds
      handleTimeThresholdNotifications(secondsLeft)
    }

    calculateTimeLeft()
    const timer = setInterval(calculateTimeLeft, 1000)

    return () => clearInterval(timer)
  }, [signal])
  
  // Handle notifications at specific time thresholds
  const handleTimeThresholdNotifications = (secondsLeft: number) => {
    // Only show notifications if exchange is connected
    if (!exchangeConnected) return
    
    // Notification thresholds in seconds
    const thresholds = [300, 180, 60, 30];
    
    // Find the closest threshold that matches our current time
    const threshold = thresholds.find(t => secondsLeft <= t + 1 && secondsLeft >= t - 1);
    
    if (threshold && !notificationsSent.has(threshold)) {
      // Mark this threshold as notified
      setNotificationsSent(prev => {
        const updated = new Set(prev);
        updated.add(threshold);
        return updated;
      });
      
      // Format the time for display
      const timeDisplay = threshold >= 60 ? 
        `${Math.floor(threshold / 60)} minute${Math.floor(threshold / 60) !== 1 ? 's' : ''}` : 
        `${threshold} seconds`;
      
      // Show toast notification
      toast.warning(`${signal.type} signal expires in ${timeDisplay}`, {
        description: `Auto-execution will occur if no action is taken`,
        duration: 10000, // 10 seconds
      });
      
      // Try Telegram notification
      try {
        // Trigger haptic feedback
        telegramService.triggerHapticFeedback('notification');
        
        // Show popup for important thresholds (5 min and 1 min)
        if (threshold === 300 || threshold === 60) {
          telegramService.showPopup(
            `⚠️ ${signal.type} signal for ${signal.token} expires in ${timeDisplay}.\n\nAuto-execution will occur if no action is taken.`,
            [{ type: "default", text: "View Signal" }],
            () => {
              // Scroll to the signal card
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          );
        }
      } catch (error) {
        logger.error(`Error sending threshold notification: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Special handling for the very last seconds
    if (secondsLeft <= 5 && secondsLeft > 0) {
      // Trigger haptic feedback for the last 5 seconds
      telegramService.triggerHapticFeedback('impact');
    }
  }

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
      
      // Trigger appropriate haptic feedback
      if (action === "accept") {
        telegramService.triggerHapticFeedback('notification');
      } else {
        telegramService.triggerHapticFeedback('selection');
      }
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
  const isTimeRunningOut = timeLeft < 60 // Less than 1 minute left

  const handleOpenLink = () => {
    if (signal.link) {
      window.open(signal.link, "_blank")
    }
  }

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
            <p className={`text-xl font-bold flex items-center ${isTimeRunningOut ? "text-red-500" : ""}`}>
              <Clock className={`h-4 w-4 mr-1 ${isTimeRunningOut ? "text-red-500 animate-pulse" : ""}`} />
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

        {/* Auto-execution timer - Only show if exchange is connected */}
        {exchangeConnected && (
          <div className="mt-4 relative">
            <div className="flex justify-between text-xs mb-1">
              <span className="font-medium">Auto-execution in {formatTime(timeLeft)}</span>
              <span className="font-medium">
                {signal.type === "BUY" 
                  ? "Will buy 10%" 
                  : "Will sell fully"}
              </span>
            </div>
            <Progress value={progressPercentage} className={`h-2 ${isTimeRunningOut ? "bg-red-200" : ""}`} />
            
            {/* Auto-execution messaging */}
            <div className={`mt-3 p-3 rounded-md ${isTimeRunningOut ? "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800" : "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800"}`}>
              <div className="flex items-start">
                {isTimeRunningOut ? (
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 mr-2 flex-shrink-0 animate-pulse" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-2 flex-shrink-0" />
                )}
                <div>
                  <p className={`text-sm font-medium ${isTimeRunningOut ? "text-red-800 dark:text-red-300" : "text-amber-800 dark:text-amber-300"}`}>
                    {isTimeRunningOut ? "Auto-execution imminent!" : "Auto-execution will occur when timer expires"}
                  </p>
                  <p className={`text-xs mt-1 ${isTimeRunningOut ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
                    {signal.type === "BUY" 
                      ? `If you don't take action, the system will automatically buy ${signal.token} worth 10% of your portfolio.`
                      : `If you don't take action, the system will automatically sell all your ${signal.token} holdings.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Information banner when no exchange is connected */}
        {!exchangeConnected && (
          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-md border border-blue-200 dark:border-blue-800">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
                  Exchange connection required to execute trades
                </p>
                <p className="text-xs mt-1 text-blue-700 dark:text-blue-400">
                  Connect your exchange to execute trades based on this signal. Your API keys will be securely encrypted.
                </p>
              </div>
            </div>
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
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex-1 mr-2">
                    <Button
                      variant={exchangeConnected ? "default" : "default"}
                      className={`w-full ${!exchangeConnected ? "bg-blue-600 hover:bg-blue-700 text-white" : ""}`}
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