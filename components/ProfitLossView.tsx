"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, TrendingUp, AlertCircle, RefreshCw } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { logger } from "@/lib/logger"
import type { SessionUser } from "@/lib/auth"
import { ExchangeConnectionBanner } from "@/components/exchange-connection-banner"
import PortfolioChart from "./PortfolioChart"
import PortfolioPositions from "./PortfolioPositions"
import { TradesTableSimple } from "./trades-table-simple" // Import TradesTableSimple

interface ProfitLossViewProps {
  user: SessionUser
}

export function ProfitLossView({ user }: ProfitLossViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [portfolioData, setPortfolioData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("positions")
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  
  // Fetch portfolio data - using useCallback to be able to call it from multiple places
  const fetchPortfolioData = useCallback(async (showLoadingState = true) => {
    try {
      if (showLoadingState) {
        setIsLoading(true)
      } else {
        setIsRefreshing(true)
      }
      
      setError(null)
      
      if (!user.exchangeConnected) {
        setIsLoading(false)
        setIsRefreshing(false)
        return
      }
      
      // Fetch portfolio summary
      const response = await fetch('/api/portfolio/summary')
      
      if (!response.ok) {
        throw new Error(`Failed to fetch portfolio summary: ${response.status}`)
      }
      
      const data = await response.json()
      setPortfolioData(data)
      setLastUpdated(new Date())
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load portfolio data"
      setError(errorMessage)
      logger.error(`Error fetching portfolio data: ${errorMessage}`)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [user.exchangeConnected])
  
  // Initial data load and periodic refresh
  useEffect(() => {
    fetchPortfolioData()
    
    // Set up polling to refresh data every 30 seconds
    const refreshInterval = setInterval(() => {
      fetchPortfolioData(false)
    }, 30000)
    
    // Clean up the interval when component unmounts
    return () => clearInterval(refreshInterval)
  }, [fetchPortfolioData])
  
  // Handle manual refresh
  const handleRefresh = () => {
    fetchPortfolioData(false)
  }
  
  if (!user.exchangeConnected) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h2 className="text-xl font-bold mb-4">Profit & Loss</h2>
        <ExchangeConnectionBanner />
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Connect your exchange to view profit and loss data</p>
          </CardContent>
        </Card>
      </div>
    )
  }
  
  if (isLoading && !portfolioData) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h2 className="text-xl font-bold mb-4">Profit & Loss</h2>
        <div className="flex justify-center items-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading portfolio data...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">Profit & Loss</h2>
        <div className="flex items-center gap-2">
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleRefresh} 
            className="h-8 px-2"
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            {isRefreshing ? 'Updating...' : 'Refresh'}
          </Button>
          {portfolioData && portfolioData.totalValue && (
            <div className="text-xl font-bold">
              <span className={portfolioData.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"}>
                {portfolioData.unrealizedPnl >= 0 ? "+" : ""}
                {formatCurrency(portfolioData.unrealizedPnl || 0)}
              </span>
            </div>
          )}
        </div>
      </div>
      
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3 mb-4 text-red-800 flex items-center">
          <AlertCircle className="h-4 w-4 mr-2" />
          {error}
        </div>
      )}
      
      <div className="text-xs text-muted-foreground mb-2">
        Last updated: {lastUpdated.toLocaleTimeString()}
      </div>
      
      {/* Portfolio Summary Card */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle>Portfolio Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total Value</p>
              <p className="text-2xl font-bold">{formatCurrency(portfolioData?.totalValue || 0)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Unrealized P&L</p>
              <p className={`text-2xl font-bold flex items-center ${(portfolioData?.unrealizedPnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                {(portfolioData?.unrealizedPnl || 0) >= 0 ? (
                  <TrendingUp className="h-5 w-5 mr-1" />
                ) : (
                  <AlertCircle className="h-5 w-5 mr-1" />
                )}
                {formatCurrency(portfolioData?.unrealizedPnl || 0)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Realized P&L</p>
              <p className={`text-2xl font-bold ${(portfolioData?.realizedPnl || 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatCurrency(portfolioData?.realizedPnl || 0)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total P&L</p>
              <p className={`text-2xl font-bold ${((portfolioData?.realizedPnl || 0) + (portfolioData?.unrealizedPnl || 0)) >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatCurrency((portfolioData?.realizedPnl || 0) + (portfolioData?.unrealizedPnl || 0))}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
      
      {/* Portfolio Chart */}
      <Card className="mb-6">
        <CardHeader className="pb-2">
          <CardTitle>Portfolio Positions</CardTitle>
        </CardHeader>
        <CardContent>
          <PortfolioChart userId={user.id} />
        </CardContent>
      </Card>
      
      {/* Positions Table Component */}
      <PortfolioPositions userId={user.id} />
      
      {/* Tabs for different views */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-6">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="positions">Positions</TabsTrigger>
          <TabsTrigger value="trades">Recent Trades</TabsTrigger>
        </TabsList>
        
        <TabsContent value="positions">
          {/* Position-specific content is now in the PortfolioPositions component above */}
        </TabsContent>
        
        <TabsContent value="trades">
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle>Recent Trades</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Replace local TradesTable with TradesTableSimple */}
              <TradesTableSimple userId={user.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}