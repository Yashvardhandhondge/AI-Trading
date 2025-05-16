// Enhanced ProfitLossView.tsx with better error handling and PnL calculation

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, TrendingUp, AlertCircle, RefreshCw } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import { logger } from "@/lib/logger"
import type { SessionUser } from "@/lib/auth"
import { tradingProxy } from "@/lib/trading-proxy"
import { ExchangeConnectionBanner } from "@/components/exchange-connection-banner"
import PortfolioChart from "./PortfolioChart"
import PortfolioPositions from "./PortfolioPositions"
import { TradesTableSimple } from "./trades-table-simple" 
import { toast } from "sonner"

interface ProfitLossViewProps {
  user: SessionUser;
  onSwitchToSettings?: () => void;
}

export function ProfitLossView({ user, onSwitchToSettings }: ProfitLossViewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [portfolioData, setPortfolioData] = useState<any>(null)
  const [activeTab, setActiveTab] = useState("positions")
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const [fallbackPnL, setFallbackPnL] = useState({ 
    realized: 0,
    unrealized: 0,
    total: 0,
    percentage: 0
  })

  // Enhanced portfolio data fetch with retry and fallback mechanisms
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

      // Try to get portfolio data with retry mechanism
      let attempts = 0;
      const maxAttempts = 3;
      let portfolioData = null;
      let fetchError = null;
      
      while (attempts < maxAttempts && !portfolioData) {
        try {
          // Use the trading proxy service to get portfolio data
          portfolioData = await tradingProxy.getPortfolio(user.id);
          break;
        } catch (err) {
          fetchError = err;
          attempts++;
          
          if (attempts < maxAttempts) {
            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }
      
      if (!portfolioData && fetchError) {
        // Try to get cached portfolio data as fallback
        try {
          const cachedDataStr = localStorage.getItem('cached_portfolio');
          if (cachedDataStr) {
            const cachedData = JSON.parse(cachedDataStr);
            if (cachedData && Date.now() - cachedData.timestamp < 24 * 60 * 60 * 1000) { // 24 hour cache
              portfolioData = cachedData.data;
              logger.info('Using cached portfolio data as fallback');
            }
          }
        } catch (cacheError) {
          logger.error(`Error reading cached portfolio: ${cacheError instanceof Error ? cacheError.message : "Unknown error"}`);
        }
        
        if (!portfolioData) {
          throw fetchError;
        }
      }
      
      // Try to enhance with PnL data from cycles if missing
      if (portfolioData && (
          portfolioData.realizedPnl === undefined || 
          portfolioData.unrealizedPnl === undefined || 
          portfolioData.realizedPnl === 0 && 
          portfolioData.unrealizedPnl === 0
      )) {
        try {
          const cyclesResponse = await fetch('/api/cycles/active');
          if (cyclesResponse.ok) {
            const cyclesData = await cyclesResponse.json();
            if (cyclesData.cycles && Array.isArray(cyclesData.cycles)) {
              // Calculate PnL from cycles
              let totalPnl = 0;
              let unrealizedPnl = 0;
              
              cyclesData.cycles.forEach((cycle: any) => {
                if (cycle.pnl) {
                  if (cycle.state === 'exit' || cycle.state === 'completed') {
                    totalPnl += cycle.pnl;
                  } else {
                    unrealizedPnl += cycle.pnl;
                  }
                }
              });
              
              // Update portfolio data with calculated PnL
              portfolioData.realizedPnl = totalPnl;
              portfolioData.unrealizedPnl = unrealizedPnl;
              
              logger.info('Enhanced portfolio data with PnL from cycles', {
                context: 'ProfitLossView',
                data: { realizedPnl: totalPnl, unrealizedPnl }
              });
            }
          }
        } catch (cyclesError) {
          logger.warn(`Failed to enhance portfolio with PnL from cycles: ${cyclesError instanceof Error ? cyclesError.message : "Unknown error"}`);
        }
      }
      
      // Cache portfolio data for fallback
      try {
        localStorage.setItem('cached_portfolio', JSON.stringify({
          data: portfolioData,
          timestamp: Date.now()
        }));
      } catch (cacheError) {
        logger.warn(`Failed to cache portfolio data: ${cacheError instanceof Error ? cacheError.message : "Unknown error"}`);
      }
      
      // Update the portfolio state
      setPortfolioData(portfolioData);
      setLastUpdated(new Date());
      
      // Reset retry count on success
      setRetryCount(0);
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load portfolio data";
      setError(errorMessage);
      logger.error(`Error fetching portfolio data: ${errorMessage}`);
      
      // Increment retry count and try again if needed
      const newRetryCount = retryCount + 1;
      setRetryCount(newRetryCount);
      
      if (newRetryCount <= 3) {
        logger.info(`Retry #${newRetryCount} for portfolio data`);
        // Wait and retry with exponential backoff
        setTimeout(() => {
          fetchPortfolioData(false);
        }, 1000 * Math.pow(2, newRetryCount - 1));
      } else {
        // After max retries, show friendly error
        toast.error("Having trouble loading your portfolio data", {
          description: "Please try refreshing in a few moments"
        });
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user.exchangeConnected, user.id, retryCount]);
  
  // Initial data load and periodic refresh
  useEffect(() => {
    if (user.exchangeConnected) {
      fetchPortfolioData();
      
      // Set up polling to refresh data every 30 seconds
      const refreshInterval = setInterval(() => {
        fetchPortfolioData(false);
      }, 30000);
      
      // Clean up the interval when component unmounts
      return () => clearInterval(refreshInterval);
    }
  }, [user.exchangeConnected, fetchPortfolioData]);

  // Fallback PnL calculation from trades history
  useEffect(() => {
    if ((!portfolioData || 
        (portfolioData.realizedPnl === undefined || portfolioData.realizedPnl === 0) && 
        (portfolioData.unrealizedPnl === undefined || portfolioData.unrealizedPnl === 0)) && 
        user.exchangeConnected) {
      
      // Try to calculate from trade history
      const calculatePnlFromTrades = async () => {
        try {
          const tradesResponse = await fetch('/api/trades');
          if (tradesResponse.ok) {
            const tradesData = await tradesResponse.json();
            
            if (tradesData.trades && Array.isArray(tradesData.trades)) {
              // Simple PnL calculation from buy/sell pairs
              const trades = tradesData.trades;
              
              // Group trades by token
              const tokenTrades: Record<string, any[]> = {};
              trades.forEach((trade: any) => {
                if (!tokenTrades[trade.token]) {
                  tokenTrades[trade.token] = [];
                }
                tokenTrades[trade.token].push(trade);
              });
              
              let realizedPnl = 0;
              let unrealizedPnl = 0;
              
              // Calculate PnL for each token
              Object.entries(tokenTrades).forEach(([token, tokenTradeList]) => {
                // Sort by date
                tokenTradeList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                
                // Simple FIFO calculation
                const buys: any[] = [];
                let tokenPnl = 0;
                
                tokenTradeList.forEach(trade => {
                  if (trade.type === 'BUY') {
                    buys.push(trade);
                  } else if (trade.type === 'SELL') {
                    // Match with buys using FIFO
                    let remainingSellAmount = trade.amount;
                    const sellPrice = trade.price;
                    
                    while (remainingSellAmount > 0 && buys.length > 0) {
                      const oldestBuy = buys[0];
                      const buyAmount = oldestBuy.amount;
                      const buyPrice = oldestBuy.price;
                      
                      if (buyAmount <= remainingSellAmount) {
                        // Use entire buy
                        const pnlForThis = (sellPrice - buyPrice) * buyAmount;
                        tokenPnl += pnlForThis;
                        remainingSellAmount -= buyAmount;
                        buys.shift(); // Remove this buy
                      } else {
                        // Use partial buy
                        const pnlForThis = (sellPrice - buyPrice) * remainingSellAmount;
                        tokenPnl += pnlForThis;
                        oldestBuy.amount -= remainingSellAmount;
                        remainingSellAmount = 0;
                      }
                    }
                  }
                });
                
                // Add to realized PnL
                realizedPnl += tokenPnl;
                
                // Calculate unrealized PnL for remaining buys
                if (buys.length > 0) {
                  // Try to get current price
                  const calculateUnrealized = async () => {
                    try {
                      const currentPrice = await tradingProxy.getPrice(user.id, `${token}USDT`);
                      let unrealizedForToken = 0;
                      
                      buys.forEach(buy => {
                        unrealizedForToken += (currentPrice - buy.price) * buy.amount;
                      });
                      
                      setFallbackPnL(prev => ({
                        ...prev,
                        unrealized: prev.unrealized + unrealizedForToken
                      }));
                    } catch (priceError) {
                      logger.warn(`Could not get current price for ${token} for unrealized PnL`);
                    }
                  };
                  
                  calculateUnrealized();
                }
              });
              
              setFallbackPnL({
                realized: realizedPnl,
                 unrealized: unrealizedPnl,
                total: realizedPnl + unrealizedPnl,
                percentage: portfolioData?.totalValue ? ((realizedPnl + unrealizedPnl) / portfolioData.totalValue) * 100 : 0
              });
            }
          }
        } catch (tradesError) {
          logger.warn(`Failed to calculate PnL from trades: ${tradesError instanceof Error ? tradesError.message : "Unknown error"}`);
        }
      };
      
      calculatePnlFromTrades();
    }
  }, [portfolioData, user.exchangeConnected, user.id]);

  const handleRefresh = (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.preventDefault();
    fetchPortfolioData(false); // Pass false to show refresh state instead of loading state
  };

  if (!user?.exchangeConnected) {
    return (
      <div className="container mx-auto p-4 pb-20">
        <h2 className="text-xl font-bold mb-4">Profit & Loss</h2>
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground mb-4">Connect your exchange to view profit and loss data</p>
            {onSwitchToSettings && (
              <Button onClick={onSwitchToSettings}>Connect Exchange</Button>
            )}
          </CardContent>
        </Card>
      </div>
    );
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
    );
  }

  // Get the best available PnL values
  const realizedPnl = portfolioData?.realizedPnl !== undefined ? portfolioData.realizedPnl : fallbackPnL.realized;
  const unrealizedPnl = portfolioData?.unrealizedPnl !== undefined ? portfolioData.unrealizedPnl : fallbackPnL.unrealized;
  const totalPnl = realizedPnl + unrealizedPnl;
  
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
              <span className={unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"}>
                {unrealizedPnl >= 0 ? "+" : ""}
                {formatCurrency(unrealizedPnl || 0)}
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
              <p className={`text-2xl font-bold flex items-center ${unrealizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                {unrealizedPnl >= 0 ? (
                  <TrendingUp className="h-5 w-5 mr-1" />
                ) : (
                  <AlertCircle className="h-5 w-5 mr-1" />
                )}
                {formatCurrency(unrealizedPnl || 0)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Realized P&L</p>
              <p className={`text-2xl font-bold ${realizedPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatCurrency(realizedPnl || 0)}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-sm text-muted-foreground">Total P&L</p>
              <p className={`text-2xl font-bold ${totalPnl >= 0 ? "text-green-500" : "text-red-500"}`}>
                {formatCurrency(totalPnl || 0)}
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
              <TradesTableSimple userId={user.id} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}