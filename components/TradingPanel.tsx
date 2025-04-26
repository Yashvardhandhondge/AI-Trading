import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, ExternalLink, Shield } from "lucide-react";
import { ConnectExchangeModal } from "@/components/connect-exchange-modal";
import { logger } from "@/lib/logger";

export default function TradingPanel({ userId }:any) {
  const [isLoading, setIsLoading] = useState(true);
  const [portfolioData, setPortfolioData] = useState(null);
  const [isExchangeConnected, setIsExchangeConnected] = useState(false);
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [error, setError] = useState(null);

  // Check if user has registered API keys with the proxy server
  useEffect(() => {
    const checkExchangeConnection = async () => {
      try {
        setIsLoading(true);
        // First check if user's key is stored in the proxy server
        const response = await fetch(`https://remedies-postal-travel-bailey.trycloudflare.com/api/user/${userId}/key-status`);
        
        if (response.ok) {
          const data = await response.json();
          setIsExchangeConnected(data.registered);
          
          if (data.registered) {
            // If user has keys registered, fetch portfolio data
            try {
              const portfolioResponse = await fetch('https://remedies-postal-travel-bailey.trycloudflare.com/api/proxy/binance', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  userId: userId.toString(),
                  endpoint: '/api/v3/account',
                  method: 'GET',
                  params: {}
                })
              });
              
              if (portfolioResponse.ok) {
                const portfolioData = await portfolioResponse.json();
                setPortfolioData(portfolioData);
                
                // Also update in your app database that exchange is connected
                await fetch("/api/exchange/connect", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    exchange: "binance",
                    proxyUserId: userId,
                    connected: true
                  }),
                });
              }
            } catch (portfolioError) {
              console.error("Error fetching portfolio:", portfolioError);
            }
          }
        } else {
          console.error("Error checking key status");
        }
      } catch (err) {
        console.error("Error checking exchange connection:", err);
        logger.error("Could not connect to proxy server at https://remedies-postal-travel-bailey.trycloudflare.com");
      } finally {
        setIsLoading(false);
      }
    };
    
    checkExchangeConnection();
  }, [userId]);

  // Handle connecting exchange
  const handleConnectExchange = () => {
    setShowConnectModal(true);
  };
  
  // Handle successful connection
  const handleConnectionSuccess = () => {
    setIsExchangeConnected(true);
    window.location.reload(); // Refresh the app to update the state
  };

  return (
    <div className="mb-6">
      {isLoading ? (
        <Card>
          <CardContent className="flex items-center justify-center p-6">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Checking exchange connection...</span>
          </CardContent>
        </Card>
      ) : error ? (
        <Card className="border-amber-500 bg-amber-50 dark:bg-amber-900/30">
          <CardContent className="p-4">
            <div className="flex items-center text-amber-800 dark:text-amber-300">
              <ExternalLink className="h-5 w-5 mr-2" />
              <div>
                <p className="font-medium">Proxy Server Error</p>
                <p className="text-sm">{error}</p>
                <p className="text-sm mt-2">Make sure your proxy server is running at https://remedies-postal-travel-bailey.trycloudflare.com</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : !isExchangeConnected ? (
        <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950/30">
          <CardHeader className="pb-2">
            <CardTitle>Connect Your Exchange</CardTitle>
            <CardDescription>
              To start trading, you need to connect your exchange API keys
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center justify-between p-4">
            <div className="flex items-center mb-3 sm:mb-0">
              <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-2 mr-3">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-sm">
                <p className="text-blue-600 dark:text-blue-400">
                  Your API keys will be securely stored on the proxy server
                </p>
              </div>
            </div>
            <Button 
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
              onClick={handleConnectExchange}
            >
              Connect Exchange
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-green-500 bg-green-50 dark:bg-green-900/30">
          <CardContent className="p-4">
            <div className="flex items-center text-green-800 dark:text-green-300">
              <Shield className="h-5 w-5 mr-2" />
              <div>
                <p className="font-medium">Exchange Connected Successfully</p>
                <p className="text-sm">Your exchange API keys are securely stored on the proxy server</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      
      {/* Connection Modal */}
      <ConnectExchangeModal 
        open={showConnectModal} 
        onOpenChange={setShowConnectModal}
        userId={userId}
        onSuccess={handleConnectionSuccess}
      />
    </div>
  );
}