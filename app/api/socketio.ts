// pages/api/socketio.ts
import { Server as ServerIO } from 'socket.io';
import { NextApiRequest, NextApiResponse } from 'next';
import type { Server as NetServer } from 'http';
import type { Socket } from 'net';

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

  if (!response.socket.server.io) {
    console.log('*First use, starting socket.io');
    
    const io = new ServerIO(response.socket.server);
    response.socket.server.io = io;
    
    io.on('connection', (socket) => {
      console.log('Client connected:', socket.id);
      
      socket.on('join-user-room', (userId: string) => {
        socket.join(`user-${userId}`);
        console.log(`User ${userId} joined their room`);
      });
      
      socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
      });
    });
  } else {
    console.log('socket.io already running');
  }
  
  res.end();
}

export const config = {
  api: {
    bodyParser: false,
  },
};