"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2 } from "lucide-react"

interface TelegramAuthWrapperProps {
  children: React.ReactNode
}

export function TelegramAuthWrapper({ children }: TelegramAuthWrapperProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    // For development, you can bypass Telegram authentication
    const isDevelopment = process.env.NODE_ENV === "development"
    
    if (isDevelopment) {
      // In development, simulate successful authentication
      const mockAuthForDev = async () => {
        try {
          // Call your auth endpoint with mock data
          const response = await fetch("/api/auth/telegram", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              // Mock initData for development
              initData: "query_id=AAHdF6IQAAAAAN0XohBnVaDf&user=%7B%22id%22%3A123456789%2C%22first_name%22%3A%22Test%22%2C%22last_name%22%3A%22User%22%2C%22username%22%3A%22testuser%22%2C%22language_code%22%3A%22en%22%7D&auth_date=1677858000&hash=aabbccddeeff"
            }),
          })

          if (!response.ok) {
            throw new Error("Development auth simulation failed")
          }

          setIsAuthenticated(true)
        } catch (err) {
          setError("Development auth simulation failed")
        } finally {
          setIsLoading(false)
        }
      }
      
      mockAuthForDev()
      return
    }
    
    // PRODUCTION CODE BELOW - actual Telegram WebApp authentication
    // Check if Telegram WebApp is available
    const telegram = (window as any).Telegram?.WebApp

    if (!telegram) {
      setError("This app must be opened from Telegram")
      setIsLoading(false)
      return
    }

    // Initialize Telegram WebApp
    telegram.ready()
    telegram.expand()

    // Verify authentication
    const verifyAuth = async () => {
      try {
        const initData = telegram.initData

        if (!initData) {
          setError("No authentication data found")
          setIsLoading(false)
          return
        }

        const response = await fetch("/api/auth/telegram", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ initData }),
        })

        if (!response.ok) {
          const data = await response.json()
          throw new Error(data.error || "Authentication failed")
        }

        setIsAuthenticated(true)
      } catch (err) {
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
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Authenticating...</span>
      </div>
    )
  }

  if (error || !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Authentication Error</CardTitle>
            <CardDescription>There was a problem authenticating with Telegram</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">{error || "Please try opening this app from Telegram"}</p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => window.location.reload()} className="w-full">
              Try Again
            </Button>
          </CardFooter>
        </Card>
      </div>
    )
  }

  return <>{children}</>
}