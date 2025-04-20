import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"

export async function POST(request: NextRequest) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { riskLevel } = await request.json()

    if (!riskLevel || !["low", "medium", "high"].includes(riskLevel)) {
      return NextResponse.json({ error: "Invalid risk level" }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Update user risk level
    await models.User.findOneAndUpdate({ telegramId: sessionUser.id }, { riskLevel, updatedAt: new Date() })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating risk level:", error)
    return NextResponse.json({ error: "Failed to update risk level" }, { status: 500 })
  }
}
