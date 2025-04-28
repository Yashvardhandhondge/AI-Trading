// import { type NextRequest, NextResponse } from "next/server"
// import { getSessionUser } from "@/lib/auth"
// import { connectToDatabase, models } from "@/lib/db"
// import { logger } from "@/lib/logger"

// export async function GET(request: NextRequest) {
//   try {
//     const sessionUser = await getSessionUser()

//     if (!sessionUser) {
//       return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
//     }

//     // Connect to database
//     await connectToDatabase()

//     // Get user data
//     const user = await models.User.findOne({ telegramId: sessionUser.id })

//     if (!user) {
//       return NextResponse.json({ error: "User not found" }, { status: 404 })
//     }

//     // Get limit from query params
//     const searchParams = new URL(request.url).searchParams
//     const limit = parseInt(searchParams.get("limit") || "50", 10)
    
//     // Get recent notifications (both read and unread)
//     const notifications = await models.Notification.find({
//       userId: user._id,
//     }).sort({ createdAt: -1 }).limit(limit)

//     logger.info(`Retrieved ${notifications.length} notifications for user`, {
//       context: "Notifications",
//       userId: sessionUser.id
//     })

//     return NextResponse.json({ notifications })
//   } catch (error) {
//     logger.error(`Error fetching notifications: ${error instanceof Error ? error.message : 'Unknown error'}`)
//     return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
//   }
// }