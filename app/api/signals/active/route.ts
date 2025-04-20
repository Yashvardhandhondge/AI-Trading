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

    // Get active signal based on user's risk level
    const signal = await models.Signal.findOne({
      riskLevel: user.riskLevel,
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 })

    return NextResponse.json({ signal })
  } catch (error) {
    console.error("Error fetching active signal:", error)
    return NextResponse.json({ error: "Failed to fetch active signal" }, { status: 500 })
  }
}
