import { NextRequest, NextResponse } from 'next/server';

/**
 * This endpoint provides a simple health check for the socket.io server
 * and avoids the 308 redirect loop for socket.io polling
 */
export async function GET(request: NextRequest) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cache-Control': 'no-store, max-age=0'
  };
  
  // Return a simple success response
  return NextResponse.json({ 
    status: 'ok',
    message: 'Socket API is available',
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