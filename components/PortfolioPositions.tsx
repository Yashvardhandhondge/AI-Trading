import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, RefreshCw, Loader2 } from 'lucide-react';
import { formatCurrency } from "@/lib/utils";

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
  
  const fetchPositions = async (showLoadingState = true): Promise<void> => {
    try {
      if (showLoadingState) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      
      setError(null);
      
      // Fetch portfolio data from your backend
      const response = await fetch('/api/portfolio');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch portfolio: ${response.status}`);
      }
      
      const data: { holdings?: PositionData[] } = await response.json();
      
      // Process holdings to display in the table
      if (data.holdings && data.holdings.length > 0) {
        // Filter out stablecoins
        const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI'];
        const filteredHoldings = data.holdings.filter(
          h => h.amount > 0 && !stablecoins.includes(h.token)
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
      
      // Find the active cycle for this token
      const response = await fetch('/api/cycles/active');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch cycles: ${response.status}`);
      }
      
      const data: { cycles?: Cycle[] } = await response.json();
      
      if (!data.cycles || data.cycles.length === 0) {
        throw new Error("No active cycles found");
      }
      
      // Find the cycle for this token
      const cycle = data.cycles.find(c => c.token === token);
      
      if (!cycle) {
        throw new Error(`No active cycle found for ${token}`);
      }
      
      // Execute sell order
      const sellResponse = await fetch('/api/cycles/active', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          cycleId: cycle.id,
          percentage
        })
      });
      
      if (!sellResponse.ok) {
        const errorData: { error?: string } = await sellResponse.json();
        throw new Error(errorData.error || 'Failed to sell position');
      }
      
      // If selling fully, update position accumulation
      if (percentage === 100) {
        const newAccumulation = { ...positionAccumulation };
        delete newAccumulation[token];
        setPositionAccumulation(newAccumulation);
        
        // Update localStorage
        localStorage.setItem('positionAccumulation', JSON.stringify(newAccumulation));
      } else {
        // For partial sells, reduce the accumulated percentage
        const currentAccumulation = positionAccumulation[token] || 0;
        if (currentAccumulation > 0) {
          const newPercentage = Math.max(0, currentAccumulation - (currentAccumulation * (percentage / 100)));
          const newAccumulation = { ...positionAccumulation, [token]: newPercentage };
          setPositionAccumulation(newAccumulation);
          localStorage.setItem('positionAccumulation', JSON.stringify(newAccumulation));
        }
      }
      
      // Refresh positions after successful sell
      fetchPositions();
    } catch (err) {
      console.error('Error selling position:', err);
      setError((err as Error).message);
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
          <div className="p-4 text-red-500">
            Error: {error}
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
                          onClick={() => handleSellPosition(position.token, 50)}>
                          Sell 50%
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                          onClick={() => handleSellPosition(position.token)}>
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