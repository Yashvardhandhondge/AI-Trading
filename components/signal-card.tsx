"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Loader2, ArrowUp, ArrowDown, Clock, AlertTriangle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface Signal {
  id: string
  type: "BUY" | "SELL"
  token: string
  price: number
  riskLevel: "low" | "medium" | "high"
  createdAt: string
  expiresAt: string
}

interface SignalCardProps {
  signal: Signal
  onAction: (action: "accept" | "skip", signalId: string) => void
}

export function SignalCard({ signal, onAction }: SignalCardProps) {
  const [timeLeft, setTimeLeft] = useState<number>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <Card className={signal.type === "BUY" ? "border-green-500" : "border-red-500"}>
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

        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span>Auto-execution in {formatTime(timeLeft)}</span>
            <span>{signal.type === "BUY" ? "Buy 10%" : "Sell Fully"}</span>
          </div>
          <Progress value={progressPercentage} className="h-2" />
        </div>

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
              variant="default"
              className="flex-1 mr-2"
              onClick={() => handleAction("accept")}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Buy 10%
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => handleAction("skip")} disabled={isLoading}>
              Skip
            </Button>
          </>
        ) : (
          <>
            <Button
              variant="default"
              className="flex-1 mr-2"
              onClick={() => handleAction("accept")}
              disabled={isLoading}
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Sell Fully
            </Button>
            <Button variant="outline" className="flex-1" onClick={() => handleAction("skip")} disabled={isLoading}>
              Don't Sell
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
