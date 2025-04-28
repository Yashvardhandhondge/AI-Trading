"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, TrendingUp, TrendingDown, ExternalLink, RefreshCw } from "lucide-react"
import type { SessionUser } from "@/lib/auth"
import { formatCurrency } from "@/lib/utils"
import { tradingProxy } from "@/lib/trading-proxy"
import { logger } from "@/lib/logger"
import { ExchangeConnectionBanner } from "@/components/exchange-connection-banner"
import { Button } from "@/components/ui/button"

interface UserHolding {
  token: string
  amount: number
  averagePrice?: number
  currentPrice?: number
  value?: number
  pnl?: number
  pnlPercentage?: number
}

interface PortfolioProps {
  user: SessionUser
}

interface PortfolioData {
  totalValue: number
  freeCapital: number
  allocatedCapital: number
  realizedPnl: number
  unrealizedPnl: number
  holdings: UserHolding[]
}

export function Portfolio({ user }: PortfolioProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number>(Date.now())
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Add a throttling mechanism to prevent excessive data fetching
  const fetchPortfolioData = useCallback(async (force = false) => {
    // If not forcing refresh and data was fetched recently (within 30 seconds), skip
    const now = Date.now()
    if (!force && now - lastUpdated < 30000 && portfolio) {
      return;
    }
    
    // If currently refreshing, don't start another refresh
    if (isRefreshing) {
      return;
    }
    
    try {
      // Only fetch if exchange is connected
      if (user.exchangeConnected) {
        setIsRefreshing(true)
        
        try {
          // Use the trading proxy service to get portfolio data
          const portfolioData = await tradingProxy.getPortfolio(user.id)
          
          // Update the portfolio state
          setPortfolio(portfolioData)
          setLastUpdated(Date.now())
          
          logger.info(`Portfolio data fetched successfully`, {
            context: "Portfolio",
            userId: user.id
          })
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error"
          logger.error(`Error fetching portfolio data: ${errorMessage}`)
          
          // Only show error if we don't already have data
          if (!portfolio) {
            setError("Failed to load portfolio data. Please try again later.")
          }
        } finally {
          setIsRefreshing(false)
          setIsLoading(false)
        }
      } else {
        // If exchange is not connected, set loading to false
        setIsLoading(false)
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error"
      logger.error(`Error in portfolio effect: ${errorMessage}`)
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [user.id, user.exchangeConnected, portfolio, lastUpdated, isRefreshing]);

  // Check for portfolio updates periodically
  const checkForPortfolioUpdates = useCallback(async () => {
    try {
      // Only check if exchange is connected
      if (!user.exchangeConnected) return;
      
      const response = await fetch('/api/portfolio/changes');
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.hasChanges) {
          // If there are changes, trigger a full refresh
          fetchPortfolioData(true);
        }
      }
    } catch (error) {
      // Don't log errors for this quiet background check
    }
  }, [user.exchangeConnected, fetchPortfolioData]);

  // Handle manual refresh
  const handleRefresh = () => {
    fetchPortfolioData(true);
  };

  useEffect(() => {
    fetchPortfolioData();
    
    // Set a reasonable interval to refresh the portfolio data (every 2 minutes)
    const refreshIntervalId = setInterval(() => fetchPortfolioData(), 120000);
    
    // Check for updates more frequently but with lighter requests (every 30 seconds)
    const updateCheckIntervalId = setInterval(() => checkForPortfolioUpdates(), 30000);
    
    return () => {
      clearInterval(refreshIntervalId);
      clearInterval(updateCheckIntervalId);
    };
  }, [user.id, user.exchangeConnected, fetchPortfolioData, checkForPortfolioUpdates]);
  
  // Calculate derived data only when needed (memoize)
  const portfolioStats = useMemo(() => {
    if (!portfolio) return null;
    
    return {
      allocationPercentage: portfolio.totalValue > 0 
        ? ((portfolio.allocatedCapital / portfolio.totalValue) * 100).toFixed(2) 
        : '0.00',
      totalPnL: portfolio.realizedPnl + portfolio.unrealizedPnl,
      pnlPercentage: portfolio.totalValue > 0
        ? (((portfolio.realizedPnl + portfolio.unrealizedPnl) / portfolio.totalValue) * 100).toFixed(2)
        : '0.00'
    };
  }, [portfolio]);

  if (!user.exchangeConnected) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h1 className="text-2xl font-bold mb-4">Portfolio</h1>
        <ExchangeConnectionBanner />
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Connect your exchange to view your portfolio</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading && !portfolio) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h1 className="text-2xl font-bold mb-4">Portfolio</h1>
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-2">Loading portfolio...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h1 className="text-2xl font-bold mb-4">Portfolio</h1>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center text-destructive">
              <ExternalLink className="h-5 w-5 mr-2" />
              <p>{error}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!portfolio) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h1 className="text-2xl font-bold mb-4">Portfolio</h1>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No portfolio data available</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <div className="flex items-center gap-2">
          {isRefreshing ? (
            <div className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
              <span>Updating...</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              Last updated: {new Date(lastUpdated).toLocaleTimeString()}
            </div>
          )}
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="ml-2"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 mb-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="holdings">Holdings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle>Portfolio Summary</CardTitle>
              <CardDescription>Your trading capital and performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total Value</p>
                  <p className="text-2xl font-bold">{formatCurrency(portfolio.totalValue)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Free Capital</p>
                  <p className="text-2xl font-bold">{formatCurrency(portfolio.freeCapital)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Allocated Capital</p>
                  <p className="text-2xl font-bold">{formatCurrency(portfolio.allocatedCapital)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Allocation %</p>
                  <p className="text-2xl font-bold">
                    {portfolioStats?.allocationPercentage}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Profit & Loss</CardTitle>
              <CardDescription>Your trading performance</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Realized P&L</p>
                  <p
                    className={`text-2xl font-bold flex items-center ${portfolio.realizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {portfolio.realizedPnl >= 0 ? (
                      <TrendingUp className="h-5 w-5 mr-1" />
                    ) : (
                      <TrendingDown className="h-5 w-5 mr-1" />
                    )}
                    {formatCurrency(portfolio.realizedPnl)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Unrealized P&L</p>
                  <p
                    className={`text-2xl font-bold flex items-center ${portfolio.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {portfolio.unrealizedPnl >= 0 ? (
                      <TrendingUp className="h-5 w-5 mr-1" />
                    ) : (
                      <TrendingDown className="h-5 w-5 mr-1" />
                    )}
                    {formatCurrency(portfolio.unrealizedPnl)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Total P&L</p>
                  <p
                    className={`text-2xl font-bold ${(portfolioStats?.totalPnL ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {formatCurrency(portfolioStats?.totalPnL ?? 0)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">P&L %</p>
                  <p
                    className={`text-2xl font-bold ${(Number(portfolioStats?.pnlPercentage) || 0) >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {portfolioStats?.pnlPercentage}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holdings">
          {portfolio.holdings && portfolio.holdings.length > 0 ? (
            <div className="space-y-4">
              {portfolio.holdings.map((holding) => (
                <Card key={holding.token}>
                  <CardHeader className="pb-2">
                    <CardTitle>{holding.token}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Amount</p>
                        <p className="text-lg font-bold">{holding.amount.toFixed(6)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Value</p>
                        <p className="text-lg font-bold">{formatCurrency(holding.value || 0)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Avg. Price</p>
                        <p className="text-lg font-bold">{formatCurrency(holding.averagePrice || 0)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Current Price</p>
                        <p className="text-lg font-bold">{formatCurrency(holding.currentPrice || 0)}</p>
                      </div>
                      {holding.pnl !== undefined && holding.pnlPercentage !== undefined && (
                        <>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">P&L</p>
                            <p className={`text-lg font-bold ${holding.pnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                              {formatCurrency(holding.pnl)}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-sm text-muted-foreground">P&L %</p>
                            <p
                              className={`text-lg font-bold ${holding.pnlPercentage >= 0 ? "text-green-500" : "text-red-500"}`}
                            >
                              {holding.pnlPercentage.toFixed(2)}%
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-6 text-center">
                <p className="text-muted-foreground">No holdings found</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}