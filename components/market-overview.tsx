"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, AlertTriangle } from "lucide-react"
import { formatCurrency } from "@/lib/utils"
import type { EkinRiskData } from "@/lib/ekin-api"

interface MarketOverviewProps {
  exchange: "binance" | "btcc"
}

export function MarketOverview({ exchange }: MarketOverviewProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [riskData, setRiskData] = useState<Record<string, EkinRiskData>>({})
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<"all" | "low" | "medium" | "high">("all")

  useEffect(() => {
    const fetchRiskData = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const response = await fetch(`/api/ekin/risks?exchange=${exchange}`)

        if (!response.ok) {
          throw new Error("Failed to fetch risk data")
        }

        const data = await response.json()
        setRiskData(data.risks || {})
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch risk data")
      } finally {
        setIsLoading(false)
      }
    }

    fetchRiskData()
  }, [exchange])

  const getRiskLevel = (risk: number): "low" | "medium" | "high" => {
    if (risk < 30) {
      return "low"
    } else if (risk < 70) {
      return "medium"
    } else {
      return "high"
    }
  }

  const getRiskColor = (risk: number): string => {
    const level = getRiskLevel(risk)
    switch (level) {
      case "low":
        return "bg-green-500"
      case "medium":
        return "bg-yellow-500"
      case "high":
        return "bg-red-500"
      default:
        return "bg-gray-500"
    }
  }

  const getFilteredTokens = () => {
    const tokens = Object.entries(riskData).map(([symbol, data]) => ({
      ...data,
      riskLevel: getRiskLevel(data.risk),
    }))

    if (activeTab === "all") {
      return tokens
    }

    return tokens.filter((token) => token.riskLevel === activeTab)
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6 flex justify-center items-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2">Loading market data...</span>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center text-destructive">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const filteredTokens = getFilteredTokens()

  return (
    <Card>
      <CardHeader>
        <CardTitle>Market Overview</CardTitle>
        <CardDescription>Risk analysis from Ekin API for {exchange.toUpperCase()}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="low">Low Risk</TabsTrigger>
            <TabsTrigger value="medium">Medium Risk</TabsTrigger>
            <TabsTrigger value="high">High Risk</TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-0">
            <div className="max-h-[400px] overflow-y-auto">
              {filteredTokens.length > 0 ? (
                <div className="space-y-3">
                  {filteredTokens.map((token) => (
                    <div key={token.symbol} className="flex items-center justify-between p-3 border rounded-md">
                      <div className="flex items-center">
                        {token.icon && (
                          <img
                            src={token.icon || "/placeholder.svg"}
                            alt={token.symbol}
                            className="w-8 h-8 mr-3 rounded-full"
                            onError={(e) => {
                              ;(e.target as HTMLImageElement).src = "/placeholder.svg?height=32&width=32"
                            }}
                          />
                        )}
                        <div>
                          <p className="font-medium">{token.symbol}</p>
                          <p className="text-sm text-muted-foreground">{formatCurrency(Number(token.price))}</p>
                        </div>
                      </div>

                      <div className="flex items-center space-x-3">
                        <div className="text-right">
                          <p className="text-sm text-muted-foreground">2W Change</p>
                          <p className={Number(token["2wChange"]) >= 0 ? "text-green-500" : "text-red-500"}>
                            {token["2wChange"]}%
                          </p>
                        </div>

                        <Badge className={getRiskColor(token.risk)}>Risk: {token.risk}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center py-4 text-muted-foreground">No tokens found</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
