"use client"

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { logger } from '@/lib/logger';
import { SessionUser } from '@/lib/auth';

interface ExchangeContextType {
  isConnected: boolean;
  isLoading: boolean;
  portfolioValue: number | null;
  exchange: "binance" | "btcc" | null;
  checkConnectionStatus: () => Promise<void>;
  updateConnectionStatus: (connected: boolean, exchange?: "binance" | "btcc") => void;
  refreshPortfolio: () => Promise<void>;
}

const ExchangeContext = createContext<ExchangeContextType | undefined>(undefined);

export function ExchangeProvider({ 
  children, 
  user 
}: { 
  children: ReactNode; 
  user: SessionUser | null;
}) {
  const [isConnected, setIsConnected] = useState(user?.exchangeConnected || false);
  const [isLoading, setIsLoading] = useState(false);
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  const [exchange, setExchange] = useState<"binance" | "btcc" | null>(user?.exchange || null);

  // Check connection status from the server
  const checkConnectionStatus = async () => {
    if (!user) return;
    
    try {
      setIsLoading(true);
      const response = await fetch('/api/user/settings');
      
      if (response.ok) {
        const data = await response.json();
        setIsConnected(data.exchangeConnected || false);
        setExchange(data.exchange || null);
        
        logger.info(`Exchange connection status: ${data.exchangeConnected}`, {
          context: 'ExchangeContext'
        });
      }
    } catch (error) {
      logger.error(`Error checking connection status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

 
  const updateConnectionStatus = (connected: boolean, newExchange?: "binance" | "btcc") => {
    setIsConnected(connected);
    if (newExchange) {
      setExchange(newExchange);
    }

    if (connected) {
      refreshPortfolio();
    } else {
      setPortfolioValue(null);
    }
  };

  // Refresh portfolio value
  const refreshPortfolio = async () => {
    if (!user || !isConnected) return;
    
    try {
      const response = await fetch('/api/portfolio/summary');
      if (response.ok) {
        const data = await response.json();
        setPortfolioValue(data.totalValue || null);
      }
    } catch (error) {
      logger.error(`Error fetching portfolio: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  // Initial load and periodic checks
  useEffect(() => {
    if (user) {
      checkConnectionStatus();
      
      // Check status every 30 seconds
      const interval = setInterval(checkConnectionStatus, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user?.id]);

  // Refresh portfolio when connection status changes
  useEffect(() => {
    if (isConnected) {
      refreshPortfolio();
      
      // Refresh portfolio every 2 minutes
      const interval = setInterval(refreshPortfolio, 120000);
      
      return () => clearInterval(interval);
    }
  }, [isConnected]);

  return (
    <ExchangeContext.Provider 
      value={{
        isConnected,
        isLoading,
        portfolioValue,
        exchange,
        checkConnectionStatus,
        updateConnectionStatus,
        refreshPortfolio
      }}
    >
      {children}
    </ExchangeContext.Provider>
  );
}

export function useExchange() {
  const context = useContext(ExchangeContext);
  if (context === undefined) {
    throw new Error('useExchange must be used within an ExchangeProvider');
  }
  return context;
}