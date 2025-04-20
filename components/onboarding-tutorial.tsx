"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ArrowRight, Check } from "lucide-react"

interface OnboardingStep {
  title: string
  description: string
  image?: string
  action?: string
}

const onboardingSteps: OnboardingStep[] = [
  {
    title: "Welcome to Cycle Trader",
    description:
      "Cycle Trader helps you trade cryptocurrencies with real-time signals and portfolio management. Let's get you started with a quick tour.",
    image: "/images/onboarding/welcome.png",
  },
  {
    title: "Connect Your Exchange",
    description:
      "First, you'll need to connect your cryptocurrency exchange. We support Binance and BTCC. Your API keys are encrypted and stored securely.",
    image: "/images/onboarding/exchange.png",
    action: "Go to Settings",
  },
  {
    title: "Trading Signals",
    description:
      "You'll receive BUY and SELL signals based on your risk level. You can accept or skip signals, or let them auto-execute after a timeout.",
    image: "/images/onboarding/signals.png",
  },
  {
    title: "Position Building",
    description:
      "You can build positions incrementally by clicking 'Buy 10%' multiple times. The position tracker shows your accumulated percentage.",
    image: "/images/onboarding/position.png",
  },
  {
    title: "Trading Cycles",
    description:
      "Cycles represent the complete lifecycle of a position: Entry, Hold, and Exit. Visual indicators show the current state of each cycle.",
    image: "/images/onboarding/cycles.png",
  },
  {
    title: "Portfolio Management",
    description:
      "Track your portfolio value, holdings, and profit/loss in real-time. All data is synchronized with your exchange.",
    image: "/images/onboarding/portfolio.png",
  },
  {
    title: "Leaderboard",
    description:
      "Compare your performance with other traders on the leaderboard. See win/loss ratios and gain/loss percentages.",
    image: "/images/onboarding/leaderboard.png",
  },
  {
    title: "You're All Set!",
    description:
      "You're now ready to start trading with Cycle Trader. If you need help at any time, check the settings page for support options.",
    image: "/images/onboarding/complete.png",
    action: "Start Trading",
  },
]

interface OnboardingTutorialProps {
  onComplete: () => void
}

export function OnboardingTutorial({ onComplete }: OnboardingTutorialProps) {
  const [isOpen, setIsOpen] = useState(true)
  const [currentStep, setCurrentStep] = useState(0)
  const [hasSeenTutorial, setHasSeenTutorial] = useState(false)

  useEffect(() => {
    // Check if the user has already seen the tutorial
    const tutorialSeen = localStorage.getItem("onboarding_completed")
    if (tutorialSeen) {
      setHasSeenTutorial(true)
      setIsOpen(false)
    }
  }, [])

  const handleNext = () => {
    if (currentStep < onboardingSteps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      handleComplete()
    }
  }

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleComplete = () => {
    // Mark the tutorial as completed
    localStorage.setItem("onboarding_completed", "true")
    setIsOpen(false)
    onComplete()
  }

  const handleSkip = () => {
    // Mark the tutorial as completed even if skipped
    localStorage.setItem("onboarding_completed", "true")
    setIsOpen(false)
    onComplete()
  }

  if (hasSeenTutorial) {
    return null
  }

  const currentStepData = onboardingSteps[currentStep]
  const progress = ((currentStep + 1) / onboardingSteps.length) * 100

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{currentStepData.title}</DialogTitle>
          <DialogDescription>{currentStepData.description}</DialogDescription>
        </DialogHeader>

        {currentStepData.image && (
          <div className="my-4 overflow-hidden rounded-md">
            <img
              src={currentStepData.image || "/placeholder.svg"}
              alt={currentStepData.title}
              className="w-full object-cover"
            />
          </div>
        )}

        <Progress value={progress} className="h-2 w-full" />

        <DialogFooter className="flex flex-col sm:flex-row sm:justify-between gap-2">
          <div className="flex gap-2">
            {currentStep > 0 && (
              <Button variant="outline" onClick={handlePrevious}>
                Back
              </Button>
            )}
            <Button variant="ghost" onClick={handleSkip} className="text-muted-foreground">
              Skip Tutorial
            </Button>
          </div>
          <Button onClick={handleNext}>
            {currentStep < onboardingSteps.length - 1 ? (
              <>
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </>
            ) : (
              <>
                Complete <Check className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
