import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"
import mongoose from "mongoose"

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const sessionUser = await getSessionUser()

    if (!sessionUser) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { id } = params

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid notification ID" }, { status: 400 })
    }

    // Connect to database
    await connectToDatabase()

    // Get user data
    const user = await models.User.findOne({ telegramId: sessionUser.id })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    // Find notification and ensure it belongs to the user
    const notification = await models.Notification.findOne({
      _id: id,
      userId: user._id,
    })

    if (!notification) {
      return NextResponse.json({ error: "Notification not found" }, { status: 404 })
    }

    // Mark as read
    notification.read = true
    await notification.save()

    logger.info(`Marked notification ${id} as read`, {
      context: "Notifications",
      userId: sessionUser.id,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error(`Error marking notification as read: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return NextResponse.json({ error: "Failed to mark notification as read" }, { status: 500 })
  }
}