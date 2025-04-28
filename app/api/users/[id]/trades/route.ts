import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import mongoose from "mongoose"

export async function GET(request: NextRequest,   { params }: { params: Promise<{ id: string }> }) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = await params

    if (!id) {
      return NextResponse.json({ error: "User ID is required" }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid user ID" }, { status: 400 })
    }

    // Get user's trades
    const trades = await models.Trade.find({
      userId: id,
      status: "completed",
    })
      .sort({ createdAt: -1 })
      .limit(10)

    // Format trades for response
    const formattedTrades = trades.map((trade) => ({
      id: trade._id.toString(),
      type: trade.type,
      token: trade.token,
      price: trade.price,
      amount: trade.amount,
      timestamp: trade.createdAt,
      autoExecuted: trade.autoExecuted,
    }))

    return NextResponse.json({ trades: formattedTrades })
  } catch (error) {
    console.error("Error fetching user trades:", error)
    return NextResponse.json({ error: "Failed to fetch user trades" }, { status: 500 })
  }
}
