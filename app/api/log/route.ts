// app/api/log/route.ts
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  try {
    const logData = await req.json()
    
    // In production, you might want to store these logs
    console.log(`[REMOTE LOG][${logData.level}] ${logData.message}`, logData)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Failed to log" }, { status: 500 })
  }
}