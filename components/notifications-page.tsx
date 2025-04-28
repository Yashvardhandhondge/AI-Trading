"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Bell, AlertCircle, Loader2, Check, ArrowRight, RefreshCw } from "lucide-react"
import { logger } from "@/lib/logger"
import { useRouter } from "next/navigation"

interface Notification {
  id: string
  message: string
  type: "signal" | "trade" | "cycle" | "system"
  read: boolean
  relatedId?: string
  createdAt: string
}

interface NotificationsPageProps {
  userId: number
}

export function NotificationsPage({ userId }: NotificationsPageProps) {
  // const [notifications, setNotifications] = useState<Notification[]>([])
  // const [isLoading, setIsLoading] = useState(true)
  // const [activeTab, setActiveTab] = useState("all")
  // const [error, setError] = useState<string | null>(null)
  // const router = useRouter()

  // const fetchNotifications = async () => {
  //   try {
  //     setIsLoading(true)
  //     setError(null)
      
  //     // Get all notifications
  //     const response = await fetch("/api/notifications")
      
  //     if (!response.ok) {
  //       throw new Error(`Failed to fetch notifications: ${response.status}`)
  //     }
      
  //     const data = await response.json()
  //     setNotifications(data.notifications || [])
  //   } catch (err) {
  //     setError(err instanceof Error ? err.message : "Failed to load notifications")
  //     logger.error(`Error fetching notifications: ${err instanceof Error ? err.message : "Unknown error"}`)
  //   } finally {
  //     setIsLoading(false)
  //   }
  // }

  // // Mark a notification as read
  // const markAsRead = async (notificationId: string) => {
  //   try {
  //     const response = await fetch(`/api/notifications/${notificationId}/read`, {
  //       method: "POST"
  //     })
      
  //     if (!response.ok) {
  //       throw new Error(`Failed to mark notification as read: ${response.status}`)
  //     }
      
  //     // Update local state
  //     setNotifications(prevNotifications => 
  //       prevNotifications.map(notification => 
  //         notification.id === notificationId 
  //           ? { ...notification, read: true } 
  //           : notification
  //       )
  //     )
  //   } catch (err) {
  //     logger.error(`Error marking notification as read: ${err instanceof Error ? err.message : "Unknown error"}`)
  //   }
  // }

  // // Mark all notifications as read
  // const markAllAsRead = async () => {
  //   try {
  //     const response = await fetch(`/api/notifications/read-all`, {
  //       method: "POST"
  //     })
      
  //     if (!response.ok) {
  //       throw new Error(`Failed to mark all notifications as read: ${response.status}`)
  //     }
      
  //     // Update local state
  //     setNotifications(prevNotifications => 
  //       prevNotifications.map(notification => ({ ...notification, read: true }))
  //     )
  //   } catch (err) {
  //     logger.error(`Error marking all notifications as read: ${err instanceof Error ? err.message : "Unknown error"}`)
  //   }
  // }

  // // Handle notification click
  // const handleNotificationClick = async (notification: Notification) => {
  //   // Mark as read
  //   await markAsRead(notification.id)
    
  //   // Navigate based on notification type
  //   if (notification.type === "signal") {
  //     router.push("/")
  //   } else if (notification.type === "trade") {
  //     router.push("/portfolio")
  //   } else if (notification.type === "cycle") {
  //     router.push("/portfolio")
  //   }
  // }

  // // Filter notifications based on active tab
  // const getFilteredNotifications = () => {
  //   if (activeTab === "all") {
  //     return notifications
  //   }
    
  //   if (activeTab === "unread") {
  //     return notifications.filter(notification => !notification.read)
  //   }
    
  //   return notifications.filter(notification => notification.type === activeTab)
  // }

  // // Format date
  // const formatDate = (dateString: string) => {
  //   const date = new Date(dateString)
  //   const now = new Date()
  //   const diffMs = now.getTime() - date.getTime()
  //   const diffMins = Math.round(diffMs / 60000)
    
  //   if (diffMins < 1) return "Just now"
  //   if (diffMins < 60) return `${diffMins}m ago`
    
  //   const diffHours = Math.floor(diffMins / 60)
  //   if (diffHours < 24) return `${diffHours}h ago`
    
  //   const diffDays = Math.floor(diffHours / 24)
  //   if (diffDays < 7) return `${diffDays}d ago`
    
  //   return date.toLocaleDateString()
  // }
  
  // // Get notification icon and color based on type
  // const getNotificationStyle = (notification: Notification) => {
  //   switch (notification.type) {
  //     case "signal":
  //       return { 
  //         icon: <Bell className="h-5 w-5" />, 
  //         color: "text-blue-500", 
  //         bgColor: "bg-blue-100 dark:bg-blue-900/50" 
  //       }
  //     case "trade":
  //       return { 
  //         icon: <ArrowRight className="h-5 w-5" />, 
  //         color: "text-green-500", 
  //         bgColor: "bg-green-100 dark:bg-green-900/50" 
  //       }
  //     case "cycle":
  //       return { 
  //         icon: <RefreshCw className="h-5 w-5" />, 
  //         color: "text-purple-500", 
  //         bgColor: "bg-purple-100 dark:bg-purple-900/50" 
  //       }
  //     default:
  //       return { 
  //         icon: <AlertCircle className="h-5 w-5" />, 
  //         color: "text-amber-500", 
  //         bgColor: "bg-amber-100 dark:bg-amber-900/50" 
  //       }
  //   }
  // }

  // useEffect(() => {
  //   fetchNotifications()
    
  //   // Refresh every 60 seconds
  //   const intervalId = setInterval(fetchNotifications, 60000)
    
  //   return () => clearInterval(intervalId)
  // }, [userId])

  // const filteredNotifications = getFilteredNotifications()
  // const unreadCount = notifications.filter(notification => !notification.read).length

  // if (isLoading) {
  //   return (
  //     <div className="flex justify-center items-center p-8">
  //       <Loader2 className="h-8 w-8 animate-spin text-primary mr-2" />
  //       <span>Loading notifications...</span>
  //     </div>
  //   )
  // }

  // return (
  //   <div className="container mx-auto p-4 pb-20">
  //     <div className="flex justify-between items-center mb-4">
  //       <h1 className="text-2xl font-bold">Notifications</h1>
  //       {unreadCount > 0 && (
  //         <Button variant="outline" size="sm" onClick={markAllAsRead}>
  //           <Check className="h-4 w-4 mr-2" />
  //           Mark all as read
  //         </Button>
  //       )}
  //     </div>

  //     <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
  //       <TabsList className="grid w-full grid-cols-4 mb-4">
  //         <TabsTrigger value="all">
  //           All
  //           {notifications.length > 0 && (
  //             <Badge variant="outline" className="ml-2">
  //               {notifications.length}
  //             </Badge>
  //           )}
  //         </TabsTrigger>
  //         <TabsTrigger value="unread">
  //           Unread
  //           {unreadCount > 0 && (
  //             <Badge variant="outline" className="ml-2 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
  //               {unreadCount}
  //             </Badge>
  //           )}
  //         </TabsTrigger>
  //         <TabsTrigger value="signal">Signals</TabsTrigger>
  //         <TabsTrigger value="trade">Trades</TabsTrigger>
  //       </TabsList>

  //       <TabsContent value={activeTab}>
  //         {filteredNotifications.length > 0 ? (
  //           <div className="space-y-3">
  //             {filteredNotifications.map((notification) => {
  //               const { icon, color, bgColor } = getNotificationStyle(notification)
                
  //               return (
  //                 <Card 
  //                   key={notification.id} 
  //                   className={`cursor-pointer hover:bg-muted/50 ${!notification.read ? 'border-l-4 border-l-blue-500' : ''}`}
  //                   onClick={() => handleNotificationClick(notification)}
  //                 >
  //                   <CardContent className="p-4 flex items-center">
  //                     <div className={`${bgColor} rounded-full p-2 mr-3 ${color}`}>
  //                       {icon}
  //                     </div>
  //                     <div className="flex-1">
  //                       <p className={`${!notification.read ? 'font-medium' : ''}`}>
  //                         {notification.message}
  //                       </p>
  //                       <p className="text-sm text-muted-foreground">
  //                         {formatDate(notification.createdAt)}
  //                       </p>
  //                     </div>
  //                     <div>
  //                       {!notification.read && (
  //                         <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
  //                           New
  //                         </Badge>
  //                       )}
  //                     </div>
  //                   </CardContent>
  //                 </Card>
  //               )
  //             })}
  //           </div>
  //         ) : (
  //           <Card>
  //             <CardContent className="p-6 text-center">
  //               <p className="text-muted-foreground">No notifications found</p>
  //             </CardContent>
  //           </Card>
  //         )}
  //       </TabsContent>
  //     </Tabs>
  //   </div>
  // )
  return null;
  
}