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
      // Disconnect any existing connection
      const currentState = useSocketStore.getState();
      if (currentState.socket) {
        currentState.socket.disconnect();
      }
      
      // Create a single socket instance with proper options to prevent polling issues
      // Note: Using websocket transport only to avoid polling redirection issues
      const socketInstance = io({
        path: '/api/socketio',
        transports: ['websocket'], // Force WebSocket only, no polling
        reconnectionAttempts: 3,
        reconnectionDelay: 5000,
        timeout: 10000,
        autoConnect: true,
        forceNew: true
      });
      
      // Setup socket event handlers
      socketInstance.on("connect", () => {
        console.log("Socket connected with ID:", socketInstance.id);
        // Join user-specific room
        socketInstance.emit("join-user-room", userId);
        set({ socket: socketInstance, isConnected: true });
      });
      
      socketInstance.on("disconnect", () => {
        console.log("Socket disconnected");
        set({ isConnected: false });
      });
      
      socketInstance.on("connect_error", (err) => {
        console.log("Socket connect error:", err);
        
        // After 3 failures, stop trying to reconnect to reduce network traffic
        if (socketInstance.io.reconnectionAttempts === 0) {
          console.log("Max reconnection attempts reached, stopping reconnection");
          socketInstance.disconnect();
        }
      });
      
      // Set socket in store right away
      set({ socket: socketInstance });
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