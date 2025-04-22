"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { logger } from "@/lib/logger"

interface TelegramAuthWrapperProps {
  children: React.ReactNode
}

export function TelegramAuthWrapper({ children }: TelegramAuthWrapperProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    const authenticateUser = async () => {
      try {
        // Check if we're in Telegram WebApp
        if (!window.Telegram || !window.Telegram.WebApp) {
          throw new Error("Not in Telegram WebApp")
        }

        // Get the initData from Telegram WebApp
        const initData = window.Telegram.WebApp.initData

        if (!initData) {
          throw new Error("No initData provided by Telegram")
        }

        logger.info("Authenticating with Telegram", { context: "TelegramAuth" })

        // Send the initData to our authentication endpoint
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ initData }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.message || "Authentication failed")
        }

        logger.info("Authentication successful", { context: "TelegramAuth" })
        setIsAuthenticated(true)
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Authentication failed"
        logger.error("Authentication error:", err instanceof Error ? err : new Error(errorMessage), {
          context: "TelegramAuth",
        })
        setError(errorMessage)
      } finally {
        setIsLoading(false)
      }
    }

    authenticateUser()
  }, [router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <p className="mt-4 text-muted-foreground">Authenticating...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
        <div className="mb-6 rounded-full bg-destructive/10 p-4">
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
            className="text-destructive"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold">Authentication Error</h1>
        <p className="mb-6 text-muted-foreground">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Try Again
        </button>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-4 text-center">
        <div className="mb-6 rounded-full bg-destructive/10 p-4">
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
            className="text-destructive"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="mb-2 text-2xl font-bold">Access Denied</h1>
        <p className="mb-6 text-muted-foreground">
          You need to authenticate through Telegram to access this application.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
        >
          Try Again
        </button>
      </div>
    )
  }

  return <>{children}</>
}
