"use client"

import type React from "react"

interface TelegramAuthWrapperProps {
  children: React.ReactNode
}

export function TelegramAuthWrapper({ children }: TelegramAuthWrapperProps) {
  // Simply render the children with no authentication
  return <>{children}</>
}