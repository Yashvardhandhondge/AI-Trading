import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"

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

    // Get unread notifications
    const notifications = await models.Notification.find({
      userId: user._id,
      read: false,
    }).sort({ createdAt: -1 }).limit(10) // Get the 10 most recent unread notifications

    logger.info(`Retrieved ${notifications.length} unread notifications`, {
      context: "Notifications",
      userId: sessionUser.id
    })

    return NextResponse.json({ notifications })
  } catch (error) {
    logger.error(`Error fetching notifications: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
  }
}