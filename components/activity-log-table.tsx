"use client"

import React from "react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { 
  Loader2, 
  Check, 
  X, 
  Clock, 
  RefreshCw, 
  AlertCircle,
  ChevronDown,
  ChevronRight
} from "lucide-react"
import { 
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
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

interface ActivityLogTableProps {
  userId: string | number;
}

export function ActivityLogTable({ userId }: ActivityLogTableProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
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
    
    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      fetchLogs(false);
    }, 30000);
    
    return () => clearInterval(interval);
  }, [userId]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchLogs(false);
  };

  // Toggle expanded state for a log entry
  const toggleExpandRow = (logId: string) => {
    setExpandedRows(prev => {
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

  // Format date for more readable display
  const formatDate = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleDateString();
    } catch (e) {
      return "Invalid date";
    }
  };

  // Get status badge
  const getStatusBadge = (status: "success" | "failure" | "pending") => {
    switch (status) {
      case "success":
        return (
          <Badge className="bg-green-500 flex items-center gap-1">
            <Check className="h-3 w-3" />
            <span>Success</span>
          </Badge>
        );
      case "failure":
        return (
          <Badge className="bg-red-500 flex items-center gap-1">
            <X className="h-3 w-3" />
            <span>Failed</span>
          </Badge>
        );
      case "pending":
        return (
          <Badge className="bg-yellow-500 flex items-center gap-1">
            <Clock className="h-3 w-3" />
            <span>Pending</span>
          </Badge>
        );
      default:
        return null;
    }
  };

  // Get action type display
  const formatAction = (action: string) => {
    // Replace underscores with spaces and capitalize each word
    return action.split('_').map(word => 
      word.charAt(0) + word.slice(1).toLowerCase()
    ).join(' ');
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
      <CardHeader className="flex flex-row items-center justify-between pb-4 space-y-0">
        <CardTitle className="text-xl">Bot Activity Log</CardTitle>
        <Button 
          variant="ghost"
          size="sm" 
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1"
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
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
        
        <div className="text-xs text-muted-foreground mb-4">
          Last updated: {lastUpdated.toLocaleTimeString()}
        </div>
        
        {logs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>No bot activity recorded yet</p>
            <p className="text-sm mt-2">Bot activities will appear here once trades start executing</p>
          </div>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]"></TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Token</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <React.Fragment key={log.id}>
                      <TableRow 
                        className={`cursor-pointer hover:bg-muted/50 ${expandedRows.has(log.id) ? 'bg-muted/30' : ''}`}
                        onClick={() => toggleExpandRow(log.id)}
                      >
                        <TableCell>
                          {expandedRows.has(log.id) ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </TableCell>
                        <TableCell>{formatTime(log.timestamp)}</TableCell>
                        <TableCell>{formatAction(log.action)}</TableCell>
                        <TableCell>{log.token}</TableCell>
                        <TableCell>{getStatusBadge(log.status)}</TableCell>
                        <TableCell className="text-right truncate max-w-[150px]">
                          {log.status === "failure" && log.errorMessage ? (
                            <span className="text-red-500">{log.errorMessage.substring(0, 30)}...</span>
                          ) : (
                            log.details.substring(0, 30) + (log.details.length > 30 ? "..." : "")
                          )}
                        </TableCell>
                      </TableRow>
                      
                      {/* Expanded row content */}
                      {expandedRows.has(log.id) && (
                        <TableRow className="bg-muted/20">
                          <TableCell colSpan={6} className="p-0">
                            <div className="p-4 border-t">
                              <div className="grid grid-cols-3 gap-4 mb-2">
                                <div>
                                  <p className="text-sm font-medium mb-1">Date & Time</p>
                                  <p className="text-sm">
                                    {formatDate(log.timestamp)} {formatTime(log.timestamp)}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium mb-1">Token</p>
                                  <p className="text-sm">{log.token}</p>
                                </div>
                                <div>
                                  <p className="text-sm font-medium mb-1">Action</p>
                                  <p className="text-sm">{formatAction(log.action)}</p>
                                </div>
                                {log.price && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">Price</p>
                                    <p className="text-sm">{formatCurrency(log.price)}</p>
                                  </div>
                                )}
                                {log.amount && (
                                  <div>
                                    <p className="text-sm font-medium mb-1">Amount</p>
                                    <p className="text-sm">{log.amount.toFixed(6)}</p>
                                  </div>
                                )}
                                <div>
                                  <p className="text-sm font-medium mb-1">Status</p>
                                  <p className="text-sm flex items-center">
                                    {log.status === "success" && <Check className="h-3 w-3 text-green-500 mr-1" />}
                                    {log.status === "failure" && <X className="h-3 w-3 text-red-500 mr-1" />}
                                    {log.status === "pending" && <Clock className="h-3 w-3 text-yellow-500 mr-1" />}
                                    {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="mb-2">
                                <p className="text-sm font-medium mb-1">Details</p>
                                <p className="text-sm">{log.details}</p>
                              </div>
                              
                              {log.errorMessage && (
                                <div className="mt-2">
                                  <p className="text-sm font-medium text-red-600 mb-1">Error</p>
                                  <div className="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 p-2 rounded-md text-sm">
                                    {log.errorMessage}
                                  </div>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}
      </CardContent>
    </Card>
  );
}