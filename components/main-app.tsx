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
import { NotificationBanner } from "@/components/notification-banner"
import { NotificationsPage } from "@/components/notifications-page"
import { Badge } from "@/components/ui/badge"
import { Bell } from "lucide-react"
import { useSocketStore } from "@/lib/socket-client"
import type { SessionUser } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { toast } from "sonner"
import { telegramService } from "@/lib/telegram-service"

export function MainApp() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [activeTab, setActiveTab] = useState("dashboard")
  const [isLoading, setIsLoading] = useState(true)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const router = useRouter()
  const { connect, disconnect, socket } = useSocketStore()

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

    // Initialize socket connection
    const initSocket = async () => {
      try {
        await fetch("/api/socket")
        logger.info("Socket API initialized", { context: "MainApp" })
      } catch (error) {
        logger.error("Error initializing socket API:", error instanceof Error ? error : new Error(String(error)), {
          context: "MainApp",
        })
      }
    }

    initSocket()

    // Check for notifications
    checkUnreadNotifications()
    
    // Set up polling for notifications
    const notificationInterval = setInterval(checkUnreadNotifications, 30000)

    // Cleanup on unmount
    return () => {
      disconnect()
      clearInterval(notificationInterval)
    }
  }, [router, disconnect])

  // Connect to socket when user data is available
  useEffect(() => {
    if (user) {
      connect(user.id.toString())
      logger.info("Socket connected for user", { context: "MainApp", userId: user.id })
      
      // Setup socket event listeners for notifications
      if (socket) {
        socket.on("new-signal", (signal) => {
          // Show toast notification when a new signal arrives via socket
          toast(`New ${signal.type} signal for ${signal.token}`, {
            action: {
              label: "View",
              onClick: () => {
                setActiveTab("dashboard")
              }
            }
          })
          
          // Increment unread count
          setUnreadNotifications(prev => prev + 1)
          
          // Try to use Telegram's native notification if available
          telegramService.triggerHapticFeedback('notification')
          telegramService.showPopup(
            `🔔 New ${signal.type} signal for ${signal.token} at ${signal.price}`,
            [{ type: "default", text: "View Signal" }],
            () => {
              setActiveTab("dashboard")
            }
          )
        })
        
        // Listen for notification events
        socket.on("notification", (notification) => {
          if (!notification.read) {
            // Increment unread count
            setUnreadNotifications(prev => prev + 1)
            
            // Show toast
            toast(notification.message, {
              action: {
                label: "View",
                onClick: () => {
                  setActiveTab("notifications")
                }
              }
            })
          }
        })
      }
    }
  }, [user, connect, socket])

  // Handle onboarding completion
  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    logger.info("Onboarding completed", { context: "MainApp", userId: user?.id })
  }

  // Handle tab change
  const handleTabChange = (value: string) => {
    setActiveTab(value)
    
    // If switching to notifications tab, reset the unread count
    if (value === "notifications") {
      setUnreadNotifications(0)
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

  // Show the main app UI regardless of exchange connection status
  return (
    <>
      <div className="telegram-app">
        {/* Add NotificationBanner at the top level so it can appear regardless of tab */}
        <NotificationBanner userId={user.id} />
        
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full flex-1 flex flex-col">
          <TabsContent value="dashboard" className="flex-1 p-0">
            <Dashboard user={user} socket={socket} />
          </TabsContent>
          <TabsContent value="portfolio" className="flex-1 p-0">
            <Portfolio user={user} socket={socket} />
          </TabsContent>
          <TabsContent value="notifications" className="flex-1 p-0">
            <NotificationsPage userId={user.id} />
          </TabsContent>
          <TabsContent value="leaderboard" className="flex-1 p-0">
            <Leaderboard />
          </TabsContent>
          <TabsContent value="settings" className="flex-1 p-0">
            {!user.exchangeConnected && activeTab === "settings" ? (
              <ExchangeSetup user={user} onComplete={() => router.refresh()} />
            ) : (
              <Settings user={user} />
            )}
          </TabsContent>

          <TabsList className="grid grid-cols-5 h-16 fixed bottom-0 left-0 right-0 rounded-none border-t">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
            <TabsTrigger value="notifications" className="relative">
              Notifications
              {unreadNotifications > 0 && (
                <Badge className="absolute -top-2 -right-2 bg-red-500 text-white h-5 min-w-5 flex items-center justify-center p-0 text-xs">
                  {unreadNotifications > 99 ? '99+' : unreadNotifications}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {showOnboarding && <OnboardingTutorial onComplete={handleOnboardingComplete} />}
    </>
  )
}