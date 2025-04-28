import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { ToasterProvider } from "@/components/toaster-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "AiCryptoTrader",
  description: "Cryptocurrency trading with real-time signals",
  viewport: "width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Add Telegram Mini App script */}
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
        
        {/* Socket.io connection management - prevent excessive reconnects */}
        <script dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('load', () => {
              // Override socket.io to limit reconnection attempts
              if (window.io) {
                const originalIO = window.io;
                window.io = function() {
                  const socket = originalIO.apply(this, arguments);
                  if (socket) {
                    // Configure connection parameters
                    socket.io.reconnectionDelay = 5000;         // 5 seconds between reconnect attempts
                    socket.io.reconnectionDelayMax = 30000;     // Max 30 second delay
                    socket.io.reconnectionAttempts = 3;         // Only try 3 times
                    socket.io.timeout = 10000;                  // 10 second timeout
                    socket.io.autoConnect = false;              // Don't connect until explicitly told
                    
                    // Cache control for polling transport to avoid redirect issues
                    if (socket.io.opts && socket.io.opts.transports) {
                      socket.io.opts.transports = ['websocket']; // Force WebSocket only
                    }
                    
                    // Monitor reconnect failures
                    let reconnectAttempts = 0;
                    socket.io.on('reconnect_attempt', () => {
                      reconnectAttempts++;
                      console.log('Socket.io reconnect attempt:', reconnectAttempts);
                      if (reconnectAttempts >= 3) {
                        console.log('Max reconnect attempts reached, disabling reconnect');
                        socket.io.reconnection(false); // Disable further reconnection attempts
                      }
                    });
                    
                    // Monitor errors
                    socket.io.on('error', (err) => {
                      console.error('Socket.io error:', err);
                    });
                  }
                  return socket;
                };
                
                // Patch io.connect and io.manager as well
                if (window.io.connect) {
                  window.io.connect = window.io;
                }
              }
            });
          `
        }} />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          <ToasterProvider />
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}