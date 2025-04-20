"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, Trophy, ArrowUp, ArrowDown } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { formatCurrency, getTimeAgo } from "@/lib/utils"

interface LeaderboardUser {
  id: string
  username: string
  photoUrl?: string
  winLossRatio: number
  gainLossPercentage: number
  rank: number
}

interface TradeAction {
  id: string
  type: "BUY" | "SELL"
  token: string
  price: number
  timestamp: string
}

export function Leaderboard() {
  const [isLoading, setIsLoading] = useState(true)
  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [selectedUser, setSelectedUser] = useState<LeaderboardUser | null>(null)
  const [tradeActions, setTradeActions] = useState<TradeAction[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  useEffect(() => {
    const fetchLeaderboard = async () => {
      try {
        const response = await fetch("/api/leaderboard")
        if (!response.ok) {
          throw new Error("Failed to fetch leaderboard data")
        }

        const data = await response.json()
        setUsers(data.users || [])
      } catch (error) {
        console.error("Error fetching leaderboard:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLeaderboard()
  }, [])

  const fetchUserTrades = async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${userId}/trades`)
      if (!response.ok) {
        throw new Error("Failed to fetch user trades")
      }

      const data = await response.json()
      setTradeActions(data.trades || [])
    } catch (error) {
      console.error("Error fetching user trades:", error)
    }
  }

  const handleUserClick = async (user: LeaderboardUser) => {
    setSelectedUser(user)
    await fetchUserTrades(user.id)
    setIsDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading leaderboard...</span>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <h1 className="text-2xl font-bold mb-4">Leaderboard</h1>

      {users.length > 0 ? (
        <div className="space-y-4">
          {users.map((user) => (
            <Card key={user.id} className="cursor-pointer hover:bg-muted/50" onClick={() => handleUserClick(user)}>
              <CardContent className="p-4 flex items-center">
                <div className="flex items-center space-x-4 flex-1">
                  <div className="relative">
                    {user.rank <= 3 && (
                      <div className="absolute -top-2 -right-2 z-10">
                        <Trophy
                          className={`h-5 w-5 ${
                            user.rank === 1 ? "text-yellow-500" : user.rank === 2 ? "text-gray-400" : "text-amber-800"
                          }`}
                        />
                      </div>
                    )}
                    <Avatar>
                      <AvatarImage src={user.photoUrl || "/placeholder.svg"} />
                      <AvatarFallback>{user.username.substring(0, 2).toUpperCase()}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div>
                    <p className="font-medium">{user.username}</p>
                    <p className="text-sm text-muted-foreground">Rank #{user.rank}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className="flex items-center">
                    <p className="font-medium mr-2">W/L: {user.winLossRatio.toFixed(2)}</p>
                    <p
                      className={`font-medium flex items-center ${
                        user.gainLossPercentage >= 0 ? "text-green-500" : "text-red-500"
                      }`}
                    >
                      {user.gainLossPercentage >= 0 ? (
                        <ArrowUp className="h-4 w-4 mr-1" />
                      ) : (
                        <ArrowDown className="h-4 w-4 mr-1" />
                      )}
                      {Math.abs(user.gainLossPercentage).toFixed(2)}%
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No leaderboard data available</p>
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{selectedUser?.username}&apos;s Recent Trades</DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto">
            {tradeActions.length > 0 ? (
              <div className="space-y-4 py-2">
                {tradeActions.map((trade) => (
                  <div key={trade.id} className="flex items-center justify-between border-b pb-2">
                    <div className="flex items-center">
                      {trade.type === "BUY" ? (
                        <ArrowUp className="h-4 w-4 mr-2 text-green-500" />
                      ) : (
                        <ArrowDown className="h-4 w-4 mr-2 text-red-500" />
                      )}
                      <div>
                        <p className="font-medium">
                          {trade.type} {trade.token}
                        </p>
                        <p className="text-sm text-muted-foreground">{formatCurrency(trade.price)}</p>
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground">{getTimeAgo(new Date(trade.timestamp))}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-4 text-muted-foreground">No recent trades found</p>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
