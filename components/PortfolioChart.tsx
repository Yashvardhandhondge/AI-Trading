import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend as ChartLegend,
  Filler,
  ChartOptions,
} from 'chart.js';
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

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  ChartLegend,
  Filler
);

// Typing the component props and state
const PortfolioChart: React.FC<{ userId: number }> = ({ userId }) => {
  const [positions, setPositions] = useState<ChartData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartData, setChartData] = useState<any>(null);

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
  
  // Transform positions into Chart.js data
  useEffect(() => {
    if (positions.length > 0) {
      const labels = positions.map(p => p.token);
      const values = positions.map(p => p.value);
      const change = values[values.length - 1] - values[0];
      const borderColor = change >= 0 ? '#10b981' : '#ef4444';
      setChartData({
        labels,
        datasets: [
          {
            label: 'Position Value',
            data: values,
            borderColor,
            backgroundColor: borderColor === '#10b981' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
            fill: true,
            tension: 0.3,
            pointRadius: 0,
            pointHoverRadius: 6,
          },
        ],
      });
    } else {
      setChartData(null);
    }
  }, [positions]);
  
  // Chart options
  const chartOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        callbacks: { label: ctx => `$${ctx.parsed.y.toFixed(2)}` }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: '#6b7280' } },
      y: { grid: { color: 'rgba(156,163,175,0.2)' }, ticks: { color: '#6b7280' } }
    }
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
    <div className="h-80">
      {chartData && <Line data={chartData} options={chartOptions} />}
    </div>
  );
};

export default PortfolioChart;