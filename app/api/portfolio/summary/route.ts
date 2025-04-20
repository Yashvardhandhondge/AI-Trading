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

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Get portfolio summary
    const portfolio = await models.Portfolio.findOne({ userId: user._id })

    if (!portfolio) {
      return NextResponse.json({
        totalValue: 0,
        realizedPnl: 0,
        unrealizedPnl: 0,
      })
    }

    return NextResponse.json({
      totalValue: portfolio.totalValue,
      realizedPnl: portfolio.realizedPnl,
      unrealizedPnl: portfolio.unrealizedPnl,
    })
  } catch (error) {
    console.error("Error fetching portfolio summary:", error)
    return NextResponse.json({ error: "Failed to fetch portfolio summary" }, { status: 500 })
  }
}
