"use client"

import { ExchangeProvider, useExchange } from "@/contexts/ExchangeContext"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dashboard } from "@/components/dashboard"
import { ProfitLossView } from "./ProfitLossView"
import { Settings } from "@/components/settings"
import { OnboardingTutorial } from "@/components/onboarding-tutorial"
import { NotificationBanner } from "@/components/notification-banner"
import { LeaderboardComponent } from "./leaderboard-component" 
import { Badge } from "@/components/ui/badge"
import type { SessionUser } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { formatCurrency } from "@/lib/utils"

export function MainApp() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [activeTab, setActiveTab] = useState("trades")
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const router = useRouter()

  // Fetch user data
  useEffect(() => {
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
  }, [router])

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    logger.info("Onboarding completed", { context: "MainApp", userId: user?.id })
  }

  // Handle switching to settings tab from any component
  const handleSwitchToSettings = () => {
    setActiveTab("settings")
  }

  const refreshUserData = async () => {
    try {
      // Clear any cached response
      const response = await fetch("/api/user", {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache'
        }
      })
      
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        logger.info("User data refreshed successfully", {
          context: "MainApp",
          userId: userData.id,
        })
        
        // If exchange is now connected and wasn't before, fetch portfolio
        if (userData.exchangeConnected && !user?.exchangeConnected) {
          // Reset to show loading state
        }
      }
    } catch (error) {
      logger.error("Error refreshing user data:", error instanceof Error ? error : new Error(String(error)))
    }
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

  if (!user) return null

  return (
    <ExchangeProvider user={user}>
      <MainAppContent
        user={user}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        showOnboarding={showOnboarding}
        setShowOnboarding={setShowOnboarding}
        refreshUserData={refreshUserData}
      />
    </ExchangeProvider>
  )
}

// New component to render UI using ExchangeContext
function MainAppContent({
  user,
  activeTab,
  setActiveTab,
  showOnboarding,
  setShowOnboarding,
  refreshUserData
}: any) {
  const { isConnected, portfolioValue } = useExchange()
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  // Handler to switch to settings tab
  const handleSwitchToSettings = (): void => setActiveTab("settings")

  // Check for unread notifications
  useEffect(() => {
    const checkUnreadNotifications = async () => {
      try {
        const response = await fetch("/api/notifications/unread")
        if (response.ok) {
          const data = await response.json()
          setUnreadNotifications(data.notifications?.length || 0)
        }
      } catch (error) {
        logger.error(`Error checking notifications: ${error instanceof Error ? error.message : 'Unknown'}`)
      }
    }
    checkUnreadNotifications()
    const interval = setInterval(checkUnreadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])


  return (
    <>
      <div className="telegram-app w-full min-h-screen">
        <div className="bg-background border-b py-2 px-4 flex justify-between items-center">
          <h1 className="text-lg font-bold">Cycles.fun</h1>
          {!isConnected ? (
            <button onClick={() => setActiveTab("settings")} className="text-sm text-primary">
              Connect Exchange
            </button>
          ) : (
            <div className="flex items-center">
              {portfolioValue !== null ? (
                <div className="text-sm font-medium">{formatCurrency(portfolioValue)}</div>
              ) : (
                <div className="text-sm text-muted-foreground animate-pulse">Loading...</div>
              )}
            </div>
          )}
        </div>
        <NotificationBanner userId={user.id} />
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
          <TabsContent value="trades" className="flex-1 p-0">
            <Dashboard 
              user={user}
              onExchangeStatusChange={refreshUserData}
              onSwitchToSettings={handleSwitchToSettings} 
            />
          </TabsContent>
          
          <TabsContent value="leaders" className="flex-1 p-0">
            <LeaderboardComponent />
          </TabsContent>
          
          <TabsContent value="pnl" className="flex-1 p-0">
            <ProfitLossView 
              user={user} 
              onSwitchToSettings={() => setActiveTab("settings")}
            />
          </TabsContent>
          
          <TabsContent value="settings" className="flex-1 p-0">
            {!user.exchangeConnected && activeTab === "settings" ? (
              <div className="container mx-auto p-4">
                <h2 className="text-xl font-bold mb-4">Connect Your Exchange</h2>
                <Settings user={user} onUpdateSuccess={refreshUserData} />
              </div>
            ) : (
              <Settings user={user} onUpdateSuccess={refreshUserData} />
            )}
          </TabsContent>

          <TabsList className="grid grid-cols-4 h-16 fixed bottom-0 left-0 right-0 rounded-none border-t z-50 bg-background">
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="leaders">Leaders</TabsTrigger>
            <TabsTrigger value="pnl">PnL</TabsTrigger>
            <TabsTrigger value="settings" className="relative">
              Settings
              {unreadNotifications > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-red-500 text-white h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {showOnboarding && <OnboardingTutorial onComplete={() => setShowOnboarding(false)} />}
    </>
  )
}