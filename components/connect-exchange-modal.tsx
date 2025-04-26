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
  Copy,
  Check
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { logger } from "@/lib/logger"

interface ConnectExchangeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectExchangeModal({ open, onOpenChange }: ConnectExchangeModalProps) {
  const router = useRouter()
  const [exchange, setExchange] = useState<"binance" | "btcc">("binance")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<{message: string, code?: string} | null>(null)
  const [userIp, setUserIp] = useState<string>("")
  const [isLoadingIp, setIsLoadingIp] = useState(true)
  const [showSuccess, setShowSuccess] = useState(false)
  
  // Vercel IPs to whitelist
  const vercelIpRanges = ["76.76.21.0/24"]

  useEffect(() => {
    // Reset error state when modal is opened/closed
    if (open) {
      setError(null)
      setShowSuccess(false)
    }
  }, [open])

  // Get the user's IP address when the component mounts
  useEffect(() => {
    const fetchIp = async () => {
      try {
        // Try multiple IP services in case one fails
        const services = [
          'https://api.ipify.org?format=json',
          'https://api.myip.com',
          'https://api.ip.sb/ip'
        ]
        
        let ip = ""
        
        for (const service of services) {
          try {
            const response = await fetch(service)
            if (!response.ok) continue
            
            if (service.includes('ipify')) {
              const data = await response.json()
              ip = data.ip
            } else if (service.includes('myip')) {
              const data = await response.json()
              ip = data.ip
            } else {
              // Plain text response
              ip = await response.text()
            }
            
            if (ip) break
          } catch (e) {
            console.error(`Error with IP service ${service}:`, e)
            // Continue to next service
          }
        }
        
        if (ip) {
          setUserIp(ip.trim())
        } else {
          // Fallback if all services fail
          setUserIp("Unable to detect")
        }
      } catch (error) {
        console.error("Error fetching IP:", error)
        setUserIp("Unable to detect")
      } finally {
        setIsLoadingIp(false)
      }
    }

    fetchIp()
  }, [])

  const handleCopyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // Show brief success message
        alert("Copied to clipboard!")
      })
      .catch(err => {
        console.error('Failed to copy text: ', err)
      })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setShowSuccess(false)
    
    try {
      const response = await fetch("/api/exchange/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          exchange,
          apiKey,
          apiSecret,
        }),
      })
      
      const data = await response.json()
      
      if (!response.ok) {
        logger.error(`Exchange connection failed: ${data.error}`)
        
        throw new Error(data.error || "Failed to connect exchange")
      }
      
      logger.info("Exchange connected successfully", {
        context: "ConnectExchange",
        data: { exchange }
      })
      
      // Show success message briefly before closing
      setShowSuccess(true)
      setTimeout(() => {
        // Close the modal
        onOpenChange(false)
        // Navigate to dashboard
        router.push("/")
        router.refresh()
      }, 1500)
    } catch (err) {
      setError({
        message: err instanceof Error ? err.message : "Failed to connect exchange",
        code: err instanceof Error && (err as any).code ? (err as any).code : undefined
      })
    } finally {
      setIsLoading(false)
    }
  }

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
                    {error.message}
                    {error.code === "IP_RESTRICTED" && (
                      <div className="mt-2">
                        <Accordion type="single" collapsible>
                          <AccordionItem value="ip-solution">
                            <AccordionTrigger className="text-sm">View IP Whitelist Solution</AccordionTrigger>
                            <AccordionContent>
                              <div className="text-sm space-y-2 p-2 bg-gray-100 dark:bg-gray-800 rounded">
                                <p>Please whitelist these IP addresses in your Binance API settings:</p>
                                <ul className="list-disc pl-5 space-y-1">
                                  <li className="flex items-center justify-between">
                                    <span>Your current IP: </span>
                                    <code className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">{userIp}</code>
                                    <Button 
                                      size="icon" 
                                      variant="ghost" 
                                      className="h-6 w-6"
                                      onClick={() => handleCopyToClipboard(userIp)}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </li>
                                  <li className="flex items-center justify-between">
                                    <span>Vercel IP range: </span>
                                    <code className="px-2 py-1 bg-gray-200 dark:bg-gray-700 rounded">76.76.21.0/24</code>
                                    <Button 
                                      size="icon" 
                                      variant="ghost" 
                                      className="h-6 w-6"
                                      onClick={() => handleCopyToClipboard("76.76.21.0/24")}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </li>
                                </ul>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </div>
                    )}
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

              <Tabs defaultValue="binance" value={exchange} className="mt-4">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="binance">Binance Guide</TabsTrigger>
                  <TabsTrigger value="btcc">BTCC Guide</TabsTrigger>
                </TabsList>
                <TabsContent value="binance" className="mt-2">
                  <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 mb-2">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-2" />
                      <div className="text-sm text-amber-800 dark:text-amber-300">
                        <strong>Important:</strong> When creating API keys on Binance, you MUST whitelist the application IP addresses or you'll get "IP restricted" errors.
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-md text-sm">
                    <div className="flex items-center mb-2">
                      <Info className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                      <p className="font-medium">Your current IP address:</p>
                    </div>
                    <div className="flex items-center space-x-2 mb-3">
                      <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200 flex-1">
                        {isLoadingIp ? "Loading..." : userIp}
                      </code>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7"
                        onClick={() => handleCopyToClipboard(userIp)}
                        disabled={isLoadingIp}
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    
                    <div className="flex items-center mb-2">
                      <Info className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                      <p className="font-medium">Vercel server IP range (required):</p>
                    </div>
                    <div className="flex items-center space-x-2 mb-3">
                      <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200 flex-1">
                        76.76.21.0/24
                      </code>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7"
                        onClick={() => handleCopyToClipboard("76.76.21.0/24")}
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>

                    <h4 className="font-semibold mt-3 mb-2">Setup instructions:</h4>
                    <ol className="list-decimal list-inside space-y-2 pl-1">
                      <li>Log in to your Binance account</li>
                      <li>Go to <strong>API Management</strong> in your account settings</li>
                      <li>Create a new API key</li>
                      <li>Enable the <strong>Enable Spot & Margin Trading</strong> permission</li>
                      <li>In the <strong>API restrictions</strong> section, add both IP addresses shown above</li>
                      <li>Make sure to save your API key and secret</li>
                    </ol>
                  </div>
                </TabsContent>
                <TabsContent value="btcc" className="mt-2">
                  <div className="rounded-md bg-amber-50 dark:bg-amber-900/20 p-3 mb-2">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 mr-2" />
                      <div className="text-sm text-amber-800 dark:text-amber-300">
                        <strong>Important:</strong> When creating API keys on BTCC, you MUST whitelist the application IP addresses or you'll get access errors.
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-900/20 rounded-md text-sm">
                    <div className="flex items-center mb-2">
                      <Info className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                      <p className="font-medium">Your current IP address:</p>
                    </div>
                    <div className="flex items-center space-x-2 mb-3">
                      <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200 flex-1">
                        {isLoadingIp ? "Loading..." : userIp}
                      </code>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7"
                        onClick={() => handleCopyToClipboard(userIp)}
                        disabled={isLoadingIp}
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>
                    
                    <div className="flex items-center mb-2">
                      <Info className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                      <p className="font-medium">Vercel server IP range (required):</p>
                    </div>
                    <div className="flex items-center space-x-2 mb-3">
                      <code className="px-2 py-1 bg-blue-100 dark:bg-blue-800 rounded text-blue-900 dark:text-blue-200 flex-1">
                        76.76.21.0/24
                      </code>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-7"
                        onClick={() => handleCopyToClipboard("76.76.21.0/24")}
                      >
                        <Copy className="h-3 w-3 mr-1" /> Copy
                      </Button>
                    </div>

                    <h4 className="font-semibold mt-3 mb-2">Setup instructions:</h4>
                    <ol className="list-decimal list-inside space-y-2 pl-1">
                      <li>Log in to your BTCC account</li>
                      <li>Navigate to the <strong>API Management</strong> section</li>
                      <li>Create a new API key</li>
                      <li>Check the <strong>Trading</strong> permission box</li>
                      <li>Add both IP addresses shown above to the whitelist</li>
                      <li>Save your API key and secret securely</li>
                    </ol>
                  </div>
                </TabsContent>
              </Tabs>
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