"use client"

import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { ExternalLink, ArrowRight } from "lucide-react"

interface ExchangeConnectionBannerProps {
  className?: string
}

export function ExchangeConnectionBanner({ className }: ExchangeConnectionBannerProps) {
  const router = useRouter()

  return (
    <Card className={`border-blue-500 bg-blue-50 dark:bg-blue-950/30 mb-6 ${className}`}>
      <CardContent className="p-4 flex flex-col sm:flex-row items-center justify-between">
        <div className="flex items-center mb-3 sm:mb-0">
          <div className="rounded-full bg-blue-100 dark:bg-blue-900 p-2 mr-3">
            <ExternalLink className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-medium text-blue-800 dark:text-blue-300">Exchange Not Connected</h3>
            <p className="text-sm text-blue-600 dark:text-blue-400">
              Connect your exchange to execute trades and track your portfolio
            </p>
          </div>
        </div>
        <Button 
          className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
          onClick={() => router.push("/settings")}
        >
          Connect Exchange
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  )
}