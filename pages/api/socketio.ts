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
 * Optimized for serverless environments like Vercel.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.status(200).end();
      return;
    }
    
    // Cast the response to our extended type
    const response = res as ResponseWithSocket;
    
    if (!response.socket || !response.socket.server) {
      return res.status(500).json({ error: 'Socket server not available' });
    }
    
    // Set appropriate cache headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    // Initialize Socket.io server if not already initialized
    if (!response.socket.server.io) {
      logger.info('Initializing Socket.io server');
      
      const io = new ServerIO(response.socket.server, {
        path: '/api/socketio',
        addTrailingSlash: false,
        pingInterval: 25000,         // Reduced ping interval for serverless
        pingTimeout: 20000,          // Shorter timeout to detect disconnections faster
        connectTimeout: 10000,       // Connection timeout
        transports: ['polling', 'websocket'], // Start with polling, upgrade to websocket
        cors: {
          origin: '*',
          methods: ['GET', 'POST', 'OPTIONS'],
          allowedHeaders: ['Content-Type', 'Authorization']
        },
        allowEIO3: true,             // Backward compatibility
        cookie: false,               // Don't use cookies for session tracking
        serveClient: false           // Don't serve client files
      });
      
      // Store the io instance on the server object
      response.socket.server.io = io;
      
      // Set up connection handler
      io.on('connection', (socket) => {
        logger.info(`Client connected: ${socket.id}`);
        
        // Send immediate welcome message to confirm connection
        socket.emit('server_status', { status: 'connected', id: socket.id });
        
        socket.on('join-user-room', (userId: string) => {
          try {
            socket.join(`user-${userId}`);
            logger.info(`User ${userId} joined room`);
            
            // Acknowledge room join to client
            socket.emit('room-joined', { userId, room: `user-${userId}` });
          } catch (error) {
            logger.info(`Error joining room: ${error instanceof Error ? error.message : String(error)}`);
            socket.emit('error', { message: 'Failed to join room' });
          }
        });
        
        socket.on('ping', () => {
          socket.emit('pong', { timestamp: Date.now() });
        });
        
        socket.on('error', (error) => {
          logger.info(`Socket error: ${error instanceof Error ? error.message : String(error)}`);
        });
        
        socket.on('disconnect', (reason) => {
          logger.info(`Client disconnected: ${socket.id}, reason: ${reason}`);
        });
      });
      
      // Handle server-level errors
      io.engine.on('connection_error', (err) => {
        logger.info(`Connection error: ${err.message}`);
      });
    }
    
    // End the response
    return res.status(200).end();
    
  } catch (error) {
    logger.info(`Socket.io handler error: ${error instanceof Error ? error.message : String(error)}`);
    return res.status(500).json({ error: 'Internal server error in socket handler' });
  }
}

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true // Let Socket.io handle its own resolution
  },
};
