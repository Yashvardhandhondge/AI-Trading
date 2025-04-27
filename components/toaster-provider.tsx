"use client"

import { Toaster } from "sonner"

export function ToasterProvider() {
  return (
    <Toaster 
      position="top-right" 
      toastOptions={{
        style: {
          background: "var(--background)",
          color: "var(--foreground)",
          border: "1px solid var(--border)"
        },
        className: "font-sans shadow-lg",
      }}
    />
  )
}