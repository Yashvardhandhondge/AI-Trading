"use client"

/**
 * Performance optimization utilities for Cycle Trader
 *
 * This module provides utilities for optimizing performance,
 * particularly for mobile devices.
 */

import { useEffect, useState } from "react"
import { logger } from "@/lib/logger"

// Detect if the device is a mobile device
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      return mobile
    }

    // Initial check
    const mobile = checkMobile()

    // Log for performance tracking
    logger.debug(`Device detected as ${mobile ? "mobile" : "desktop"}`, {
      context: "performance",
      data: {
        width: window.innerWidth,
        height: window.innerHeight,
        userAgent: navigator.userAgent,
      },
    })

    // Add resize listener
    window.addEventListener("resize", checkMobile)

    // Cleanup
    return () => window.removeEventListener("resize", checkMobile)
  }, [])

  return isMobile
}

// Measure component render time
export function useRenderTime(componentName: string) {
  useEffect(() => {
    const startTime = performance.now()

    return () => {
      const endTime = performance.now()
      const renderTime = endTime - startTime

      logger.debug(`Component render time: ${renderTime.toFixed(2)}ms`, {
        context: "performance",
        data: {
          component: componentName,
          renderTime,
        },
      })
    }
  }, [componentName])
}

// Optimize images based on device
export function getOptimizedImageUrl(url: string, isMobile: boolean): string {
  if (!url) return url

  // If it's a placeholder, adjust size based on device
  if (url.includes("/placeholder.svg")) {
    const width = isMobile ? 400 : 800
    const height = isMobile ? 300 : 600
    return `/placeholder.svg?height=${height}&width=${width}`
  }

  // For real images, we could add size parameters or use different versions
  // This is just a placeholder implementation
  return url
}

// Debounce function for performance-intensive operations
export function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout)

    timeout = setTimeout(() => {
      func(...args)
    }, wait)
  }
}

// Throttle function for performance-intensive operations
export function throttle<T extends (...args: any[]) => any>(func: T, limit: number): (...args: Parameters<T>) => void {
  let inThrottle = false

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => {
        inThrottle = false
      }, limit)
    }
  }
}

// Measure API call performance
export async function measureApiPerformance<T>(apiCall: () => Promise<T>, apiName: string): Promise<T> {
  const startTime = performance.now()

  try {
    const result = await apiCall()
    const endTime = performance.now()
    const duration = endTime - startTime

    logger.debug(`API call performance: ${duration.toFixed(2)}ms`, {
      context: "performance",
      data: {
        api: apiName,
        duration,
      },
    })

    return result
  } catch (error) {
    const endTime = performance.now()
    const duration = endTime - startTime

    logger.error(
      `API call failed after ${duration.toFixed(2)}ms`,
      error instanceof Error ? error : new Error(String(error)),
      {
        context: "performance",
        data: {
          api: apiName,
          duration,
        },
      },
    )

    throw error
  }
}
