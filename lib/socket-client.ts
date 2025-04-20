import { create } from "zustand"
import { io, type Socket } from "socket.io-client"

interface SocketState {
  socket: Socket | null
  isConnected: boolean
  connect: (userId: string) => void
  disconnect: () => void
}

export const useSocketStore = create<SocketState>((set) => ({
  socket: null,
  isConnected: false,
  connect: (userId: string) => {
    // For development, don't try to connect at all
    if (process.env.NODE_ENV === 'development') {
      console.log("[DEV MODE] Simulating socket connection for user:", userId);
      // Create a mock socket that doesn't actually connect but provides needed methods
      const mockSocket = {
        id: 'mock-socket-id',
        emit: (event: string, ...args: any[]) => {
          console.log(`[MOCK SOCKET] Emitted ${event}:`, ...args);
          return true;
        },
        on: (event: string, callback: (...args: any[]) => void) => {
          console.log(`[MOCK SOCKET] Registered handler for ${event}`);
          return mockSocket;
        },
        disconnect: () => {
          console.log('[MOCK SOCKET] Disconnected');
        }
      } as unknown as Socket;
      
      set({ socket: mockSocket, isConnected: true });
      return;
    }
    
    // Production code path
    try {
      fetch('/api/socket')
        .then(() => {
          const socketInstance = io();
          
          socketInstance.on("connect", () => {
            console.log("Socket connected with ID:", socketInstance.id);
            set({ socket: socketInstance, isConnected: true });
            socketInstance.emit("join-user-room", userId);
          });
          
          socketInstance.on("disconnect", () => {
            console.log("Socket disconnected");
            set({ socket: null, isConnected: false });
          });
          
          socketInstance.on("connect_error", (err) => {
            console.log("Socket connect error:", err);
          });
          
          set({ socket: socketInstance });
        })
        .catch(error => {
          console.error("Failed to initialize socket server:", error);
        });
    } catch (error) {
      console.error("Socket connection error:", error);
    }
  },
  disconnect: () => {
    set((state) => {
      if (state.socket) {
        state.socket.disconnect();
      }
      return { socket: null, isConnected: false };
    });
  },
}))