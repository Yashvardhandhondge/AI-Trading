import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Cycle Trader",
  description: "Cryptocurrency trading with real-time signals",
  viewport: "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* Add Telegram Mini App script */}
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
