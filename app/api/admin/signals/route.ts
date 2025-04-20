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

    // Get active signals
    const signals = await models.Signal.find({
      expiresAt: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Include signals from the last 24 hours
    }).sort({ createdAt: -1 })

    return NextResponse.json({ signals })
  } catch (error) {
    console.error("Error fetching signals:", error)
    return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
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

    const { type, token, price, riskLevel, expiresInMinutes } = await request.json()

    if (!type || !["BUY", "SELL"].includes(type)) {
      return NextResponse.json({ error: "Invalid signal type" }, { status: 400 })
    }

    if (!token) {
      return NextResponse.json({ error: "Token is required" }, { status: 400 })
    }

    if (!price || isNaN(price) || price <= 0) {
      return NextResponse.json({ error: "Valid price is required" }, { status: 400 })
    }

    if (!riskLevel || !["low", "medium", "high"].includes(riskLevel)) {
      return NextResponse.json({ error: "Valid risk level is required" }, { status: 400 })
    }

    // Calculate expiration time (default to 10 minutes if not specified)
    const expiresAt = new Date()
    expiresAt.setMinutes(expiresAt.getMinutes() + (expiresInMinutes || 10))

    // Create signal
    const signal = await models.Signal.create({
      type,
      token,
      price,
      riskLevel,
      createdAt: new Date(),
      expiresAt,
      autoExecuted: false,
    })

    // Create notifications for eligible users
    const eligibleUsers = await models.User.find({
      riskLevel,
      exchangeConnected: true,
    })

    for (const user of eligibleUsers) {
      // Check if user has already received a signal for this token in the last 24 hours
      const hasRecentSignal = user.lastSignalTokens.some(
        (item:any) =>
          item.token === token && new Date().getTime() - new Date(item.timestamp).getTime() < 24 * 60 * 60 * 1000,
      )

      if (!hasRecentSignal) {
        await models.Notification.create({
          userId: user._id,
          type: "signal",
          message: `New ${type} signal for ${token} at ${price}`,
          relatedId: signal._id,
          createdAt: new Date(),
        })
      }
    }

    return NextResponse.json({ success: true, signal })
  } catch (error) {
    console.error("Error creating signal:", error)
    return NextResponse.json({ error: "Failed to create signal" }, { status: 500 })
  }
}
