"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, TrendingUp, TrendingDown } from "lucide-react"
import type { Socket } from "socket.io-client"
import type { SessionUser } from "@/lib/auth"
import { formatCurrency } from "@/lib/utils"
import { ProxyTradingService } from "@/lib/trading-service"
import { logger } from "@/lib/logger"

interface UserHolding {
  token: string;
  amount: number;
  averagePrice?: number;
  currentPrice?: number;
  value?: number;
}

interface PortfolioProps {
  user: SessionUser
  socket: Socket | null
}

interface PortfolioData {
  totalValue: number
  freeCapital: number
  allocatedCapital: number
  realizedPnl: number
  unrealizedPnl: number
  holdings: {
    token: string
    amount: number
    averagePrice: number
    currentPrice: number
    value: number
    pnl: number
    pnlPercentage: number
  }[]
}

export function Portfolio({ user, socket }: PortfolioProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [portfolio, setPortfolio] = useState<PortfolioData | null>(null)
  const [activeTab, setActiveTab] = useState("overview")
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [pnl, setPnl] = useState({ realized: 0, unrealized: 0 });
  const [userHoldings, setUserHoldings] = useState<UserHolding[]>([]);
  // const [activeTab, setActiveTab] = useState("overview");

// In components/portfolio.tsx, update the useEffect to use the proxy service

useEffect(() => {
  const fetchPortfolioData = async () => {
    try {
      // Only fetch if exchange is connected
      if (user.exchangeConnected) {
        setIsLoading(true);
        
        try {
          // Use the proxy service to get portfolio data
          const portfolioData = await ProxyTradingService.getPortfolio(user.id);
          
          // Update the full portfolio state
          setPortfolio(portfolioData);
          
          // Also update the individual states for convenience
          setPortfolioValue(portfolioData.totalValue || 0);
          setPnl({
            realized: portfolioData.realizedPnl || 0,
            unrealized: portfolioData.unrealizedPnl || 0,
          });
          
          if (portfolioData.holdings) {
            const holdings = portfolioData.holdings.filter((h:any) => h.amount > 0);
            setUserHoldings(holdings);
            
            logger.info(`User has ${holdings.length} token holdings`, {
              context: "Portfolio",
              userId: user.id
            });
          }
        } catch (error) {
          logger.error("Error fetching portfolio data:", error instanceof Error ? error : new Error(String(error)), {
            context: "Portfolio",
            userId: user.id
          });
        } finally {
          setIsLoading(false);
        }
      }
    } catch (error) {
      logger.error("Error in portfolio effect:", error instanceof Error ? error : new Error(String(error)), {
        context: "Portfolio",
        userId: user.id
      });
    }
  };

  fetchPortfolioData();
  
  // Set an interval to refresh the portfolio data every 60 seconds
  const intervalId = setInterval(fetchPortfolioData, 60000);
  
  return () => clearInterval(intervalId);
}, [user.id, user.exchangeConnected]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading portfolio...</span>
      </div>
    )
  }

  if (!portfolio) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h1 className="text-2xl font-bold mb-4">Portfolio</h1>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">Failed to load portfolio data</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <h1 className="text-2xl font-bold mb-4">Portfolio</h1>

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
                    {((portfolio.allocatedCapital / portfolio.totalValue) * 100).toFixed(2)}%
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
                    className={`text-2xl font-bold ${portfolio.realizedPnl + portfolio.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {formatCurrency(portfolio.realizedPnl + portfolio.unrealizedPnl)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">P&L %</p>
                  <p
                    className={`text-2xl font-bold ${portfolio.realizedPnl + portfolio.unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}
                  >
                    {(((portfolio.realizedPnl + portfolio.unrealizedPnl) / portfolio.totalValue) * 100).toFixed(2)}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="holdings">
          {portfolio.holdings.length > 0 ? (
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
                        <p className="text-lg font-bold">{holding.amount}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Value</p>
                        <p className="text-lg font-bold">{formatCurrency(holding.value)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Avg. Price</p>
                        <p className="text-lg font-bold">{formatCurrency(holding.averagePrice)}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">Current Price</p>
                        <p className="text-lg font-bold">{formatCurrency(holding.currentPrice)}</p>
                      </div>
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
