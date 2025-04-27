"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bell, X, ArrowRight } from "lucide-react"
import { toast } from "sonner" // Make sure to install this package
import { useRouter } from "next/navigation"
import { logger } from "@/lib/logger"

interface Notification {
  id: string
  message: string
  type: "signal" | "trade" | "cycle" | "system"
  createdAt: string
  read: boolean
  relatedId?: string
}

interface NotificationBannerProps {
  userId: number
}

export function NotificationBanner({ userId }: NotificationBannerProps) {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [activeNotification, setActiveNotification] = useState<Notification | null>(null)
  const [showBanner, setShowBanner] = useState(false)
  const router = useRouter()

  // Fetch notifications
  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/notifications/unread")
      if (response.ok) {
        const data = await response.json()
        if (data.notifications && data.notifications.length > 0) {
          setNotifications(data.notifications)
          // Set the most recent notification as active
          const mostRecent = data.notifications[0]
          setActiveNotification(mostRecent)
          setShowBanner(true)
          
          // Show as toast as well for extra visibility
          if (mostRecent.type === "signal") {
            toast(mostRecent.message, {
              action: {
                label: "View Signal",
                onClick: () => router.push("/"),
              },
            })
            
            // If possible, trigger Telegram notification
            triggerTelegramNotification(mostRecent.message)
          }
        }
      }
    } catch (error) {
      logger.error(`Error fetching notifications: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Trigger a native Telegram notification if available
  const triggerTelegramNotification = (message: string) => {
    try {
      if (window.Telegram && window.Telegram.WebApp) {
        // Try to show notification via Telegram
        if (window.Telegram.WebApp.showPopup) {
          window.Telegram.WebApp.showPopup({
            message: message,
            buttons: [{ type: "default", text: "View Signal" }]
          }, () => {
            router.push("/")
          })
        } else {
          // Fallback for some clients
          window.Telegram.WebApp.HapticFeedback.notificationOccurred('success')
        }
      }
    } catch (error) {
      logger.error(`Error triggering Telegram notification: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Mark notification as read
  const markAsRead = async (notificationId: string) => {
    try {
      await fetch(`/api/notifications/${notificationId}/read`, {
        method: "POST",
      })
      
      // Remove from local state
      setNotifications(prevNotifications => 
        prevNotifications.filter(n => n.id !== notificationId)
      )
      
      // If it was the active notification, show the next one
      if (activeNotification && activeNotification.id === notificationId) {
        if (notifications.length > 1) {
          setActiveNotification(notifications[1])
        } else {
          setActiveNotification(null)
          setShowBanner(false)
        }
      }
    } catch (error) {
      logger.error(`Error marking notification as read: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Handle viewing signal
  const handleViewSignal = () => {
    if (!activeNotification) return
    
    router.push("/")
    markAsRead(activeNotification.id)
  }

  // Handle dismiss
  const handleDismiss = () => {
    if (!activeNotification) return
    markAsRead(activeNotification.id)
  }

  // Poll for new notifications
  useEffect(() => {
    fetchNotifications()
    
    // Poll every 30 seconds for new notifications
    const intervalId = setInterval(fetchNotifications, 30000)
    
    // Clear on unmount
    return () => clearInterval(intervalId)
  }, [userId])

  if (!showBanner || !activeNotification) {
    return null
  }

  return (
    <Card className={`fixed top-4 left-4 right-4 z-50 shadow-lg ${activeNotification.type === 'signal' ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30' : 'border-green-500 bg-green-50 dark:bg-green-950/30'}`}>
      <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between">
        <div className="flex items-center mb-3 sm:mb-0">
          <div className={`rounded-full ${activeNotification.type === 'signal' ? 'bg-blue-100 dark:bg-blue-900' : 'bg-green-100 dark:bg-green-900'} p-2 mr-3`}>
            <Bell className={`h-5 w-5 ${activeNotification.type === 'signal' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`} />
          </div>
          <div>
            <h3 className={`font-medium ${activeNotification.type === 'signal' ? 'text-blue-800 dark:text-blue-300' : 'text-green-800 dark:text-green-300'}`}>
              {activeNotification.type === 'signal' ? 'New Signal Available' : 'Notification'}
            </h3>
            <p className={`text-sm ${activeNotification.type === 'signal' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
              {activeNotification.message}
            </p>
          </div>
        </div>
        <div className="flex space-x-2">
          {activeNotification.type === 'signal' && (
            <Button 
              className={`${activeNotification.type === 'signal' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'} text-white`}
              onClick={handleViewSignal}
            >
              View Signal
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={handleDismiss}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}