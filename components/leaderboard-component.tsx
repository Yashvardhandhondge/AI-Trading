// Fixed LeaderboardComponent to resolve layout issues
"use client"

import React, { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { TrendingUp, TrendingDown, Award, Loader2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { formatCurrency } from "@/lib/utils"
import { logger } from "@/lib/logger"

interface LeaderboardUser {
  id: string;
  telegramId: number;
  username: string;
  photoUrl?: string;
  winLossRatio: number;
  gainLossPercentage: number;
  tradesCount: number;
  cyclesCount: number;
  rank: number;
}

export function LeaderboardComponent() {
  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Fetch leaderboard data
  const fetchLeaderboard = async (showLoadingState = true) => {
    try {
      if (showLoadingState) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      setError(null)

      const response = await fetch("/api/leaderboard")
      if (!response.ok) {
        throw new Error("Failed to fetch leaderboard")
      }

      const data = await response.json()
      if (data.users) {
        setUsers(data.users)
        logger.info(`Fetched ${data.users.length} users for leaderboard`)
      } else {
        setUsers([])
      }

      setLastUpdated(new Date())
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load leaderboard"
      setError(errorMessage)
      logger.error(`Error fetching leaderboard: ${errorMessage}`)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    fetchLeaderboard()
  }, [])

  // Handle manual refresh
  const handleRefresh = () => {
    fetchLeaderboard(false)
  }

  // Generate initials for avatar fallback
  const getInitials = (username: string): string => {
    if (!username) return "??"
    const parts = username.split(/[\s_-]+/) // Split by space, underscore, or dash
    if (parts.length === 1) {
      // If just one word, use first two characters
      return username.substring(0, 2).toUpperCase()
    } else {
      // Otherwise use first letter of first and last parts
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
  }

  // Format the percentage with proper coloring
  const formatPercentage = (value: number) => {
    const color = value >= 0 ? "text-green-500" : "text-red-500"
    const icon = value >= 0 ? <TrendingUp className="h-4 w-4 mr-1" /> : <TrendingDown className="h-4 w-4 mr-1" />
    return (
      <span className={`flex items-center ${color}`}>
        {icon}
        {Math.abs(value).toFixed(2)}%
      </span>
    )
  }

  if (isLoading) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Leaderboard</h2>
        </div>
        <div className="flex justify-center items-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading leaderboard...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Leaderboard</h2>
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-5 w-5 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="sr-only">Refresh</span>
        </Button>
      </div>

      {error && (
        <Card className="mb-4">
          <CardContent className="p-4 text-destructive">
            <p>{error}</p>
          </CardContent>
        </Card>
      )}

      <div className="text-xs text-muted-foreground mb-2">
        Last updated: {lastUpdated.toLocaleTimeString()}
      </div>

      {users.length > 0 ? (
        <div className="space-y-3">
          {users.map((user) => (
            <Card key={user.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  {/* Left side: User info with avatar */}
                  <div className="flex items-center">
                    <div className="relative mr-4">
                      <Avatar>
                        <AvatarImage src={user.photoUrl} alt={user.username} />
                        <AvatarFallback>{getInitials(user.username)}</AvatarFallback>
                      </Avatar>
                      {user.rank <= 3 && (
                        <div className="absolute -top-2 -right-2 bg-amber-400 rounded-full p-1">
                          <Award className="h-3 w-3 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col">
                      <span className="font-medium truncate max-w-[150px]">{user.username}</span>
                      <span className="text-sm text-muted-foreground">Rank #{user.rank}</span>
                    </div>
                  </div>

                  {/* Right side: Profit/Loss with fixed width */}
                  <div className="flex items-center">
                    <div className="text-right min-w-[90px]">
                      <div className="font-bold">{formatCurrency(user.winLossRatio)}</div>
                      <div className="w-full flex justify-end">
                        {formatPercentage(user.gainLossPercentage)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Additional stats below */}
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <div className="bg-secondary/30 rounded p-2 text-center">
                    <p className="text-muted-foreground text-xs">Trades</p>
                    <p className="font-medium">{user.tradesCount}</p>
                  </div>
                  <div className="bg-secondary/30 rounded p-2 text-center">
                    <p className="text-muted-foreground text-xs">Cycles</p>
                    <p className="font-medium">{user.cyclesCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No leaderboard data available yet</p>
            <p className="text-sm text-muted-foreground mt-2">
              Complete trades to appear on the leaderboard
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}