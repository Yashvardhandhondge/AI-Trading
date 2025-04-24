"use client"
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
import { ArrowRight, Shield, ChevronRight } from "lucide-react"

interface ConnectExchangeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectExchangeModal({ open, onOpenChange }: ConnectExchangeModalProps) {
  const router = useRouter()

  const handleConnectExchange = () => {
    // Close the modal
    onOpenChange(false)

    // Navigate to settings page
    router.push("/settings")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">Connect Exchange Required</DialogTitle>
          <DialogDescription className="pt-2">
            To execute trades based on signals, you need to connect your cryptocurrency exchange first.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4 py-4">
          <div className="rounded-md bg-blue-50 p-4 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200 flex items-start">
            <Shield className="h-5 w-5 mr-2 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
            <p>
              You'll need to provide your exchange API keys to execute trades. Your keys are encrypted and stored
              securely with AES-256 encryption.
            </p>
          </div>

          <div className="space-y-3 mt-2">
            <p className="text-sm font-medium">Benefits of connecting your exchange:</p>
            <ul className="space-y-2">
              <li className="flex items-center text-sm">
                <ChevronRight className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" />
                <span>Execute trades directly from signals</span>
              </li>
              <li className="flex items-center text-sm">
                <ChevronRight className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" />
                <span>Track your portfolio performance automatically</span>
              </li>
              <li className="flex items-center text-sm">
                <ChevronRight className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" />
                <span>Receive SELL signals for tokens you own</span>
              </li>
              <li className="flex items-center text-sm">
                <ChevronRight className="h-4 w-4 text-green-500 mr-1 flex-shrink-0" />
                <span>View real-time profit/loss tracking</span>
              </li>
            </ul>
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Later
          </Button>
          <Button onClick={handleConnectExchange} className="bg-blue-600 hover:bg-blue-700">
            Connect Exchange <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}