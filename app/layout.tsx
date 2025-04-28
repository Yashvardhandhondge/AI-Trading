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
        
        {/* Suppress socket.io reconnection to prevent excessive polling */}
        <script dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('load', () => {
              // Override socket.io auto reconnect
              if (window.io) {
                const originalIO = window.io;
                window.io = function() {
                  const socket = originalIO.apply(this, arguments);
                  if (socket) {
                    socket.io.reconnectionDelay = 5000;  // 5 seconds between reconnect attempts
                    socket.io.reconnectionAttempts = 3;  // Only try 3 times
                    socket.io.timeout = 10000;  // 10 second timeout 
                    
                    const originalConnect = socket.connect;
                    socket.connect = function() {
                      console.log('Custom socket.io connect called');
                      return originalConnect.apply(this, arguments);
                    }
                  }
                  return socket;
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