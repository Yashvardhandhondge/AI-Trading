import { Server as NetServer } from "http"
import { Server as SocketIOServer } from "socket.io"
import type { NextApiRequest } from "next"
import type { NextApiResponse } from "next"

export type NextApiResponseWithSocket = NextApiResponse & {
  socket: {
    server: NetServer & {
      io?: SocketIOServer
    }
  }
}

let ioInstance: SocketIOServer | null = null;

export const initSocket = (req: NextApiRequest, res: NextApiResponseWithSocket) => {
  // For App Router in Next.js 13+, we'll use a singleton pattern
  if (!ioInstance) {
    console.log("Initializing new Socket.io instance")
    ioInstance = new SocketIOServer({
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    ioInstance.on("connection", (socket) => {
      console.log("Client connected:", socket.id)

      socket.on("join-user-room", (userId: string) => {
        socket.join(`user-${userId}`)
        console.log(`User ${userId} joined their room`)
      })

      socket.on("disconnect", () => {
        console.log("Client disconnected:", socket.id)
      })
    });
  }

  return ioInstance;
}

export const emitSignal = (io: SocketIOServer, userId: string, signal: any) => {
  io.to(`user-${userId}`).emit("new-signal", signal)
}

export const emitTradeUpdate = (io: SocketIOServer, userId: string, trade: any) => {
  io.to(`user-${userId}`).emit("trade-update", trade)
}

export const emitPortfolioUpdate = (io: SocketIOServer, userId: string, portfolio: any) => {
  io.to(`user-${userId}`).emit("portfolio-update", portfolio)
}

// Helper function to get the singleton instance
export const getIOInstance = () => {
  return ioInstance;
}