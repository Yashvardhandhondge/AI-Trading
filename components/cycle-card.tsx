"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { formatCurrency, getTimeAgo } from "@/lib/utils"
import { TrendingUp, TrendingDown, ArrowRight, Info } from "lucide-react"

interface Cycle {
  id: string
  token: string
  state: "entry" | "hold" | "exit" | "completed"
  entryPrice: number
  exitPrice?: number
  pnl?: number
  pnlPercentage?: number
  guidance?: string
  createdAt: string
  updatedAt: string
}

interface CycleCardProps {
  cycle: Cycle
}

export function CycleCard({ cycle }: CycleCardProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const getStateLabel = (state: string) => {
    switch (state) {
      case "entry":
        return "Entry"
      case "hold":
        return "Hold"
      case "exit":
        return "Exit"
      case "completed":
        return "Completed"
      default:
        return state
    }
  }

  const getStateClass = (state: string) => {
    switch (state) {
      case "entry":
        return "cycle-state-entry"
      case "hold":
        return "cycle-state-hold"
      case "exit":
        return "cycle-state-exit"
      default:
        return ""
    }
  }

  const getStateIcon = (state: string) => {
    switch (state) {
      case "entry":
        return <TrendingUp className="h-5 w-5" />
      case "hold":
        return <ArrowRight className="h-5 w-5" />
      case "exit":
        return <TrendingDown className="h-5 w-5" />
      default:
        return null
    }
  }

  const getGuidance = (state: string) => {
    if (cycle.guidance) {
      return cycle.guidance
    }

    switch (state) {
      case "entry":
        return "You've entered a position. Hold until exit signal or target profit."
      case "hold":
        return "Continue holding. Monitor market conditions for exit opportunities."
      case "exit":
        return "Position exited. Analyze performance for future trades."
      case "completed":
        return "Cycle completed. Review performance for insights."
      default:
        return "No guidance available."
    }
  }

  return (
    <>
      <Card className="cursor-pointer hover:bg-muted/50" onClick={() => setIsDialogOpen(true)}>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-center">
            <CardTitle>{cycle.token}</CardTitle>
            <Badge className={getStateClass(cycle.state)}>{getStateLabel(cycle.state)}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Entry Price</p>
              <p className="text-lg font-bold">{formatCurrency(cycle.entryPrice)}</p>
            </div>

            {cycle.exitPrice ? (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Exit Price</p>
                <p className="text-lg font-bold">{formatCurrency(cycle.exitPrice)}</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Started</p>
                <p className="text-lg">{getTimeAgo(new Date(cycle.createdAt))}</p>
              </div>
            )}

            {cycle.pnl !== undefined && cycle.pnlPercentage !== undefined && (
              <>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">P&L</p>
                  <p className={`text-lg font-bold ${cycle.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {formatCurrency(cycle.pnl)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">P&L %</p>
                  <p className={`text-lg font-bold ${cycle.pnlPercentage >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {cycle.pnlPercentage.toFixed(2)}%
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="mt-4 flex items-center text-sm text-muted-foreground">
            <Info className="h-4 w-4 mr-1" />
            <span>Tap for details</span>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center">
              {cycle.token} Cycle - {getStateLabel(cycle.state)}
            </DialogTitle>
            <DialogDescription>Cycle details and guidance</DialogDescription>
          </DialogHeader>

          <div className="flex justify-center py-6">
            <div className="flex items-center space-x-4">
              <div
                className={`p-3 rounded-full ${cycle.state === "entry" ? "bg-blue-500 text-white" : "bg-gray-200 text-gray-500"}`}
              >
                <TrendingUp className="h-6 w-6" />
              </div>
              <div className="h-1 w-10 bg-gray-300"></div>
              <div
                className={`p-3 rounded-full ${cycle.state === "hold" ? "bg-yellow-500 text-black" : "bg-gray-200 text-gray-500"}`}
              >
                <ArrowRight className="h-6 w-6" />
              </div>
              <div className="h-1 w-10 bg-gray-300"></div>
              <div
                className={`p-3 rounded-full ${cycle.state === "exit" || cycle.state === "completed" ? "bg-green-500 text-white" : "bg-gray-200 text-gray-500"}`}
              >
                <TrendingDown className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">Entry Price</p>
                <p className="text-lg font-bold">{formatCurrency(cycle.entryPrice)}</p>
              </div>

              {cycle.exitPrice ? (
                <div>
                  <p className="text-sm text-muted-foreground">Exit Price</p>
                  <p className="text-lg font-bold">{formatCurrency(cycle.exitPrice)}</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">Current Duration</p>
                  <p className="text-lg font-bold">{getTimeAgo(new Date(cycle.createdAt))}</p>
                </div>
              )}
            </div>

            {cycle.pnl !== undefined && cycle.pnlPercentage !== undefined && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">P&L</p>
                  <p className={`text-lg font-bold ${cycle.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {formatCurrency(cycle.pnl)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">P&L %</p>
                  <p className={`text-lg font-bold ${cycle.pnlPercentage >= 0 ? "text-green-500" : "text-red-500"}`}>
                    {cycle.pnlPercentage.toFixed(2)}%
                  </p>
                </div>
              </div>
            )}

            <div className="border-t pt-4 mt-4">
              <p className="text-sm font-medium mb-2">Guidance:</p>
              <p className="text-sm">{getGuidance(cycle.state)}</p>
            </div>
          </div>

          <Button onClick={() => setIsDialogOpen(false)} className="w-full mt-2">
            Close
          </Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
