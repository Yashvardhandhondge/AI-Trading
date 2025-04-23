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
    // Check if we're in development mode
    const isDevelopment = process.env.NODE_ENV === "development"
    
    if (isDevelopment) {
      // For development, we can skip actual Telegram auth
      logger.info("Development mode: Bypassing Telegram authentication", { context: "TelegramAuth" })
      setIsAuthenticated(true)
      setIsLoading(false)
      return
    }
    
    // PRODUCTION CODE - Telegram WebApp authentication
    const telegram = (window as any).Telegram?.WebApp

    if (!telegram) {
      console.error("Telegram WebApp is not available - this app must be opened from Telegram")
      logger.error("Telegram WebApp not available", new Error("Not in Telegram WebApp"), { context: "TelegramAuth" })
      setError("This app must be opened from Telegram")
      setIsLoading(false)
      return
    }

    // Log Telegram WebApp info for debugging
    console.log("Telegram WebApp info:", {
      available: !!telegram,
      initDataUnsafe: telegram.initDataUnsafe,
      hasInitData: !!telegram.initData,
      platform: telegram.platform,
      version: telegram.version
    })
    
    logger.info("Initializing Telegram WebApp", { 
      context: "TelegramAuth",
      data: {
        platform: telegram.platform,
        version: telegram.version
      }
    })

    // Initialize Telegram WebApp
    telegram.ready()
    telegram.expand()

    // Verify authentication
    const verifyAuth = async () => {
      try {
        // Try to get initData directly or build it from initDataUnsafe
        const initData = telegram.initData || 
          // Fallback to manually build from initDataUnsafe if available
          (telegram.initDataUnsafe ? 
            new URLSearchParams(
              Object.entries(telegram.initDataUnsafe)
              .map(([key, value]) => {
                // Convert objects to JSON strings and ensure string values
                return [key, value === undefined ? '' : 
                  typeof value === 'object' ? JSON.stringify(value) : 
                  String(value)];
              })
            ).toString() : 
            null);

        if (!initData) {
          console.error("No initData found from Telegram WebApp");
          console.log("Available Telegram WebApp props:", Object.keys(telegram));
          logger.error("No initData available", new Error("Missing initData"), { context: "TelegramAuth" });
          
          // Try to use initDataUnsafe as a fallback
          if (telegram.initDataUnsafe) {
            console.log("Using initDataUnsafe as fallback", telegram.initDataUnsafe);
            logger.info("Attempting auth with initDataUnsafe fallback", { context: "TelegramAuth" });
            
            // Try to authenticate with raw user data if available
            if (telegram.initDataUnsafe.user) {
              const response = await fetch("/api/auth/telegram", {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({ 
                  initData: `user=${JSON.stringify(telegram.initDataUnsafe.user)}&auth_date=${telegram.initDataUnsafe.auth_date || Math.floor(Date.now()/1000)}&hash=direct` 
                }),
              });
              
              if (response.ok) {
                logger.info("Authentication successful with fallback method", { context: "TelegramAuth" });
                setIsAuthenticated(true);
                setIsLoading(false);
                return;
              }
            }
          }
          
          setError("No authentication data found");
          setIsLoading(false);
          return;
        }

        console.log("Sending initData to authentication endpoint");
        logger.info("Sending authentication request", { context: "TelegramAuth" });
        
        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ initData }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          console.error("Authentication failed:", errorData)
          logger.error("Authentication request failed", new Error(errorData.error || "Authentication failed"), { 
            context: "TelegramAuth",
            data: errorData
          });
          throw new Error(errorData.error || "Authentication failed")
        }

        console.log("Authentication successful")
        logger.info("Authentication successful", { context: "TelegramAuth" });
        setIsAuthenticated(true)
      } catch (err) {
        console.error("Authentication error:", err)
        logger.error("Authentication error", err instanceof Error ? err : new Error(String(err)), { 
          context: "TelegramAuth" 
        });
        setError(err instanceof Error ? err.message : "Authentication failed")
      } finally {
        setIsLoading(false)
      }
    }

    verifyAuth()
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
          Try Again yash
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