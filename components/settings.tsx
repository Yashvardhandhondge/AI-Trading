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

interface SettingsProps {
  user: SessionUser
}

export function Settings({ user }: SettingsProps) {
  const [exchange, setExchange] = useState<"binance" | "btcc">(user.exchange || "binance")
  const [apiKey, setApiKey] = useState("")
  const [apiSecret, setApiSecret] = useState("")
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high">("medium")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const router = useRouter()

  const handleExchangeUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/exchange/update", {
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
        throw new Error(data.error || "Failed to update exchange settings")
      }

      setSuccess("Exchange settings updated successfully")
      setApiKey("")
      setApiSecret("")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update exchange settings")
    } finally {
      setIsLoading(false)
    }
  }

  const handleRiskUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch("/api/user/risk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          riskLevel,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to update risk settings")
      }

      setSuccess("Risk level updated successfully")
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update risk settings")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4 pb-20">
      <h1 className="text-2xl font-bold mb-4">Settings</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Exchange Settings</CardTitle>
          <CardDescription>Update your exchange API credentials</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleExchangeUpdate}>
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
                  placeholder="Enter new API key"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiSecret">API Secret</Label>
                <Input
                  id="apiSecret"
                  type="password"
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder="Enter new API secret"
                />
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            onClick={handleExchangeUpdate}
            className="w-full"
            disabled={isLoading || (!apiKey && !apiSecret)}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Exchange Settings"
            )}
          </Button>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Risk Settings</CardTitle>
          <CardDescription>Configure your risk tolerance for trading signals</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRiskUpdate}>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Risk Level</Label>
                <RadioGroup
                  value={riskLevel}
                  onValueChange={(value) => setRiskLevel(value as "low" | "medium" | "high")}
                  className="flex flex-col space-y-1"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="low" id="low" />
                    <Label htmlFor="low">Low Risk (Conservative)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="medium" id="medium" />
                    <Label htmlFor="medium">Medium Risk (Balanced)</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="high" id="high" />
                    <Label htmlFor="high">High Risk (Aggressive)</Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col items-start space-y-2">
          <Button type="submit" onClick={handleRiskUpdate} className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Risk Settings"
            )}
          </Button>

          {error && <p className="text-sm font-medium text-destructive">{error}</p>}

          {success && <p className="text-sm font-medium text-green-500">{success}</p>}
        </CardFooter>
      </Card>
    </div>
  )
}
