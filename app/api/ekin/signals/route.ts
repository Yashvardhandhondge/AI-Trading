import { type NextRequest, NextResponse } from "next/server"
import { getSessionUser } from "@/lib/auth"
import { connectToDatabase, models } from "@/lib/db"
import { EkinApiService } from "@/lib/ekin-api"
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

    // Fetch signals from Ekin API
    const ekinSignals = await EkinApiService.getSignals()

    logger.info(`Fetched ${ekinSignals.length} signals from Ekin API`, {
      context: "EkinAPI",
      userId: user._id,
    })

    // Filter signals based on user's risk level
    const userRiskLevel = user.riskLevel || "medium"
    let filteredSignals = ekinSignals.filter((signal) => {
      const signalRiskLevel = EkinApiService.getRiskLevel(signal.risk)
      return signalRiskLevel === userRiskLevel
    })

    // If no signals match the user's risk level, get the closest ones
    if (filteredSignals.length === 0) {
      logger.info(`No signals match user's risk level ${userRiskLevel}, getting closest ones`, {
        context: "EkinAPI",
        userId: user._id,
      })

      // Sort by risk proximity to user's preference
      const riskMapping = { low: 20, medium: 50, high: 80 }
      const targetRisk = riskMapping[userRiskLevel as keyof typeof riskMapping]

      filteredSignals = ekinSignals
        .sort((a, b) => Math.abs(a.risk - targetRisk) - Math.abs(b.risk - targetRisk))
        .slice(0, 3)
    }

    // Convert to app signal format
    const appSignals = filteredSignals.map((signal) => EkinApiService.convertToAppSignal(signal))

    // Store signals in database
    for (const signal of appSignals) {
      // Check if signal already exists
      const existingSignal = await models.Signal.findOne({
        token: signal.token,
        price: signal.price,
        expiresAt: { $gt: new Date() },
      })

      if (!existingSignal) {
        await models.Signal.create(signal)
      }
    }

    return NextResponse.json({ signals: appSignals })
  } catch (error) {
    logger.error("Error fetching Ekin signals:", error instanceof Error ? error : new Error(String(error)), {
      context: "EkinAPI",
    })
    return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 })
  }
}
