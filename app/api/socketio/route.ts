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

  // Redirect to the correct socket.io endpoint
  // This helps prevent the 308 redirect loop
  return NextResponse.redirect(new URL('/api/socketio', req.url), {
    headers,
    status: 307 // Temporary redirect
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
