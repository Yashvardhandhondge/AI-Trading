// app/api/bot/activity-log/route.ts
import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { logger } from "@/lib/logger"
import { ActivityLogService } from "@/lib/activity-log-service"

/**
 * API endpoint to get bot activity logs
 * GET /api/bot/activity-log
 */
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

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const limit = parseInt(searchParams.get("limit") || "20") // Default to 20 log entries
    const offset = parseInt(searchParams.get("offset") || "0")
    
    // Get logs from the database
    const logs = await models.ActivityLog.find({
      userId: user._id
    })
      .sort({ timestamp: -1 }) // Most recent first
      .skip(offset)
      .limit(limit)

    // Format logs for response
    interface ActivityLog {
      _id: {
        toString: () => string;
      };
      timestamp: Date;
      action: string;
      token: string;
      status: string;
      details: string;
      price?: number;
      amount?: number;
      errorMessage?: string;
    }

    interface FormattedLog {
      id: string;
      timestamp: Date;
      action: string;
      token: string;
      status: string;
      details: string;
      price?: number;
      amount?: number;
      errorMessage?: string;
    }

    const formattedLogs: FormattedLog[] = logs.map((log: ActivityLog) => ({
      id: log._id.toString(),
      timestamp: log.timestamp,
      action: log.action,
      token: log.token,
      status: log.status,
      details: log.details,
      price: log.price,
      amount: log.amount,
      errorMessage: log.errorMessage
    }))

    return NextResponse.json({ logs: formattedLogs })
  } catch (error) {
    logger.error(`Error fetching activity logs: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to fetch activity logs" }, { status: 500 })
  }
}

/**
 * API endpoint to record a new activity log
 * POST /api/bot/activity-log
 */
export async function POST(request: NextRequest) {
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

    // Get log data from request body
    const logData = await request.json()
    
    // Validate required fields
    if (!logData.action || !logData.token || !logData.status) {
      return NextResponse.json({ 
        error: "Missing required fields: action, token, and status are required" 
      }, { status: 400 })
    }

    // Create new log entry
    const newLog = await ActivityLogService.recordActivity({
      userId: user._id,
      action: logData.action,
      token: logData.token,
      status: logData.status,
      details: logData.details || "",
      price: logData.price,
      amount: logData.amount,
      errorMessage: logData.errorMessage
    })

    return NextResponse.json({ 
      success: true,
      log: {
        id: newLog._id.toString(),
        timestamp: newLog.timestamp,
        action: newLog.action,
        token: newLog.token,
        status: newLog.status,
        details: newLog.details,
        price: newLog.price,
        amount: newLog.amount,
        errorMessage: newLog.errorMessage
      }
    })
  } catch (error) {
    logger.error(`Error recording activity log: ${error instanceof Error ? error.message : "Unknown error"}`)
    return NextResponse.json({ error: "Failed to record activity log" }, { status: 500 })
  }
}