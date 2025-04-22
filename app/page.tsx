"use client"

import { useEffect, useState } from "react"
import { MainApp } from "@/components/main-app"
import { TelegramAuthWrapper } from "@/components/telegram-auth-wrapper"
import { logger } from "@/lib/logger"

export default function Home() {
  const [isTelegramWebApp, setIsTelegramWebApp] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Check if Telegram WebApp is available
    const checkTelegramWebApp = () => {
      // Wait a moment to ensure the Telegram WebApp script has loaded
      setTimeout(() => {
        const isTelegram = window.Telegram && window.Telegram.WebApp
        setIsTelegramWebApp(!!isTelegram)
        setIsLoading(false)

        if (isTelegram) {
          logger.info("Telegram WebApp detected", { context: "TelegramInit" })
          // Initialize Telegram WebApp
          window.Telegram.WebApp.ready()
          window.Telegram.WebApp.expand()
        } else {
          logger.info("Telegram WebApp not detected", { context: "TelegramInit" })
        }
      }, 500)
    }

    checkTelegramWebApp()
  }, [])

  // Show loading state while checking
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // If not in Telegram, show a message
  if (isTelegramWebApp === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
        <div className="mb-6 rounded-full bg-primary/10 p-4">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="48"
            height="48"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <path d="m22 2-7 20-4-9-9-4Z" />
            <path d="M22 2 11 13" />
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold">Cycle Trader</h1>
        <p className="mb-6 text-muted-foreground">
          This app can only be opened within Telegram. Please use the link in Telegram to access this application.
        </p>
        <div className="rounded-md bg-primary/10 p-4 text-left">
          <h2 className="mb-2 font-semibold">How to open:</h2>
          <ol className="list-decimal pl-5 text-sm text-muted-foreground">
            <li className="mb-1">Open Telegram</li>
            <li className="mb-1">Search for @YourBotName</li>
            <li className="mb-1">Start the bot with /start</li>
            <li>Tap on the "Open App" button</li>
          </ol>
        </div>
      </div>
    )
  }

  // If in Telegram, render the app with auth wrapper
  return (
    <TelegramAuthWrapper>
      <MainApp />
    </TelegramAuthWrapper>
  )
}
