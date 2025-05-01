"use client"

import { useState, useEffect, useRef } from "react"
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
  id: string;
  type: "BUY" | "SELL";
  token: string;
  price: number;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
  expiresAt: string;
  link?: string;
  positives?: string[];
  warnings?: string[];
  warning_count?: number;
}

interface SignalCardProps {
  signal: Signal;
  onAction: (action: "accept" | "skip" | "accept-partial", signalId: string, percentage?: number) => void;
  exchangeConnected: boolean;
  userOwnsToken?: boolean;
  accumulatedPercentage?: number;
  isOldSignal?: boolean;
}

export function SignalCard({ 
  signal, 
  onAction, 
  exchangeConnected, 
  userOwnsToken = false,
  accumulatedPercentage = 0,
  isOldSignal = false
}: SignalCardProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState<boolean>(false);
  const [actionType, setActionType] = useState<"full" | "partial" | "skip" | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Calculate the initial time left based on signal creation and expiration time
  useEffect(() => {
    try {
      if (isOldSignal) {
        // For old signals (>10 minutes), show 0 time left
        setTimeLeft(0);
        return;
      }

      // For active signals, calculate the proper time left
      const expiresAt = new Date(signal.expiresAt).getTime();
      const now = new Date().getTime();
      const difference = expiresAt - now;
      const secondsLeft = Math.max(0, Math.floor(difference / 1000));
      setTimeLeft(secondsLeft);
      
      // Clear any existing timer
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      
      // Set up a timer that updates every second
      timerRef.current = setInterval(() => {
        setTimeLeft(prevTime => {
          const newTime = Math.max(0, prevTime - 1);
          // Stop the timer when it reaches 0
          if (newTime === 0 && timerRef.current) {
            clearInterval(timerRef.current);
          }
          return newTime;
        });
      }, 1000);
      
      // Clean up the timer on unmount or when signal changes
      return () => {
        if (timerRef.current) {
          clearInterval(timerRef.current);
        }
      };
    } catch (e) {
      logger.error(`Error calculating time left: ${e instanceof Error ? e.message : "Unknown error"}`);
      setTimeLeft(0);
    }
  }, [signal.expiresAt, signal.id, isOldSignal]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleAction = async (action: "accept" | "skip" | "accept-partial", percentage?: number): Promise<void> => {
    // Ensure signal has a valid ID
    if (!signal.id) {
      logger.error("Cannot process action: Signal ID is missing");
      setError("Invalid signal data. Cannot process action.");
      return;
    }
  
    setIsLoading(true);
    setError(null);
    setActionType(action === "accept" ? "full" : action === "accept-partial" ? "partial" : "skip");
    
    try {
      // If not skip and user is not connected, show connect modal by calling onAction
      if ((action === "accept" || action === "accept-partial") && !exchangeConnected) {
        // Important: we're passing the same action but not displaying the skip toast when it's a connection request
        onAction(action, signal.id, percentage);
        setIsLoading(false);
        setActionType(null);
        return;
      }
      
      // For SELL signals, verify user has the token
      if (signal.type === "SELL" && (action === "accept" || action === "accept-partial") && !userOwnsToken) {
        setError(`You don't own any ${signal.token} to sell`);
        setIsLoading(false);
        setActionType(null);
        return;
      }
      
      // Call the onAction callback provided by parent
      await onAction(action, signal.id, percentage);
      
      // Try to trigger haptic feedback for better UX
      try {
        telegramService.triggerHapticFeedback(action === "skip" ? "selection" : "notification");
      } catch (e) {
        // Ignore errors with haptics
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to process action";
      setError(errorMessage);
      logger.error(`Error processing signal action: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setActionType(null);
    }
  };

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

  // Calculate progress percentage for timer
  const totalTime = 10 * 60 // 10 minutes in seconds
  const progressPercentage = Math.min(100, Math.max(0, (timeLeft / totalTime) * 100))
  const isTimeRunningOut = timeLeft < 60 && timeLeft > 0 // Less than 1 minute left but not expired

  // Format the received time to show when the signal was created
  const getFormattedTime = (): string => {
    try {
      const createdDate = new Date(signal.createdAt);
      return createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return "Unknown time";
    }
  }

  // Calculate how long ago the signal was received
  const getTimeSinceReceived = (): string => {
    try {
      const createdDate = new Date(signal.createdAt);
      const now = new Date();
      const diffMs = now.getTime() - createdDate.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 60) {
        return `${diffMins}m ago`;
      } else if (diffMins < 24 * 60) {
        return `${Math.floor(diffMins / 60)}h ago`;
      } else {
        return `${Math.floor(diffMins / (60 * 24))}d ago`;
      }
    } catch (e) {
      return "Unknown";
    }
  }

  const handleOpenLink = (): void => {
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
            <p className="text-sm text-muted-foreground">Received</p>
            <p className="text-xl font-bold flex items-center">
              <Clock className="h-4 w-4 mr-1" />
              {getTimeSinceReceived()}
            </p>
          </div>
        </div>

        {/* Position accumulation indicator for BUY signals */}
        {signal.type === "BUY" && accumulatedPercentage > 0 && (
          <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 rounded-md">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium text-green-800 dark:text-green-300">Position Built:</span>
              <span className="text-sm font-bold text-green-800 dark:text-green-300">{accumulatedPercentage}%</span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
              <div 
                className="bg-green-500 h-2.5 rounded-full" 
                style={{ width: `${Math.min(accumulatedPercentage, 100)}%` }}
              ></div>
            </div>
            <p className="mt-2 text-xs text-green-700 dark:text-green-400">
              You've bought {accumulatedPercentage}% of your portfolio in {signal.token}. 
              You can click "Buy 10%" multiple times to build a larger position.
            </p>
          </div>
        )}

        {/* Ekin API specific data */}
        {((signal.positives && signal.positives.length > 0) || (signal.warnings && signal.warnings.length > 0)) && (
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

        {/* Auto-execution timer - Only show if exchange is connected and the signal is not old */}
        {exchangeConnected && !isOldSignal && (
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
        
        {/* Show timestamp for old signals instead of countdown */}
        {isOldSignal && (
          <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-md border border-gray-200 dark:border-gray-800">
            <div className="flex items-start">
              <Info className="h-5 w-5 text-gray-600 dark:text-gray-400 mt-0.5 mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-gray-800 dark:text-gray-300">
                  Signal received at {getFormattedTime()}
                </p>
                <p className="text-xs mt-1 text-gray-700 dark:text-gray-400">
                  This signal was received more than 10 minutes ago. Auto-execution timeout has passed.
                </p>
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
                      {isLoading && actionType === "full" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      {exchangeConnected ? "Buy 10%" : "Connect Exchange"}
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {exchangeConnected 
                    ? "Purchase 10% of your total portfolio size. Click multiple times to build a larger position." 
                    : "Connect your exchange to execute trades"}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button 
              variant="outline" 
              className="w-full col-span-2" 
              onClick={() => handleAction("skip")} 
              disabled={isLoading}
            >
              {isLoading && actionType === "skip" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Skip This Signal
            </Button>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2 w-full">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="default"
                    className="w-full"
                    onClick={() => handleAction("accept")}
                    disabled={isLoading}
                  >
                    {isLoading && actionType === "full" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Sell Fully
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Sell your entire position of {signal.token}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 hover:bg-amber-100"
                    onClick={() => handleAction("accept-partial", 50)}
                    disabled={isLoading}
                  >
                    {isLoading && actionType === "partial" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Sell 50%
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  Sell half of your {signal.token} holdings
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <Button 
              variant="outline" 
              className="w-full col-span-2" 
              onClick={() => handleAction("skip")} 
              disabled={isLoading}
            >
              {isLoading && actionType === "skip" ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Skip This Signal
            </Button>
          </div>
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