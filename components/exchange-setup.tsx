"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2, Info, AlertCircle } from "lucide-react"
import type { SessionUser } from "@/lib/auth"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ProxyTradingService } from "@/lib/trading-service" 

interface ExchangeSetupProps {
  user: SessionUser
  onComplete: () => void
}

export function ExchangeSetup({ user, onComplete }: ExchangeSetupProps) {
  const [exchange, setExchange] = useState<"binance" | "btcc">("binance")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const [proxyServerAvailable, setProxyServerAvailable] = useState(true)
  const [proxyServerUrl, setProxyServerUrl] = useState('http://13.60.210.111:3000')
  
  // Check if proxy server is available
  useEffect(() => {
    // First try to get from environment
    const configuredUrl = process.env.NEXT_PUBLIC_PROXY_SERVER_URL;
    if (configuredUrl) {
      setProxyServerUrl(configuredUrl);
    }
    
    const checkProxyServer = async () => {
      try {
        // Use the configured URL for the health check
        const response = await fetch(`${proxyServerUrl}/health`, { 
          signal: AbortSignal.timeout(3000), // 3 second timeout
          mode: 'cors' // Explicitly request CORS 
        });
        
        const available = response.ok;
        setProxyServerAvailable(available);
        console.log(`Proxy server check at ${proxyServerUrl}: ${available ? "Available" : "Unavailable"}`);
        
        if (!available && proxyServerUrl === 'http://13.60.210.111:3000') {
          // If localhost failed, try public domain if configured
          const publicUrl = process.env.NEXT_PUBLIC_PROXY_PUBLIC_URL;
          if (publicUrl) {
            try {
              console.log(`Trying alternative proxy server: ${publicUrl}`);
              const altResponse = await fetch(`${publicUrl}/health`, { 
                signal: AbortSignal.timeout(3000)
              });
              if (altResponse.ok) {
                setProxyServerUrl(publicUrl);
                setProxyServerAvailable(true);
                console.log(`Connected to alternative proxy server: ${publicUrl}`);
              }
            } catch (e) {
              console.error("Alternative proxy server check failed:", e);
            }
          }
        }
      } catch (error) {
        console.error(`Proxy server check failed for ${proxyServerUrl}:`, error);
        setProxyServerAvailable(false);
      }
    };
    
    checkProxyServer();
  }, []);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    
    try {
      // Get a unique identifier for this user
      const effectiveUserId = user.id || Date.now().toString();
      
      console.log(`Connecting to proxy server at ${proxyServerUrl} for user ${effectiveUserId}`);
      
      if (!proxyServerAvailable) {
        throw new Error(`Cannot connect to proxy server at ${proxyServerUrl}. Make sure it's running.`);
      }
      
      // First, register API keys with the proxy server
      const backendResponse = await fetch(`${proxyServerUrl}/api/register-key`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId: effectiveUserId,
          apiKey,
          apiSecret,
          exchange
        })
      });
      
      // Check for backend errors
      if (!backendResponse.ok) {
        const errorData = await backendResponse.json();
        throw new Error(errorData.error || "Failed to register with backend server");
      }
      
      const backendData = await backendResponse.json();
      console.log("Backend registration successful:", backendData);
      
      // Then update your app database
      const response = await fetch("/api/exchange/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exchange,
          proxyUserId: effectiveUserId,
          connected: true,
          proxyServerUrl // Store the URL that worked
        }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to connect exchange");
      }
      
      // Store the successful URL in localStorage for future use
      localStorage.setItem('proxyServerUrl', proxyServerUrl);
      
      // Refresh user data
      router.refresh()
      onComplete()
    } catch (err) {
      console.error("Connection error:", err);
      setError(err instanceof Error ? err.message : "Failed to connect exchange");
    } finally {
      setIsLoading(false)
    }
  }

  // Get the user's IP address
  const [userIp, setUserIp] = useState<string>("")
  const [isLoadingIp, setIsLoadingIp] = useState(true)

  useEffect(() => {
    const fetchIp = async () => {
      try {
        const response = await fetch('https://api.ipify.org?format=json')
        const data = await response.json()
        setUserIp(data.ip)
      } catch (error) {
        console.error("Error fetching IP:", error)
      } finally {
        setIsLoadingIp(false)
      }
    }

    fetchIp()
  }, [])
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Exchange</CardTitle>
          <CardDescription>
            Connect your cryptocurrency exchange to start trading
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!proxyServerAvailable && (
            <Alert className="mb-4 border-red-500 bg-red-50 dark:bg-red-900/20">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle className="text-red-800 dark:text-red-300">Proxy Server Not Available</AlertTitle>
              <AlertDescription className="text-red-700 dark:text-red-400">
                Cannot connect to proxy server at {proxyServerUrl}. Please make sure it's running.
                <br/>
                <small className="mt-2 block">
                  Note: Telegram WebApp may block connection to localhost. 
                  Try running the proxy on a public URL or device IP address (not localhost).
                </small>
              </AlertDescription>
            </Alert>
          )}

          <Alert className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>API keys with trading permissions required</AlertTitle>
            <AlertDescription>
              You need to set up API keys with trading permissions from your exchange. Make sure to whitelist your IP address for security.
            </AlertDescription>
          </Alert>

          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Select Exchange</Label>
                <RadioGroup
                  value={exchange}
                  onValueChange={(value) => setExchange(value as "binance" | "btcc")}
                  className="flex flex-col space-y-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="binance" id="binance" />
                    <Label htmlFor="binance">Binance (Spot)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="btcc" id="btcc" />
                    <Label htmlFor="btcc">BTCC (Futures)</Label>
                  </div>
                </RadioGroup>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="apiKey">API Key</Label>
                <Input
                  id="apiKey"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  required
                />
              </div>
              
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="ip-whitelist">
                  <AccordionTrigger className="text-sm font-medium">
                    How to whitelist your IP address
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="space-y-3 text-sm">
                      <p className="text-muted-foreground">
                        For security reasons, {exchange === "binance" ? "Binance" : "BTCC"} requires you to whitelist the IP addresses that can use your API key for trading.
                      </p>
                      
                      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md flex items-center">
                        <Info className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                        <div>
                          <p className="font-medium">Your current IP address:</p>
                          <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200">
                            {isLoadingIp ? "Loading..." : userIp}
                          </code>
                        </div>
                      </div>

                      <p className="font-medium mt-3">Steps for {exchange === "binance" ? "Binance" : "BTCC"}:</p>
                      
                      {exchange === "binance" ? (
                        <ol className="list-decimal list-inside space-y-2 pl-2">
                          <li>Log in to your Binance account</li>
                          <li>Go to "API Management" in your account settings</li>
                          <li>Create a new API key or edit an existing one</li>
                          <li>Enable "Enable Trading" permission</li>
                          <li>In the "API restrictions" section, add your IP address: <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">{userIp}</code></li>
                          <li>Save your settings</li>
                        </ol>
                      ) : (
                        <ol className="list-decimal list-inside space-y-2 pl-2">
                          <li>Log in to your BTCC account</li>
                          <li>Navigate to the "API Management" section</li>
                          <li>Create a new API key</li>
                          <li>Check the "Trading" permission box</li>
                          <li>Add your IP address: <code className="px-1 bg-gray-100 dark:bg-gray-800 rounded">{userIp}</code> to the whitelist</li>
                          <li>Confirm and save your API key</li>
                        </ol>
                      )}

                      <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-md">
                        <p className="text-amber-800 dark:text-amber-300 text-xs">
                          <strong>Note:</strong> If your IP address changes (e.g., different network or ISP), you'll need to update your whitelist in your exchange settings.
                        </p>
                      </div>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
              
              {error && (
                <div className="text-sm font-medium text-destructive">{error}</div>
              )}
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            onClick={handleSubmit}
            className="w-full"
            disabled={isLoading || !proxyServerAvailable}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              "Connect Exchange"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}