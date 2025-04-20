"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dashboard } from "@/components/dashboard"
import { Portfolio } from "@/components/portfolio"
import { Leaderboard } from "@/components/leaderboard"
import { Settings } from "@/components/settings"
import { ExchangeSetup } from "@/components/exchange-setup"
import { OnboardingTutorial } from "@/components/onboarding-tutorial"
import { useSocketStore } from "@/lib/socket-client"
import type { SessionUser } from "@/lib/auth"
import { logger } from "@/lib/logger"

export function MainApp() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [activeTab, setActiveTab] = useState("dashboard")
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const router = useRouter()
  const { connect, disconnect } = useSocketStore()

  useEffect(() => {
    // Fetch user data
    const fetchUser = async () => {
      try {
        const response = await fetch("/api/user")
        if (!response.ok) {
          throw new Error("Failed to fetch user data")
        }
  
        const userData = await response.json()
        setUser(userData)
        logger.info("User data fetched successfully", {
          context: "MainApp",
          userId: userData.id,
        })
  
        // If exchange is not connected, force the settings tab
        if (!userData.exchangeConnected) {
          setActiveTab("settings")
        }
  
        // Check if this is the user's first visit
        const hasCompletedOnboarding = localStorage.getItem("onboarding_completed")
        if (!hasCompletedOnboarding) {
          setShowOnboarding(true)
        }
      } catch (error) {
        logger.error("Error fetching user:", error instanceof Error ? error : new Error(String(error)), {
          context: "MainApp",
        })
      } finally {
        setIsLoading(false)
      }
    }
  
    fetchUser()
  
    // Initialize socket connection - safely
    const initSocket = async () => {
      try {
        if (process.env.NODE_ENV === "development") {
          // In development, don't even try to initialize the socket server
          logger.info("Skipping socket initialization in development", { context: "MainApp" });
        } else {
          await fetch("/api/socket")
          logger.info("Socket API initialized", { context: "MainApp" })
        }
      } catch (error) {
        logger.error("Error initializing socket API:", error instanceof Error ? error : new Error(String(error)), {
          context: "MainApp",
        })
      }
    }
  
    initSocket()
  
    // Cleanup on unmount
    return () => {
      disconnect()
    }
  }, [router, disconnect])
  
  // Connect to socket when user data is available - safely
  useEffect(() => {
    if (user) {
      connect(user.id.toString())
      logger.info("Socket connected for user", { context: "MainApp", userId: user.id })
    }
  }, [user, connect])

  // Connect to socket when user data is available
  useEffect(() => {
    if (user) {
      connect(user.id.toString())
      logger.info("Socket connected for user", { context: "MainApp", userId: user.id })
    }
  }, [user, connect])

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    logger.info("Onboarding completed", { context: "MainApp", userId: user?.id })
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center">
          <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          <p className="mt-4 text-muted-foreground">Loading your dashboard...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return null // Or a more detailed error state
  }

  // If exchange is not connected, show the exchange setup screen
  if (!user.exchangeConnected) {
    return (
      <>
        <ExchangeSetup user={user} onComplete={() => setActiveTab("dashboard")} />
        {showOnboarding && <OnboardingTutorial onComplete={handleOnboardingComplete} />}
      </>
    )
  }

  return (
    <>
      <div className="telegram-app">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
          <TabsContent value="dashboard" className="flex-1 p-0">
            <Dashboard user={user} />
          </TabsContent>
          <TabsContent value="portfolio" className="flex-1 p-0">
            <Portfolio user={user} />
          </TabsContent>
          <TabsContent value="leaderboard" className="flex-1 p-0">
            <Leaderboard />
          </TabsContent>
          <TabsContent value="settings" className="flex-1 p-0">
            <Settings user={user} />
          </TabsContent>

          <TabsList className="grid grid-cols-4 h-16 fixed bottom-0 left-0 right-0 rounded-none border-t">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {showOnboarding && <OnboardingTutorial onComplete={handleOnboardingComplete} />}
    </>
  )
}
