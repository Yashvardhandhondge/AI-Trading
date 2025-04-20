"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Loader2 } from "lucide-react"
import type { SessionUser } from "@/lib/auth"

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
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    
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
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to connect exchange")
      }
      
      // Refresh user data
      router.refresh()
      onComplete()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect exchange")
    } finally {
      setIsLoading(false)
    }
  }
  
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect Exchange</CardTitle>
          <CardDescription>
            Connect your cryptocurrency exchange to start trading
          </CardDescription>
        </CardHeader>
        <CardContent>
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
            disabled={isLoading}
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