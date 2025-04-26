"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { 
  ArrowRight, 
  Shield, 
  ChevronRight, 
  Loader2, 
  Info, 
  AlertCircle,
  Check
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { logger } from "@/lib/logger"
import { ProxyTradingService } from "@/lib/trading-service"

interface ConnectExchangeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  userId?: number
  user?: any;
}

export function ConnectExchangeModal({ open, onOpenChange,userId,user }: ConnectExchangeModalProps) {
  const router = useRouter()
  const [exchange, setExchange] = useState<"binance" | "btcc">("binance")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    // Reset error state when modal is opened/closed
    if (open) {
      setError(null)
      setShowSuccess(false)
    }
  }, [open])

  // Modified handleSubmit function for components/connect-exchange-modal.tsx

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsLoading(true);
  setError(null);
  setShowSuccess(false);
  
  try {
    // Get a unique identifier for this user
    const effectiveUserId = userId || user?.id || Date.now().toString();
    
    console.log("Connecting to external backend at http://localhost:3000");
    
    // Send credentials directly to your backend server
    const backendResponse = await fetch('http://localhost:3000/api/register-key', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: effectiveUserId,
        apiKey,
        apiSecret,
        exchange: exchange
      })
    });
    
    // Check for backend errors
    if (!backendResponse.ok) {
      const errorData = await backendResponse.json();
      throw new Error(errorData.error || "Failed to register with backend server");
    }
    
    const backendData = await backendResponse.json();
    console.log("Backend registration successful:", backendData);
    
    // Now that backend succeeded, update your app's database
    const response = await fetch("/api/exchange/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        exchange,
        proxyUserId: effectiveUserId,
        connected: true
      }),
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      logger.error(`Exchange connection failed: ${data.error}`, {
        context: "ConnectExchange"
      });
      
      throw new Error(data.error || "Failed to connect exchange");
    }
    
    logger.info("Exchange connected successfully", {
      context: "ConnectExchange",
      data: { exchange }
    });
    
    // Show success message
    setShowSuccess(true);
    setTimeout(() => {
      onOpenChange(false);
      router.push("/");
      router.refresh();
    }, 1500);
  } catch (err) {
    console.error("Connection error:", err);
    setError(err instanceof Error ? err.message : "Failed to connect exchange");
  } finally {
    setIsLoading(false);
  }
};

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">Connect Exchange</DialogTitle>
          <DialogDescription className="pt-2">
            Connect your cryptocurrency exchange to execute trades and track your portfolio automatically.
          </DialogDescription>
        </DialogHeader>

        {showSuccess ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Check className="h-6 w-6 text-green-600" />
            </div>
            <div className="mt-3 text-center sm:mt-5">
              <h3 className="text-lg font-medium leading-6 text-gray-900 dark:text-gray-100">
                Connection Successful!
              </h3>
              <div className="mt-2">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Your exchange has been connected successfully. Redirecting to dashboard...
                </p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-col space-y-4 py-2">
              <div className="rounded-md bg-blue-50 p-3 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 flex items-start">
                <Shield className="h-5 w-5 mr-2 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                <p className="text-sm">
                  Your exchange API keys are encrypted and stored securely with AES-256 encryption.
                  Only keys with <strong>trading permissions</strong> will work with this app.
                </p>
              </div>

              {error && (
                <Alert variant="destructive" className="border-red-500 bg-red-50 dark:bg-red-900/20">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle className="text-red-800 dark:text-red-300">Connection Error</AlertTitle>
                  <AlertDescription className="text-red-700 dark:text-red-400">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

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
                </div>
              </form>

              <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-md text-sm">
                <h4 className="font-semibold mb-3">Setup instructions for {exchange === "binance" ? "Binance" : "BTCC"}:</h4>
                <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 mb-3">
                  <div className="flex items-start">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-2" />
                    <div className="text-sm text-amber-800 dark:text-amber-300">
                      <strong>Important:</strong> When creating API keys, you MUST enable trading permissions.
                    </div>
                  </div>
                </div>
                
                <ol className="list-decimal list-inside space-y-2 pl-1">
                  <li>Log in to your {exchange === "binance" ? "Binance" : "BTCC"} account</li>
                  <li>Go to <strong>API Management</strong> in your account settings</li>
                  <li>Create a new API key</li>
                  <li>Enable the <strong>{exchange === "binance" ? "Enable Spot & Margin Trading" : "Trading"}</strong> permission</li>
                  <li>Copy your API key and secret</li>
                  <li>Enter them in the form above</li>
                </ol>
                
                <div className="mt-4 space-y-2">
                  <div className="flex items-center space-x-2">
                    <ChevronRight className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" />
                    <span>Execute trades directly from signals</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <ChevronRight className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" />
                    <span>Track your portfolio performance automatically</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <ChevronRight className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" />
                    <span>Receive SELL signals for tokens you own</span>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2 mt-4">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                className="bg-blue-600 hover:bg-blue-700"
                disabled={isLoading || !apiKey || !apiSecret}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    Connect Exchange <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}