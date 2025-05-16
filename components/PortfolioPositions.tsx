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
  pnl?: number;
  pnlPercentage?: number;
}

interface Cycle {
  id: string;
  token: string;
  state: string;
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
  
  const fetchPositions = async (showLoadingState = true): Promise<void> => {
    try {
      if (showLoadingState) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      
      setError(null);
      
      // Fetch both portfolio data and active cycles in parallel
      const [portfolioData, cyclesResponse] = await Promise.all([
        tradingProxy.getPortfolio(userId),
        fetch('/api/cycles/active').then(res => res.json())
      ]);
      
      // Store cycles for later use when selling
      if (cyclesResponse.cycles && Array.isArray(cyclesResponse.cycles)) {
        setCycles(cyclesResponse.cycles);
        console.log("Found active cycles:", cyclesResponse.cycles);
      }
      
      // Process holdings to display in the table
      if (portfolioData.holdings && portfolioData.holdings.length > 0) {
        // Filter out stablecoins
        const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI'];
        const filteredHoldings = portfolioData.holdings.filter(
          (h: { token: string; amount: number }) => h.amount > 0 && !stablecoins.includes(h.token)
        );
        
        setPositions(filteredHoldings);
        
        // Try to get position accumulation from localStorage
        try {
          const storedAccumulation = localStorage.getItem('positionAccumulation');
          if (storedAccumulation) {
            setPositionAccumulation(JSON.parse(storedAccumulation) as Record<string, number>);
          }
        } catch (e) {
          console.error("Failed to load position accumulation from localStorage:", e);
        }
      } else {
        setPositions([]);
      }
      
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
    
    return () => clearInterval(intervalId);
  }, [userId]);
  
  const handleRefresh = (): void => {
    fetchPositions(false);
  };
  
  const handleSellPosition = async (token: string, percentage = 100): Promise<void> => {
    try {
      setIsRefreshing(true);
      
      // Validate the token can be traded
      const symbol = `${token}USDT`;
      try {
        await tradingProxy.validateSymbol(userId, symbol);
      } catch (error) {
        toast.error(`Invalid trading pair: ${symbol}`);
        return;
      }

      // Get current price with retry
      let currentPrice: number;
      try {
        currentPrice = await tradingProxy.getPrice(userId, symbol);
        if (!currentPrice) throw new Error('Could not get current price');
      } catch (error) {
        toast.error(`Cannot get current price for ${token}. Please try again.`);
        return;
      }

      // Find or create cycle
      let cycleId = null;
      const existingCycle = cycles.find(c => c.token === token && ['entry', 'hold'].includes(c.state));
      
      if (existingCycle) {
        cycleId = existingCycle.id;
      } else {
        try {
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
          
          if (!response.ok) throw new Error('Failed to create cycle');
          const newCycle = await response.json();
          cycleId = newCycle.id;
          setCycles(prev => [...prev, newCycle]);
        } catch (err) {
          toast.error(`Failed to initialize sell order for ${token}`);
          throw err;
        }
      }

      // Execute sell with retries
      const executeSell = async () => {
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
          throw new Error(error.message || 'Failed to sell position');
        }

        return await sellResponse.json();
      };

      const MAX_RETRIES = 3;
      let attempt = 0;
      let success = false;

      while (attempt < MAX_RETRIES && !success) {
        try {
          const result = await executeSell();
          success = true;
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
          
          fetchPositions();
        } catch (error) {
          attempt++;
          if (attempt === MAX_RETRIES) throw error;
          await new Promise(resolve => setTimeout(resolve, 1000));
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
                  <th className="py-3 px-4 text-left text-sm font-medium">Accumulated</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">P&L</th>
                  <th className="py-3 px-4 text-left text-sm font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {positions.map((position) => (
                  <tr key={position.token}>
                    <td className="py-3 px-4 text-sm font-medium">{position.token}</td>
                    <td className="py-3 px-4 text-sm">{position.amount.toFixed(6)}</td>
                    <td className="py-3 px-4 text-sm">{formatCurrency(position.value || 0)}</td>
                    <td className="py-3 px-4 text-sm">
                      {positionAccumulation[position.token] 
                        ? `${positionAccumulation[position.token]}%` 
                        : 'N/A'}
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {position.pnl !== undefined && position.pnlPercentage !== undefined && (
                        <div className="flex flex-col">
                          <span className={position.pnl >= 0 ? "text-green-500 flex items-center" : "text-red-500 flex items-center"}>
                            {position.pnl >= 0 ? <TrendingUp className="h-3 w-3 mr-1" /> : <TrendingDown className="h-3 w-3 mr-1" />}
                            {formatCurrency(position.pnl)}
                          </span>
                          <span className={position.pnlPercentage >= 0 ? "text-green-500 text-xs" : "text-red-500 text-xs"}>
                            {position.pnlPercentage.toFixed(2)}%
                          </span>
                        </div>
                      )}
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
                ))}
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