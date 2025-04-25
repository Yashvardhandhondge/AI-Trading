// lib/mock-signals.ts
import { logger } from "@/lib/logger";

// Define the signal interface
export interface MockSignal {
  id: string;
  type: "BUY" | "SELL";
  token: string;
  price: number;
  riskLevel: "low" | "medium" | "high";
  createdAt: string;
  expiresAt: string;
  positives?: string[];
  warnings?: string[];
  warning_count?: number;
  link?: string;
}

// Mock data for signals
export const mockSignals: MockSignal[] = [
  {
    id: "mock-signal-1",
    type: "BUY",
    token: "BTC",
    price: 60234.50,
    riskLevel: "medium",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(), // 5 minutes ago
    expiresAt: new Date(Date.now() + 1000 * 60 * 10).toISOString(), // 10 minutes from now
    positives: [
      "Strong momentum in the past 24 hours",
      "High trading volume relative to market cap",
      "Support level recently tested and held",
      "Overall market sentiment is positive"
    ],
    warnings: [
      "Recent price volatility has been high",
      "Approaching resistance level at $62,000"
    ],
    warning_count: 2,
    link: "https://www.tradingview.com/chart/?symbol=BITSTAMP:BTCUSD"
  },
  {
    id: "mock-signal-2",
    type: "BUY",
    token: "ETH",
    price: 3487.25,
    riskLevel: "low",
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(), // 2 minutes ago
    expiresAt: new Date(Date.now() + 1000 * 60 * 8).toISOString(), // 8 minutes from now
    positives: [
      "Trading above all major moving averages",
      "ETH/BTC ratio improving over 7 days",
      "Staking rate increasing consistently",
      "Development activity remains strong"
    ],
    warnings: [
      "Potential market-wide correction due to macro factors"
    ],
    warning_count: 1,
    link: "https://www.tradingview.com/chart/?symbol=BITSTAMP:ETHUSD"
  },
  {
    id: "mock-signal-3",
    type: "SELL",
    token: "DOGE",
    price: 0.1234,
    riskLevel: "high",
    createdAt: new Date(Date.now() - 1000 * 60 * 3).toISOString(), // 3 minutes ago
    expiresAt: new Date(Date.now() + 1000 * 60 * 7).toISOString(), // 7 minutes from now
    positives: [],
    warnings: [
      "Price reaching historically overvalued levels",
      "Volume decreasing on recent rallies",
      "Social media sentiment turning negative",
      "Similar patterns previously led to 30%+ corrections"
    ],
    warning_count: 4,
    link: "https://www.tradingview.com/chart/?symbol=BINANCE:DOGEUSDT"
  },
  {
    id: "mock-signal-4",
    type: "BUY",
    token: "SOL",
    price: 158.75,
    riskLevel: "high",
    createdAt: new Date(Date.now() - 1000 * 60 * 4).toISOString(), // 4 minutes ago
    expiresAt: new Date(Date.now() + 1000 * 60 * 9).toISOString(), // 9 minutes from now
    positives: [
      "Strong development ecosystem growth",
      "Increasing DeFi TVL week over week",
      "Growth in NFT market transactions"
    ],
    warnings: [
      "Network congestion during high traffic periods",
      "High competition in L1 blockchain space"
    ],
    warning_count: 2,
    link: "https://www.tradingview.com/chart/?symbol=BINANCE:SOLUSDT"
  },
  {
    id: "mock-signal-5",
    type: "BUY",
    token: "LINK",
    price: 18.94,
    riskLevel: "low",
    createdAt: new Date(Date.now() - 1000 * 60 * 6).toISOString(), // 6 minutes ago
    expiresAt: new Date(Date.now() + 1000 * 60 * 11).toISOString(), // 11 minutes from now
    positives: [
      "Increased adoption in DeFi protocols",
      "Near all-time high in total value secured",
      "New partnership announcements"
    ],
    warnings: [
      "Price consolidation for extended period"
    ],
    warning_count: 1,
    link: "https://www.tradingview.com/chart/?symbol=BINANCE:LINKUSDT"
  }
];

/**
 * Get a mock BUY signal based on risk level
 * @param riskLevel The preferred risk level
 * @returns A mock BUY signal with the corresponding risk level or any BUY signal
 */
export function getMockBuySignal(riskLevel: "low" | "medium" | "high" = "medium"): MockSignal | null {
  let signal: MockSignal | undefined;
  
  // Try to match the risk level
  signal = mockSignals.find(s => s.type === "BUY" && s.riskLevel === riskLevel);
  
  // If no match, return any BUY signal
  if (!signal) {
    signal = mockSignals.find(s => s.type === "BUY");
  }
  
  // Clone the signal so we don't modify the original
  if (signal) {
    const clonedSignal: MockSignal = JSON.parse(JSON.stringify(signal));
    
    // Update the timestamps to be current
    clonedSignal.createdAt = new Date(Date.now() - 1000 * 60 * 5).toISOString(); // 5 minutes ago
    clonedSignal.expiresAt = new Date(Date.now() + 1000 * 60 * 10).toISOString(); // 10 minutes from now
    // Generate a unique ID based on current timestamp to avoid collisions
    clonedSignal.id = `mock-buy-${clonedSignal.token}-${Date.now()}`;
    
    logger.info(`Returning mock BUY signal for ${clonedSignal.token} with risk level ${clonedSignal.riskLevel}`, {
      context: "MockSignals"
    });
    
    return clonedSignal;
  }
  
  return null;
}

/**
 * Get a mock SELL signal for a specific token
 * @param token The token to get a SELL signal for
 * @returns A mock SELL signal for the specified token
 */
export function getMockSellSignal(token?: string): MockSignal | null {
  let signal: MockSignal | undefined;
  
  // Try to match the token if provided
  if (token) {
    signal = mockSignals.find(s => s.type === "SELL" && s.token === token.toUpperCase());
  }
  
  // If no match, return any SELL signal
  if (!signal) {
    signal = mockSignals.find(s => s.type === "SELL");
  }
  
  // Clone the signal so we don't modify the original
  if (signal) {
    const clonedSignal: MockSignal = JSON.parse(JSON.stringify(signal));
    
    // If a specific token was requested but not found in our mocks,
    // modify the signal to use the requested token
    if (token && clonedSignal.token !== token.toUpperCase()) {
      clonedSignal.token = token.toUpperCase();
    }
    
    // Update the timestamps to be current
    clonedSignal.createdAt = new Date(Date.now() - 1000 * 60 * 3).toISOString(); // 3 minutes ago
    clonedSignal.expiresAt = new Date(Date.now() + 1000 * 60 * 7).toISOString(); // 7 minutes from now
    // Generate a unique ID based on current timestamp to avoid collisions
    clonedSignal.id = `mock-sell-${clonedSignal.token}-${Date.now()}`;
    
    logger.info(`Returning mock SELL signal for ${clonedSignal.token}`, {
      context: "MockSignals"
    });
    
    return clonedSignal;
  }
  
  return null;
}

/**
 * Function to be used in the API route as a fallback
 * @param riskLevel User's risk level preference
 * @param userHoldings Array of tokens the user holds
 * @returns A suitable mock signal
 */
export function getAnyMockSignal(
  riskLevel?: "low" | "medium" | "high", 
  userHoldings?: string[]
): MockSignal | null {
  // If the user has holdings, try to return a SELL signal for one of their tokens
  if (userHoldings && userHoldings.length > 0) {
    // Randomly decide whether to show a BUY or SELL signal
    const showSell = Math.random() > 0.5;
    
    if (showSell) {
      // Randomly select one of the user's tokens
      const randomToken = userHoldings[Math.floor(Math.random() * userHoldings.length)];
      const sellSignal = getMockSellSignal(randomToken);
      if (sellSignal) return sellSignal;
    }
  }
  
  // Default to returning a BUY signal
  return getMockBuySignal(riskLevel);
}