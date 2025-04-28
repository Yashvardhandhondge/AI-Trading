import { NextRequest, NextResponse } from 'next/server';

/**
 * This is a simple handler that informs clients that Socket.io should be accessed
 * through pages/api/socketio.ts and not through this App Router path
 */
export async function GET(req: NextRequest) {
  // Add CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, max-age=0',
    'Content-Type': 'application/json'
  };

  // Return JSON info instead of redirecting to avoid redirect loops
  return NextResponse.json({ 
    status: 'ok',
    message: 'Socket.io is available at /api/socketio',
    timestamp: new Date().toISOString()
  }, { 
    status: 200,
    headers
  });
}

// Handle OPTIONS requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    }
  });
}