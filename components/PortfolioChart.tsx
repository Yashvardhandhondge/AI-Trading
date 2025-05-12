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
import { tradingProxy } from '@/lib/trading-proxy';

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
          // Use trading proxy to get portfolio data
        const data = await tradingProxy.getPortfolio(userId);
        
        // Process holdings to display in the chart
        if (data.holdings && data.holdings.length > 0) {
          // Filter out positions with zero amount and stablecoins
          const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI'];          const filteredHoldings = data.holdings.filter(
            (h: { token: string; amount: number }) => h.amount > 0 && !stablecoins.includes(h.token)
          );
          
          // Transform for the chart
          const chartData: ChartData[] = filteredHoldings.map((holding: { token: string; amount: number; value: number; averagePrice?: number; currentPrice?: number; pnlPercentage?: number; }) => ({
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
      // For a single position, we'll create a bar chart or display as point
      if (positions.length === 1) {
        const pos = positions[0];
        // Create data points: zero and current value
        const labels = ['', pos.token];
        const values = [0, pos.value];
        
        const borderColor = pos.pnlPercentage >= 0 ? '#10b981' : '#ef4444';
        setChartData({
          labels,
          datasets: [
            {
              label: 'Position Value',
              data: values,
              borderColor,
              backgroundColor: borderColor === '#10b981' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              fill: true,
              tension: 0.1,
              pointRadius: [0, 6], // Hide the zero point, show the value point
              pointHoverRadius: [0, 8],
              pointBackgroundColor: borderColor,
              pointBorderColor: borderColor,
              pointBorderWidth: 2,
            },
          ],
        });
      } else {
        // Multiple positions - display normally
        const labels = positions.map(p => p.token);
        const values = positions.map(p => p.value);
        
        // Calculate overall trend
        const totalPnl = positions.reduce((sum, p) => sum + (p.pnlPercentage || 0), 0) / positions.length;
        const borderColor = totalPnl >= 0 ? '#10b981' : '#ef4444';
        
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
              pointRadius: 3,
              pointHoverRadius: 6,
              pointHitRadius: 10,
              pointBackgroundColor: borderColor,
              pointBorderColor: borderColor,
              pointBorderWidth: 2,
            },
          ],
        });
      }
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
        borderColor: 'rgba(255,255,255,0.3)',
        borderWidth: 1,
        cornerRadius: 4,
        callbacks: { 
          label: (ctx) => {
            const value = ctx.parsed.y;
            const label = ctx.dataset.label || '';
            return `${label}: $${value.toFixed(2)}`;
          },
          title: (ctx) => {
            // Don't show empty title for the zero point
            return ctx[0].label || '';
          }
        },
        displayColors: false,
      }
    },
    scales: {
      x: { 
        grid: { display: false }, 
        ticks: { 
          color: '#6b7280',
          // Hide the empty label for single position
          callback: function(value, index, values) {
            const label = this.getLabelForValue(value as number);
            return label || '';
          }
        } 
      },
      y: { 
        grid: { color: 'rgba(156,163,175,0.2)' }, 
        ticks: { 
          color: '#6b7280',
          callback: function(value) {
            return '$' + (typeof value === 'number' ? value.toFixed(0) : value);
          }
        },
        beginAtZero: true, // Always start from zero
        suggestedMax: positions.length === 1 && positions[0] ? positions[0].value * 1.2 : undefined, // Add some padding for single position
      }
    },
    interaction: {
      mode: 'point',
      intersect: false,
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
    <div className="relative">
      <div className="h-80">
        {chartData && <Line data={chartData} options={chartOptions} />}
      </div>
      
      {/* Add a summary below the chart */}
      <div className="mt-4 grid grid-cols-3 gap-4 text-sm">
        {positions.map((pos) => (
          <div key={pos.token} className="text-center">
            <div className="font-medium">{pos.token}</div>
            <div className="text-muted-foreground">${pos.value.toFixed(2)}</div>
            <div className={pos.pnlPercentage >= 0 ? 'text-green-500' : 'text-red-500'}>
              {pos.pnlPercentage >= 0 ? '+' : ''}{pos.pnlPercentage.toFixed(2)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PortfolioChart;