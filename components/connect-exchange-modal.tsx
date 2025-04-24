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
import { ArrowRight } from "lucide-react"

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
          <DialogTitle>Connect Exchange Required</DialogTitle>
          <DialogDescription>
            To execute trades based on signals, you need to connect your cryptocurrency exchange first.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col space-y-4 py-4">
          <div className="rounded-md bg-amber-50 p-4 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
            <p>
              You'll need to provide your exchange API keys to execute trades. Your keys are encrypted and stored
              securely.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">What you'll need:</p>
            <ul className="list-disc pl-5 text-sm text-muted-foreground">
              <li>API key from Binance or BTCC</li>
              <li>API secret from your exchange</li>
              <li>Trading permissions enabled for your API key</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleConnectExchange}>
            Connect Exchange <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
