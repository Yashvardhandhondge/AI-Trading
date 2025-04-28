import { NextRequest } from 'next/server';
import { Server } from 'socket.io';
import { logger } from '@/lib/logger';

// Store the Socket.io server instance
let io: any;

export async function GET(req: NextRequest) {
  try {
    // If socket.io server is already initialized, return success
    if (io) {
      return new Response('Socket.io server running', { 
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store, max-age=0',
        }
      });
    }

    logger.info('Socket.io endpoint called but cannot initialize in App Router');
    
    // App Router (in Next.js 13+) doesn't support direct server initialization
    // Return a helpful message instead of trying to initialize
    return new Response(JSON.stringify({
      status: 'error',
      message: 'Socket.io cannot be initialized from App Router. Use pages/api directory or a custom server instead.',
      suggestion: 'If you need real-time functionality, consider using Server-Sent Events or WebSockets with a separate backend server.'
    }), { 
      status: 501, // Not Implemented
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      }
    });
  } catch (error) {
    logger.error(`Socket.io endpoint error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return new Response(JSON.stringify({
      status: 'error',
      message: `Socket.io endpoint error: ${error instanceof Error ? error.message : 'Unknown error'}`
    }), { 
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store, max-age=0',
      }
    });
  }
}
