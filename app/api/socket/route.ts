import { NextResponse } from 'next/server';

// This is a simple endpoint to respond to Socket.io polling requests
// It won't actually establish a socket connection, but will prevent 404 errors
export async function GET(request: Request) {
  // Socket.io typically expects a specific format
  return new NextResponse(JSON.stringify({
    code: 0,
    message: "Socket.io is not fully implemented on this server"
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    },
  });
}