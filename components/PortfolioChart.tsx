import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';
import { Loader2 } from 'lucide-react';

// Define chart data type
interface ChartData {
  token: string;
  value: number;
  amount: number;
  entryPrice: number;
  currentPrice: number;
  pnlPercentage: number;
  color: string;
}

// Typing the component props and state
const PortfolioChart: React.FC<{ userId: number }> = ({ userId }) => {
  const [positions, setPositions] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchPositions = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        // Fetch portfolio data from your backend
        const response = await fetch('/api/portfolio');
        
        if (!response.ok) {
          throw new Error(`Failed to fetch portfolio: ${response.status}`);
        }
        
        const data: { holdings?: Array<{ token: string; amount: number; value: number; averagePrice?: number; currentPrice?: number; pnlPercentage?: number; }>; } = await response.json();
        
        // Process holdings to display in the chart
        if (data.holdings && data.holdings.length > 0) {
          // Filter out positions with zero amount and stablecoins
          const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI'];
          const filteredHoldings = data.holdings.filter(
            h => h.amount > 0 && !stablecoins.includes(h.token)
          );
          
          // Transform for the chart
          const chartData: ChartData[] = filteredHoldings.map(holding => ({
            token: holding.token,
            value: holding.value || 0,
            amount: holding.amount,
            entryPrice: holding.averagePrice || 0,
            currentPrice: holding.currentPrice || 0,
            pnlPercentage: holding.pnlPercentage || 0,
            // Generate colors based on profit/loss
            color: (holding.pnlPercentage || 0) >= 0 ? '#10b981' : '#ef4444'
          }));
          
          setPositions(chartData);
        } else {
          setPositions([]);
        }
      } catch (err) {
        console.error('Error fetching positions:', err);
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchPositions();
    
    // Refresh every 60 seconds
    const intervalId = setInterval(fetchPositions, 60000);
    
    return () => clearInterval(intervalId);
  }, [userId]);
  
  // Custom tooltip to show more details
  // Tooltip props
  interface CustomTooltipProps {
    active?: boolean;
    payload?: Array<{ payload: ChartData }>;
  }
  const CustomTooltip: React.FC<CustomTooltipProps> = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-3 border rounded shadow-lg">
          <p className="font-bold">{data.token}</p>
          <p>Amount: {data.amount.toFixed(6)}</p>
          <p>Value: ${data.value.toFixed(2)}</p>
          <p>Entry: ${data.entryPrice.toFixed(2)}</p>
          <p>Current: ${data.currentPrice.toFixed(2)}</p>
          <p className={data.pnlPercentage >= 0 ? "text-green-500" : "text-red-500"}>
            P&L: {data.pnlPercentage.toFixed(2)}%
          </p>
        </div>
      );
    }
    return null;
  };
  
  if (isLoading) {
    return (
      <div className="h-48 w-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading portfolio data...</span>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="h-48 w-full flex items-center justify-center text-red-500">
        <p>Error loading portfolio: {error}</p>
      </div>
    );
  }
  
  if (positions.length === 0) {
    return (
      <div className="h-48 w-full flex items-center justify-center text-gray-500">
        <p>No active positions found</p>
      </div>
    );
  }
  
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={positions} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
        <XAxis dataKey="token" angle={-45} textAnchor="end" height={60} />
        <YAxis label={{ value: 'Value ($)', angle: -90, position: 'insideLeft' }} />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Bar dataKey="value" name="Position Value" radius={[4, 4, 0, 0]}>
          {positions.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
};

export default PortfolioChart;