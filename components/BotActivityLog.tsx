"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Check, X, Clock, RefreshCw, AlertCircle } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { formatCurrency } from "@/lib/utils"
import { logger } from "@/lib/logger"

interface LogEntry {
  id: string;
  timestamp: string;
  action: string;
  token: string;
  status: "success" | "failure" | "pending";
  details: string;
  price?: number;
  amount?: number;
  errorMessage?: string;
}

interface ActivityLogProps {
  userId: string | number;
}

export function BotActivityLog({ userId }: ActivityLogProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  // Fetch log data
  const fetchLogs = async (showLoadingState = true) => {
    try {
      if (showLoadingState) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      
      const response = await fetch(`/api/bot/activity-log?userId=${userId}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch activity logs: ${response.status}`);
      }
      
      const data = await response.json();
      
      if (data.logs && Array.isArray(data.logs)) {
        setLogs(data.logs);
      } else {
        setLogs([]);
      }
      
      setLastUpdated(new Date());
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load activity logs";
      setError(errorMessage);
      logger.error(`Error fetching activity logs: ${errorMessage}`);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  // Load logs on initial render
  useEffect(() => {
    fetchLogs();
    
    // Poll for updates every 60 seconds
    const interval = setInterval(() => {
      fetchLogs(false);
    }, 60000);
    
    return () => clearInterval(interval);
  }, [userId]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchLogs(false);
  };

  // Toggle expanded state for a log entry
  const toggleExpand = (logId: string) => {
    setExpandedLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  // Format timestamp
  const formatTime = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
      return "Invalid time";
    }
  };

  // Get status icon
  const getStatusIcon = (status: "success" | "failure" | "pending") => {
    switch (status) {
      case "success":
        return <Check className="h-4 w-4 text-green-500" />;
      case "failure":
        return <X className="h-4 w-4 text-red-500" />;
      case "pending":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  // Get status badge
  const getStatusBadge = (status: "success" | "failure" | "pending") => {
    switch (status) {
      case "success":
        return <Badge className="bg-green-500">Success</Badge>;
      case "failure":
        return <Badge className="bg-red-500">Failed</Badge>;
      case "pending":
        return <Badge className="bg-yellow-500">Pending</Badge>;
      default:
        return null;
    }
  };

  // If no user ID, return nothing
  if (!userId) {
    return null;
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Bot Activity Log</CardTitle>
        </CardHeader>
        <CardContent className="flex justify-center items-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading activity logs...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
        <CardTitle className="text-xl">Bot Activity Log</CardTitle>
        <Button 
          variant="ghost"
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4">
            <div className="flex items-center text-red-800">
              <AlertCircle className="h-4 w-4 mr-2" />
              <p>{error}</p>
            </div>
          </div>
        )}
        
        <div className="text-xs text-muted-foreground mb-2">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
        
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No bot activity recorded yet</p>
            <p className="text-sm mt-2">Bot activities will appear here once trades start executing</p>
          </div>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <Collapsible
                key={log.id}
                open={expandedLogs.has(log.id)}
                onOpenChange={() => toggleExpand(log.id)}
                className="border rounded-md overflow-hidden"
              >
                <CollapsibleTrigger asChild>
                  <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50">
                    <div className="flex items-center">
                      {getStatusIcon(log.status)}
                      <span className="ml-2 font-medium">{log.action}</span>
                      <span className="ml-2 text-sm">{log.token}</span>
                    </div>
                    <div className="flex items-center">
                      <span className="text-sm text-muted-foreground mr-2">
                        {formatTime(log.timestamp)}
                      </span>
                      {getStatusBadge(log.status)}
                    </div>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="p-3 pt-0 border-t bg-muted/10">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-muted-foreground">Timestamp:</span>
                        <span className="ml-2">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Action:</span>
                        <span className="ml-2">{log.action}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Token:</span>
                        <span className="ml-2">{log.token}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Status:</span>
                        <span className="ml-2 flex items-center">
                          {getStatusIcon(log.status)}
                          <span className="ml-1">
                            {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                          </span>
                        </span>
                      </div>
                      {log.price && (
                        <div>
                          <span className="text-muted-foreground">Price:</span>
                          <span className="ml-2">{formatCurrency(log.price)}</span>
                        </div>
                      )}
                      {log.amount && (
                        <div>
                          <span className="text-muted-foreground">Amount:</span>
                          <span className="ml-2">{log.amount.toFixed(6)}</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      <span className="text-muted-foreground">Details:</span>
                      <p className="mt-1">{log.details}</p>
                    </div>
                    {log.errorMessage && (
                      <div className="mt-2">
                        <span className="text-destructive">Error:</span>
                        <p className="mt-1 text-destructive">{log.errorMessage}</p>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
    )
    }