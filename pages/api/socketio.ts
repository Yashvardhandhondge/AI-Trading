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

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  // Type assertion to work around the possibly null issue
  const response = res as ResponseWithSocket;
  
  if (!response.socket || !response.socket.server) {
    return res.status(500).json({ error: 'Socket server not available' });
  }

  // Set appropriate cache headers
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('Expires', '-1');
  res.setHeader('Pragma', 'no-cache');

  if (!response.socket.server.io) {
    logger.info('Initializing Socket.io server');
    
    const io = new ServerIO(response.socket.server, {
      path: '/api/socketio',
      addTrailingSlash: false,
      pingTimeout: 60000,
      pingInterval: 25000, // Increase ping interval to 25 seconds
      transports: ['websocket'], // Use only websockets to avoid polling
      allowEIO3: true,
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    response.socket.server.io = io;
    
    io.on('connection', (socket) => {
      logger.info('Client connected:', { clientId: socket.id });
      
      socket.on('join-user-room', (userId: string) => {
        socket.join(`user-${userId}`);
        logger.info(`User ${userId} joined their room`);
        
        // Send confirmation to client
        socket.emit('room-joined', `user-${userId}`);
      });
      
      socket.on('disconnect', () => {
        logger.info('Client disconnected:', { clientId: socket.id });
      });
      
      // Keep alive ping with longer interval
      socket.conn.on('packet', (packet) => {
        if (packet.type === 'ping') {
          logger.debug('Received ping', { clientId: socket.id });
        }
      });
    });
  } else {
    logger.debug('Socket.io already running');
  }
  
  res.end();
}

export const config = {
  api: {
    bodyParser: false,
  },
};
