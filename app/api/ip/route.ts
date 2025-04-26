// app/api/ip/route.ts
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    // Get client IP from headers
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0] || 
               request.headers.get('x-real-ip') || 
               "unknown";
    
    // Get additional context for debugging
    const userAgent = request.headers.get('user-agent') || "unknown";
    
    logger.info(`IP detection request from ${ip}`, {
      context: "IPDetection",
      data: {
        ip,
        userAgent: userAgent.substring(0, 100), // Truncate long user agents
        headers: {
          // Include relevant headers for debugging IP issues
          forwarded: request.headers.get('forwarded') || undefined,
          'x-forwarded-for': request.headers.get('x-forwarded-for') || undefined,
          'x-real-ip': request.headers.get('x-real-ip') || undefined,
          'cf-connecting-ip': request.headers.get('cf-connecting-ip') || undefined
        }
      }
    });
    
    // Return the IP and Vercel's IP ranges
    return NextResponse.json({
      ip,
      vercelIpRanges: ["76.76.21.0/24"],
      timestamp: new Date().toISOString()
    }, {
      headers: {
        // Set CORS headers to allow access from anywhere
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, max-age=0"
      }
    });
  } catch (error) {
    logger.error(`Error in IP detection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    
    return NextResponse.json({ 
      error: "Failed to detect IP address",
      fallbackIp: "Please use an IP detection service like whatismyip.com"
    }, { 
      status: 500,
      headers: {
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    }
  });
}