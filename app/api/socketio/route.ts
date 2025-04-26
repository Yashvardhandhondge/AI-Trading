import { NextRequest } from 'next/server';
import { Server } from 'socket.io';
import { logger } from '@/lib/logger';

// Store the Socket.io server instance
let io: any;

export async function GET(req: NextRequest) {
  try {
    // If socket.io server is already initialized, return success
    if (io) {
      return new Response('Socket.io server running', { status: 200 });
    }

    // Get the raw Node.js server instance
    const res = new Response('Socket.io initialization');
    const httpServer = (res as any).socket?.server;

    // Initialize Socket.io if we have a server instance
    if (httpServer && !httpServer.io) {
      logger.info('Initializing Socket.io server');
      
      io = new Server(httpServer, {
        path: '/api/socketio',
        addTrailingSlash: false,
        cors: {
          origin: '*',
          methods: ['GET', 'POST'],
        },
      });

      httpServer.io = io;

      // Add connection handler
      io.on('connection', (socket:any) => {
        logger.info(`Socket connected: ${socket.id}`);

        socket.on('disconnect', () => {
          logger.info(`Socket disconnected: ${socket.id}`);
        });
      });
    } else if (httpServer?.io) {
      logger.info('Socket.io server already running');
      io = httpServer.io;
    }

    return new Response('Socket.io server initialized', { status: 200 });
  } catch (error) {
    logger.error(`Socket.io initialization error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return new Response(`Socket.io initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`, { status: 500 });
  }
}
