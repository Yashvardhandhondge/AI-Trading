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

    // Check if user is admin
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user || !user.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Get all trades with user info
    const trades = await models.Trade.find().sort({ createdAt: -1 }).limit(100)

    // Populate with usernames
    const tradesWithUsernames = await Promise.all(
      trades.map(async (trade) => {
        const user = await models.User.findById(trade.userId)
        return {
          ...trade.toObject(),
          username: user ? user.username || `${user.firstName} ${user.lastName}`.trim() : "Unknown",
        }
      }),
    )

    return NextResponse.json({ trades: tradesWithUsernames })
  } catch (error) {
    console.error("Error fetching trades:", error)
    return NextResponse.json({ error: "Failed to fetch trades" }, { status: 500 })
  }
}
