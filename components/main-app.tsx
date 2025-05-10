"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dashboard } from "@/components/dashboard"
import { Portfolio } from "@/components/portfolio"
import { ProfitLossView } from "./ProfitLossView"
import { Settings } from "@/components/settings"
import { OnboardingTutorial } from "@/components/onboarding-tutorial"
import { NotificationBanner } from "@/components/notification-banner"
import { LeaderboardComponent } from "./leaderboard-component" 
import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { SessionUser } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { toast } from "sonner"
import { telegramService } from "@/lib/telegram-service"
import { formatCurrency } from "@/lib/utils"

export function MainApp() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [activeTab, setActiveTab] = useState("trades")
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null)
  const [isLoadingPortfolio, setIsLoadingPortfolio] = useState(false)
  const router = useRouter()

  // Check for unread notifications
  const checkUnreadNotifications = async () => {
    try {
      const response = await fetch("/api/notifications/unread")
      if (response.ok) {
        const data = await response.json()
        if (data.notifications) {
          setUnreadNotifications(data.notifications.length)
        }
      }
    } catch (error) {
      logger.error(`Error checking unread notifications: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Fetch portfolio summary data
  const fetchPortfolioSummary = useCallback(async () => {
    if (!user?.exchangeConnected) return

    try {
      setIsLoadingPortfolio(true)
      const response = await fetch("/api/portfolio/summary")
      if (response.ok) {
        const data = await response.json()
        if (data.totalValue !== undefined) {
          setPortfolioValue(data.totalValue)
          logger.info("Portfolio summary fetched successfully", {
            context: "MainApp",
          })
        }
      }
    } catch (error) {
      logger.error(`Error fetching portfolio summary: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoadingPortfolio(false)
    }
  }, [user?.exchangeConnected])

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

    // Check for notifications
    checkUnreadNotifications()
    
    // Set up polling for notifications
    const notificationInterval = setInterval(checkUnreadNotifications, 30000)

    // Cleanup on unmount
    return () => {
      clearInterval(notificationInterval)
    }
  }, [router])

  // Fetch portfolio value when user is loaded or connection status changes
  useEffect(() => {
    if (user?.exchangeConnected) {
      fetchPortfolioSummary()
      
      // Refresh portfolio value every 2 minutes
      const portfolioInterval = setInterval(fetchPortfolioSummary, 120000)
      
      return () => {
        clearInterval(portfolioInterval)
      }
    }
  }, [user?.exchangeConnected, fetchPortfolioSummary])

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    logger.info("Onboarding completed", { context: "MainApp", userId: user?.id })
  }

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value)
  }

  // Handle switching to settings tab from any component
  const handleSwitchToSettings = () => {
    setActiveTab("settings")
  }

  // Refresh user data (useful after connecting exchange)
  const refreshUserData = async () => {
    try {
      const response = await fetch("/api/user")
      if (response.ok) {
        const userData = await response.json()
        setUser(userData)
        logger.info("User data refreshed successfully", {
          context: "MainApp",
          userId: userData.id,
        })
        
        // Also refresh portfolio if exchange is connected
        if (userData.exchangeConnected) {
          fetchPortfolioSummary()
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

  if (!user) {
    return null // Or a more detailed error state
  }

  // Show the main app UI
  return (
    <>
      <div className="telegram-app w-full min-h-screen">
        {/* Add header with app name */}
        <div className="bg-background border-b py-2 px-4 flex justify-between items-center">
          <h1 className="text-lg font-bold">Cycles.fun</h1>
          {!user.exchangeConnected ? (
            <button 
              onClick={() => setActiveTab("settings")}
              className="text-sm text-primary"
            >
              Connect Exchange
            </button>
          ) : (
            <div className="flex items-center">
              {isLoadingPortfolio ? (
                <div className="text-sm text-muted-foreground animate-pulse">Loading...</div>
              ) : portfolioValue !== null ? (
                <div className="text-sm font-medium">{formatCurrency(portfolioValue)}</div>
              ) : null}
            </div>
          )}
        </div>
        
        {/* Add NotificationBanner at the top level */}
        <NotificationBanner userId={user.id} />
        
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full flex-1 flex flex-col">
          <TabsContent value="trades" className="flex-1 p-0">
            <Dashboard 
              user={user}
              onExchangeStatusChange={refreshUserData}
              onSwitchToSettings={handleSwitchToSettings} // Pass the handler to switch tabs
            />
          </TabsContent>
          
          <TabsContent value="leaders" className="flex-1 p-0">
            <LeaderboardComponent />
          </TabsContent>
          
          <TabsContent value="pnl" className="flex-1 p-0">
            <ProfitLossView user={user} />
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
      {showOnboarding && <OnboardingTutorial onComplete={handleOnboardingComplete} />}
    </>
  )
}