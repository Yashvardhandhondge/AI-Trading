"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, RefreshCw, User } from "lucide-react"

export default function AdminPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [activeTab, setActiveTab] = useState("signals")
  const [users, setUsers] = useState([])
  const [trades, setTrades] = useState([])
  const [signals, setSignals] = useState([])
  const router = useRouter()

  // Form states for creating a signal
  const [signalType, setSignalType] = useState<"BUY" | "SELL">("BUY")
  const [token, setToken] = useState("")
  const [price, setPrice] = useState("")
  const [riskLevel, setRiskLevel] = useState<"low" | "medium" | "high">("medium")
  const [expiresInMinutes, setExpiresInMinutes] = useState("10")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const response = await fetch("/api/admin/check")

        if (response.ok) {
          setIsAdmin(true)
          await fetchData()
        } else {
          router.push("/")
        }
      } catch (error) {
        console.error("Error checking admin status:", error)
        router.push("/")
      } finally {
        setIsLoading(false)
      }
    }

    checkAdminStatus()
  }, [router])

  const fetchData = async () => {
    setIsLoading(true)

    try {
      // Fetch users
      const usersResponse = await fetch("/api/admin/users")
      if (usersResponse.ok) {
        const usersData = await usersResponse.json()
        setUsers(usersData.users || [])
      }

      // Fetch trades
      const tradesResponse = await fetch("/api/admin/trades")
      if (tradesResponse.ok) {
        const tradesData = await tradesResponse.json()
        setTrades(tradesData.trades || [])
      }

      // Fetch signals
      const signalsResponse = await fetch("/api/admin/signals")
      if (signalsResponse.ok) {
        const signalsData = await signalsResponse.json()
        setSignals(signalsData.signals || [])
      }
    } catch (error) {
      console.error("Error fetching admin data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateSignal = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      if (!token) {
        throw new Error("Token is required")
      }

      if (!price || isNaN(Number.parseFloat(price)) || Number.parseFloat(price) <= 0) {
        throw new Error("Valid price is required")
      }

      const response = await fetch("/api/admin/signals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: signalType,
          token: token.toUpperCase(),
          price: Number.parseFloat(price),
          riskLevel,
          expiresInMinutes: Number.parseInt(expiresInMinutes),
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || "Failed to create signal")
      }

      setSuccess("Signal created successfully")

      // Reset form
      setToken("")
      setPrice("")

      // Refresh signals
      const signalsResponse = await fetch("/api/admin/signals")
      if (signalsResponse.ok) {
        const signalsData = await signalsResponse.json()
        setSignals(signalsData.signals || [])
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to create signal")
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading admin panel...</span>
      </div>
    )
  }

  if (!isAdmin) {
    return null // Router will redirect
  }

  return (
    <div className="container mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Admin Panel</h1>
        <Button variant="outline" size="sm" onClick={fetchData}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="signals">Signals</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="trades">Trades</TabsTrigger>
        </TabsList>

        <TabsContent value="signals">
          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Create Signal</CardTitle>
                <CardDescription>Create a new trading signal for users</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateSignal}>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Signal Type</Label>
                      <RadioGroup
                        value={signalType}
                        onValueChange={(value) => setSignalType(value as "BUY" | "SELL")}
                        className="flex space-x-4"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="BUY" id="buy" />
                          <Label htmlFor="buy">BUY</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="SELL" id="sell" />
                          <Label htmlFor="sell">SELL</Label>
                        </div>
                      </RadioGroup>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="token">Token</Label>
                      <Input
                        id="token"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                        placeholder="BTC"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="price">Price (USD)</Label>
                      <Input
                        id="price"
                        type="number"
                        step="0.01"
                        min="0"
                        value={price}
                        onChange={(e) => setPrice(e.target.value)}
                        placeholder="0.00"
                        required
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Risk Level</Label>
                      <Select
                        value={riskLevel}
                        onValueChange={(value) => setRiskLevel(value as "low" | "medium" | "high")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select risk level" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low Risk</SelectItem>
                          <SelectItem value="medium">Medium Risk</SelectItem>
                          <SelectItem value="high">High Risk</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Expires In (minutes)</Label>
                      <Select value={expiresInMinutes} onValueChange={setExpiresInMinutes}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select expiration time" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="5">5 minutes</SelectItem>
                          <SelectItem value="10">10 minutes</SelectItem>
                          <SelectItem value="15">15 minutes</SelectItem>
                          <SelectItem value="30">30 minutes</SelectItem>
                          <SelectItem value="60">1 hour</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </form>
              </CardContent>
              <CardFooter className="flex flex-col items-start space-y-2">
                <Button type="submit" onClick={handleCreateSignal} className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Signal
                    </>
                  )}
                </Button>

                {error && <p className="text-sm font-medium text-destructive">{error}</p>}
                {success && <p className="text-sm font-medium text-green-500">{success}</p>}
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Signals</CardTitle>
                <CardDescription>Currently active trading signals</CardDescription>
              </CardHeader>
              <CardContent>
                {signals.length > 0 ? (
                  <div className="max-h-[400px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Token</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Risk</TableHead>
                          <TableHead>Expires</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {signals.map((signal: any) => (
                          <TableRow key={signal.id}>
                            <TableCell className={signal.type === "BUY" ? "text-green-500" : "text-red-500"}>
                              {signal.type}
                            </TableCell>
                            <TableCell>{signal.token}</TableCell>
                            <TableCell>${signal.price.toFixed(2)}</TableCell>
                            <TableCell className="capitalize">{signal.riskLevel}</TableCell>
                            <TableCell>
                              {new Date(signal.expiresAt) > new Date()
                                ? `${Math.floor((new Date(signal.expiresAt).getTime() - new Date().getTime()) / 60000)}m left`
                                : "Expired"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <p className="text-center py-4 text-muted-foreground">No active signals</p>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>Active Users</CardTitle>
              <CardDescription>Users currently using the platform</CardDescription>
            </CardHeader>
            <CardContent>
              {users.length > 0 ? (
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Exchange</TableHead>
                        <TableHead>Risk Level</TableHead>
                        <TableHead>Connected</TableHead>
                        <TableHead>Joined</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((user: any) => (
                        <TableRow key={user.id}>
                          <TableCell className="flex items-center space-x-2">
                            <User className="h-4 w-4" />
                            <span>{user.username || user.firstName}</span>
                          </TableCell>
                          <TableCell className="capitalize">{user.exchange || "None"}</TableCell>
                          <TableCell className="capitalize">{user.riskLevel}</TableCell>
                          <TableCell>{user.exchangeConnected ? "Yes" : "No"}</TableCell>
                          <TableCell>{new Date(user.createdAt).toLocaleDateString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-center py-4 text-muted-foreground">No users found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trades">
          <Card>
            <CardHeader>
              <CardTitle>Recent Trades</CardTitle>
              <CardDescription>Trades executed on the platform</CardDescription>
            </CardHeader>
            <CardContent>
              {trades.length > 0 ? (
                <div className="max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Token</TableHead>
                        <TableHead>Price</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Auto</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map((trade: any) => (
                        <TableRow key={trade.id}>
                          <TableCell>{trade.username || trade.userId}</TableCell>
                          <TableCell className={trade.type === "BUY" ? "text-green-500" : "text-red-500"}>
                            {trade.type}
                          </TableCell>
                          <TableCell>{trade.token}</TableCell>
                          <TableCell>${trade.price.toFixed(2)}</TableCell>
                          <TableCell>{trade.amount.toFixed(6)}</TableCell>
                          <TableCell>{trade.autoExecuted ? "Yes" : "No"}</TableCell>
                          <TableCell>{new Date(trade.createdAt).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <p className="text-center py-4 text-muted-foreground">No trades found</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
