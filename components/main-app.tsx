"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dashboard } from "@/components/dashboard"
import { Portfolio } from "@/components/portfolio"
import { ProfitLossView } from "./ProfitLossView"
import { Settings } from "@/components/settings"
import { OnboardingTutorial } from "@/components/onboarding-tutorial"
import { NotificationBanner } from "@/components/notification-banner"
import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useSocketStore } from "@/lib/socket-client"
import type { SessionUser } from "@/lib/auth"
import { logger } from "@/lib/logger"
import { toast } from "sonner"
import { telegramService } from "@/lib/telegram-service"

export function MainApp() {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [activeTab, setActiveTab] = useState("trades")
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
                setActiveTab("trades")
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
              setActiveTab("trades")
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
          {!user.exchangeConnected && (
            <button 
              onClick={() => setActiveTab("settings")}
              className="text-sm text-primary"
            >
              Connect Wallet
            </button>
          )}
        </div>
        
        {/* Add NotificationBanner at the top level */}
        <NotificationBanner userId={user.id} />
        
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full flex-1 flex flex-col">
          <TabsContent value="trades" className="flex-1 p-0">
            <Dashboard user={user} socket={socket} />
          </TabsContent>
          
          <TabsContent value="leaders" className="flex-1 p-0">
            <div className="container mx-auto p-4">
              <h2 className="text-xl font-bold mb-4">Leaderboard</h2>
              <div className="divide-y border rounded-md">
                {Array.from({length: 3}).map((_, i) => (
                  <div key={i} className="flex items-center justify-between p-4">
                    <div className="flex items-center">
                      <div className="w-10 h-10 rounded-full bg-gray-200 mr-3"></div>
                      <div>
                        <p className="font-medium">Moritz</p>
                        <p className="text-sm text-muted-foreground">2,574 Trades</p>
                      </div>
                    </div>
                    <div className="text-green-500 font-bold">+78%</div>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="pnl" className="flex-1 p-0">
            <ProfitLossView user={user} socket={socket} />
          </TabsContent>
          
          <TabsContent value="settings" className="flex-1 p-0">
            {!user.exchangeConnected && activeTab === "settings" ? (
              <div className="container mx-auto p-4">
                <h2 className="text-xl font-bold mb-4">Connect Your Exchange</h2>
                <Settings user={user} />
              </div>
            ) : (
              <Settings user={user} />
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