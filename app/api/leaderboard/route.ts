import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"

export async function GET(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Connect to database
    await connectToDatabase()

    // Get all users with trades
    const users = await models.User.find({ exchangeConnected: true })

    // Calculate performance metrics for each user
    const leaderboardData = await Promise.all(
      users.map(async (user) => {
        // Get all completed trades for this user
        const trades = await models.Trade.find({
          userId: user._id,
          status: "completed",
        }).sort({ createdAt: -1 })

        // Get all completed cycles for this user
        const cycles = await models.Cycle.find({
          userId: user._id,
          state: { $in: ["exit", "completed"] },
        })

        // Calculate win/loss ratio
        const winningCycles = cycles.filter((cycle) => (cycle.pnl ?? 0) > 0).length
        const losingCycles = cycles.filter((cycle) => (cycle.pnl ?? 0) < 0).length
        const winLossRatio = losingCycles > 0 ? winningCycles / losingCycles : winningCycles

        // Calculate gain/loss percentage
        const totalGain = cycles.reduce((sum, cycle) => sum + (cycle.pnl || 0), 0)
        const totalInvested = cycles.reduce((sum, cycle) => {
          if (cycle.entryPrice && cycle.pnl !== undefined && cycle.pnlPercentage !== undefined) {
            // Estimate the invested amount from the entry price
            const tradeAmount = cycle.pnl / (cycle.pnlPercentage / 100)
            return sum + tradeAmount
          }
          return sum
        }, 0)

        const gainLossPercentage = totalInvested > 0 ? (totalGain / totalInvested) * 100 : 0

        return {
          id: user._id.toString(),
          telegramId: user.telegramId,
          username: user.username || `${user.firstName} ${user.lastName}`.trim(),
          photoUrl: user.photoUrl,
          winLossRatio: winLossRatio || 0,
          gainLossPercentage: gainLossPercentage || 0,
          tradesCount: trades.length,
          cyclesCount: cycles.length,
        }
      }),
    )

    // Sort by gain/loss percentage
    const sortedLeaderboard = leaderboardData
      .sort((a, b) => b.gainLossPercentage - a.gainLossPercentage)
      .map((user, index) => ({
        ...user,
        rank: index + 1,
      }))

    return NextResponse.json({ users: sortedLeaderboard })
  } catch (error) {
    console.error("Error fetching leaderboard:", error)
    return NextResponse.json({ error: "Failed to fetch leaderboard data" }, { status: 500 })
  }
}
