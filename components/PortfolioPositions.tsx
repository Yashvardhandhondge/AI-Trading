// Updated PortfolioPositions component with better price, accumulation and PnL handling

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { formatCurrency } from "@/lib/utils";
import { tradingProxy } from "@/lib/trading-proxy";
import { toast } from "sonner";

// Define data interfaces
interface PositionData {
  token: string;
  amount: number;
  value: number;
  averagePrice?: number;
  currentPrice?: number;
  pnl?: number;
  pnlPercentage?: number;
  change24h?: number;
}

interface Cycle {
  id: string;
  token: string;
  state: string;
  entryPrice: number;
  currentPrice?: number;
  pnl?: number;
  pnlPercentage?: number;
}

interface PriceChange {
  symbol: string;
  priceChange: string;
  priceChangePercent: string;
  lastPrice: string;
}

// Type component props
const PortfolioPositions: React.FC<{ userId: number }> = ({ userId }) => {
  // State with proper typing
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [positionAccumulation, setPositionAccumulation] = useState<Record<string, number>>({});
  const [cycles, setCycles] = useState<Cycle[]>([]);
  const [priceChanges, setPriceChanges] = useState<Record<string, PriceChange>>({});
  
  // Fetch 24h price changes
  const fetch24hPriceChanges = async () => {
    try {
      // Use the 24h ticker endpoint for all symbols
      const response = await fetch('/api/prices/24h');
      
      if (response.ok) {
        const data = await response.json();
        
        if (data.priceChanges && Array.isArray(data.priceChanges)) {
          // Convert to a map for easy lookup
          const changesMap: Record<string, PriceChange> = {};
          
          data.priceChanges.forEach((change: PriceChange) => {
            changesMap[change.symbol] = change;
          });
          
          setPriceChanges(changesMap);
          
          // Store in localStorage for fallback
          try {
            localStorage.setItem('price_changes_24h', JSON.stringify({
              data: changesMap,
              timestamp: Date.now()
            }));
          } catch (e) {
            console.error("Failed to cache price changes:", e);
          }
        }
      } else {
        // If API fails, try to get data from localStorage
        try {
          const cachedDataStr = localStorage.getItem('price_changes_24h');
          if (cachedDataStr) {
            const cachedData = JSON.parse(cachedDataStr);
            if (cachedData && Date.now() - cachedData.timestamp < 12 * 60 * 60 * 1000) { // 12 hour cache
              setPriceChanges(cachedData.data);
            }
          }
        } catch (e) {
          console.error("Failed to read cached price changes:", e);
        }
      }
    } catch (err) {
      console.error("Error fetching 24h price changes:", err);
    }
  };
  
  // Function to calculate position accumulation from trade history
  const calculateAccumulationFromTrades = async () => {
    try {
      const response = await fetch('/api/trades');
      if (!response.ok) return;
      
      const data = await response.json();
      if (!data.trades || !Array.isArray(data.trades)) return;
      
      const trades = data.trades;
      const tokenAccumulation: Record<string, number> = {};
      
      // Group trades by token
      const tokenTrades: Record<string, any[]> = {};
      trades.forEach((trade: any) => {
        if (!tokenTrades[trade.token]) {
          tokenTrades[trade.token] = [];
        }
        tokenTrades[trade.token].push(trade);
      });
      
      // Sort trades by date (oldest first)
      Object.keys(tokenTrades).forEach(token => {
        tokenTrades[token].sort((a, b) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        );
        
        // Calculate accumulation percentage (rough estimate)
        let buyCount = 0;
        
        tokenTrades[token].forEach(trade => {
          if (trade.type === 'BUY') {
            buyCount++;
          }
        });
        
        // Assume each buy is roughly 10%
        tokenAccumulation[token] = buyCount * 10;
      });
      
      // Update state and localStorage
      setPositionAccumulation(prev => ({
        ...prev,
        ...tokenAccumulation
      }));
      
      localStorage.setItem('positionAccumulation', JSON.stringify(tokenAccumulation));
      
    } catch (err) {
      console.error("Error calculating accumulation from trades:", err);
    }
  };
  
  // Fetch cycle data to get PnL information
  const fetchCycleData = async () => {
    try {
      const response = await fetch('/api/cycles/active');
      if (!response.ok) return;
      
      const data = await response.json();
      if (!data.cycles || !Array.isArray(data.cycles)) return;
      
      setCycles(data.cycles);
      
      // Use cycle data to enhance positions with PnL info
      setPositions(prev => 
        prev.map(position => {
          const cycle = data.cycles.find((c: Cycle) => c.token === position.token);
          if (cycle) {
            return {
              ...position,
              pnl: cycle.pnl,
              pnlPercentage: cycle.pnlPercentage
            };
          }
          return position;
        })
      );
    } catch (err) {
      console.error("Error fetching cycle data:", err);
    }
  };
  
  const fetchPositions = async (showLoadingState = true): Promise<void> => {
    try {
      if (showLoadingState) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      
      setError(null);
      
      // Load position accumulation from localStorage
      try {
        const storedAccumulation = localStorage.getItem('positionAccumulation');
        if (storedAccumulation) {
          setPositionAccumulation(JSON.parse(storedAccumulation));
        }
      } catch (e) {
        console.error("Failed to load position accumulation from localStorage:", e);
      }
      
      // Fetch portfolio data from trading proxy
      const portfolioData = await tradingProxy.getPortfolio(userId);
      
      // Process holdings to display in the table
      if (portfolioData.holdings && portfolioData.holdings.length > 0) {
        // Filter out stablecoins
        const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI'];
        const filteredHoldings = portfolioData.holdings.filter(
          (h: { token: string; amount: number }) => h.amount > 0 && !stablecoins.includes(h.token)
        );
        
        // Enhance with 24h change data
        const enhancedHoldings = filteredHoldings.map((holding: any) => {
          const symbol = `${holding.token}USDT`;
          const priceChange = priceChanges[symbol];
          
          return {
            ...holding,
            change24h: priceChange ? parseFloat(priceChange.priceChangePercent) : 0
          };
        });
        
        setPositions(enhancedHoldings);
      } else {
        setPositions([]);
      }
      
      // Fetch cycles data to enhance positions with PnL info
      await fetchCycleData();
      
      // Calculate accumulation from trade history if not present
      if (Object.keys(positionAccumulation).length === 0) {
        await calculateAccumulationFromTrades();
      }
      
      // Fetch 24h price changes
      await fetch24hPriceChanges();
      
      setLastUpdated(new Date());
    } catch (err) {
      console.error('Error fetching positions:', err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };
  
  useEffect(() => {
    fetchPositions();
    
    // Refresh every 60 seconds
    const intervalId = setInterval(() => fetchPositions(false), 60000);
    
    // Fetch 24h price changes on initial load
    fetch24hPriceChanges();
    
    return () => clearInterval(intervalId);
  }, [userId]);
  
  const handleRefresh = (): void => {
    fetchPositions(false);
  };
  
  const handleSellPosition = async (token: string, percentage = 100): Promise<void> => {
    try {
      setIsRefreshing(true);
      
      // Find cycle for this token
      const cycle = cycles.find(c => c.token === token);
      
      // First, force a price check to ensure token can be traded
      try {
        const price = await tradingProxy.getPrice(userId, `${token}USDT`);
        if (!price || price <= 0) {
          throw new Error(`Could not get valid price for ${token}`);
        }
      } catch (priceError) {
        // Just log the error but continue - we'll fallback to using validateSymbol
        console.error("Price validation failed, falling back to symbol validation:", priceError);
      }
      
      // If no cycle found, create one first
      let cycleId = cycle?.id;
      if (!cycleId) {
        try {
          // Get current price (already validated above)
          let currentPrice: number;
          try {
            currentPrice = await tradingProxy.getPrice(userId, `${token}USDT`);
          } catch (error) {
            // Fallback to position's current price
            const position = positions.find(p => p.token === token);
            currentPrice = position?.currentPrice || 0;
            
            if (!currentPrice) {
              throw new Error('Could not get current price');
            }
          }
          
          // Create a new cycle
          const response = await fetch('/api/cycles/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              token,
              initialState: 'hold',
              currentPrice
            })
          });
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create cycle');
          }
          
          const newCycle = await response.json();
          if (!newCycle.id) {
            throw new Error('Invalid cycle response');
          }
          
          cycleId = newCycle.id;
          setCycles(prev => [...prev, newCycle]);
          
          console.log(`Created new cycle for ${token} with ID ${cycleId}`);
        } catch (err) {
          toast.error(`Failed to create cycle for ${token}: ${(err as Error).message}`);
          throw err;
        }
      }
      
      if (!cycleId) {
        throw new Error(`Could not find or create cycle for ${token}`);
      }
      
      // Get current price for the trade
      let currentPrice: number;
      try {
        currentPrice = await tradingProxy.getPrice(userId, `${token}USDT`);
      } catch (error) {
        // Fallback to position's current price
        const position = positions.find(p => p.token === token);
        currentPrice = position?.currentPrice || 0;
        
        if (!currentPrice) {
          toast.error(`Cannot get current price for ${token}. Please try again.`);
          return;
        }
      }
      
      // Execute sell with retries
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
          // Use the cycles/active POST endpoint to sell
          const sellResponse = await fetch('/api/cycles/active', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cycleId,
              token,
              percentage,
              userId,
              currentPrice
            })
          });

          if (!sellResponse.ok) {
            const error = await sellResponse.json();
            console.error(`Sell attempt ${attempt + 1} failed:`, error);
            
            if (attempt === MAX_RETRIES - 1) {
              throw new Error(error.error || `Failed to sell position (${sellResponse.status})`);
            }
            
            // Wait before retrying
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }

          // Sell succeeded
          const result = await sellResponse.json();
          toast.success(`Successfully sold ${percentage}% of ${token}`);
          
          // Update local state
          if (percentage === 100) {
            setPositionAccumulation(prev => {
              const next = { ...prev };
              delete next[token];
              localStorage.setItem('positionAccumulation', JSON.stringify(next));
              return next;
            });
          }
          
          // Refresh data
          fetchPositions();
          break;
        } catch (error) {
          if (attempt === MAX_RETRIES - 1) {
            throw error;
          }
        }
      }
    } catch (err) {
      console.error('Error selling position:', err);
      toast.error(`Failed to sell ${token}: ${(err as Error).message}`);
    } finally {
      setIsRefreshing(false);
    }
  };
  
  if (isLoading) {
    return (
      <div className="h-48 w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading positions...</span>
      </div>
    );
  }
  
  return (
    <Card className="mb-6 overflow-hidden">
      <CardHeader className="pb-2 flex flex-row justify-between items-center">
        <CardTitle>Spot Positions</CardTitle>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleRefresh} 
          disabled={isRefreshing}
          className="h-9 px-2"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
          {isRefreshing ? 'Updating...' : 'Refresh'}
        </Button>
      </CardHeader>
      
      <CardContent className="p-0">
        {error && (
          <div className="p-4 text-red-500 flex items-center">
            <AlertCircle className="h-4 w-4 mr-2" />
            <p>{error}</p>
          </div>
        )}
        
        {positions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="py-3 px-4 text-left text-sm font-medium">Token</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Amount</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Value</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">24h Change</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Accumulated</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">P&L</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {positions.map((position) => {
                  // Find the cycle for this token for PnL data
                  const cycle = cycles.find(c => c.token === position.token);
                  const pnl = position.pnl !== undefined ? position.pnl : (cycle?.pnl || 0);
                  const pnlPercentage = position.pnlPercentage !== undefined ? 
                    position.pnlPercentage : (cycle?.pnlPercentage || 0);
                  
                  // Calculate 24h change  
                  const change24h = position.change24h || 0;
                  
                  // Get accumulation percentage
                  const accumulated = positionAccumulation[position.token] || 0;
                  
                  return (
                    <tr key={position.token}>
                      <td className="py-3 px-4 text-sm font-medium">{position.token}</td>
                      <td className="py-3 px-4 text-sm">{position.amount.toFixed(6)}</td>
                      <td className="py-3 px-4 text-sm">{formatCurrency(position.value || 0)}</td>
                      <td className="py-3 px-4 text-sm">
                        <span className={change24h >= 0 ? "text-green-500" : "text-red-500"}>
                          {change24h >= 0 ? "+" : ""}{change24h.toFixed(2)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        {accumulated > 0 ? `${accumulated}%` : 'N/A'}
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex flex-col">
                          <span className={pnl >= 0 ? "text-green-500 flex items-center" : "text-red-500 flex items-center"}>
                            {pnl >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                            {formatCurrency(pnl)}
                          </span>
                          <span className={pnlPercentage >= 0 ? "text-green-500 text-xs" : "text-red-500 text-xs"}>
                            {pnlPercentage.toFixed(2)}%
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-sm">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                            onClick={() => handleSellPosition(position.token, 50)}
                            disabled={isRefreshing}>
                            Sell 50%
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                            onClick={() => handleSellPosition(position.token)}
                            disabled={isRefreshing}>
                            Sell All
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-6 text-center text-muted-foreground">
            No active positions found
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PortfolioPositions;