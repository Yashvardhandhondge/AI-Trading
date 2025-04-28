import { Server as ServerIO } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';
import type { Server as NetServer } from 'http';
import type { Socket } from 'net';
import { logger } from '@/lib/logger';

interface SocketServer extends NetServer {
  io?: ServerIO;
}

interface ResponseWithSocket extends NextApiResponse {
  socket: Socket & {
    server: SocketServer;
  };
}

/**
 * This handler sets up a Socket.io server for real-time communication.
 * It's optimized to avoid polling issues in Vercel deployments.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  // For polling requests, return a no-op response with long timeouts
  // This helps prevent excessive reconnection attempts
  if (req.url?.includes('polling')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Content-Type', 'application/json');
    
    return res.status(200).json({
      type: 'noop',
      pingInterval: 60000,   // 60 seconds between pings
      pingTimeout: 90000,    // 90 second timeout
      sid: `mock-${Date.now()}` // Mock session ID
    });
  }
  
  // Cast the response to our extended type
  const response = res as ResponseWithSocket;
  
  if (!response.socket || !response.socket.server) {
    return res.status(500).json({ error: 'Socket server not available' });
  }
  
  // Set appropriate cache headers to avoid browser caching
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  // Initialize Socket.io server if not already initialized
  if (!response.socket.server.io) {
    logger.info('Initializing Socket.io server');
    
    const io = new ServerIO(response.socket.server, {
      path: '/api/socketio',
      addTrailingSlash: false,
      pingInterval: 60000,   // 60 seconds between pings
      pingTimeout: 90000,    // 90 second timeout
      connectTimeout: 10000, // 10 second connection timeout
      transports: ['websocket'], // WebSocket only, no polling
      cors: {
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization']
      }
    });
    
    // Store the io instance on the server object
    response.socket.server.io = io;
    
    // Set up connection handler
    io.on('connection', (socket) => {
      logger.info('Client connected:', { clientId: socket.id });
      
      socket.on('join-user-room', (userId: string) => {
        socket.join(`user-${userId}`);
        logger.info(`User ${userId} joined room`);
        
        // Acknowledge room join to client
        socket.emit('room-joined', { userId, room: `user-${userId}` });
      });
      
      socket.on('disconnect', () => {
        logger.info('Client disconnected:', { clientId: socket.id });
      });
    });
  }
  
  // End the response
  res.end();
}

export const config = {
  api: {
    bodyParser: false,
  },
};
