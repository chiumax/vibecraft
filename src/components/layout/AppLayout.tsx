/**
 * AppLayout - Root layout component with responsive switching
 *
 * Automatically switches between desktop, tablet, and mobile layouts
 * based on screen width. Uses the same breakpoints as the original LayoutManager.
 */

import { useEffect, type ReactNode } from 'react'
import { useAppStore } from '../../stores'
import type { LayoutType, ViewType } from '../../stores'

const BREAKPOINTS = {
  mobile: 767,   // 0 - 767px
  tablet: 1023,  // 768 - 1023px
  desktop: Infinity, // 1024px+
}

function detectLayout(): LayoutType {
  const width = window.innerWidth
  if (width <= BREAKPOINTS.mobile) return 'mobile'
  if (width <= BREAKPOINTS.tablet) return 'tablet'
  return 'desktop'
}

interface AppLayoutProps {
  /** Content to render inside the layout */
  children?: ReactNode
  /** Callback when layout changes */
  onLayoutChange?: (layout: LayoutType, previousLayout: LayoutType | null) => void
  /** Callback when mobile view changes */
  onViewChange?: (view: ViewType) => void
}

export function AppLayout({ children, onLayoutChange, onViewChange }: AppLayoutProps) {
  const currentLayout = useAppStore((s) => s.currentLayout)
  const currentView = useAppStore((s) => s.currentView)
  const setCurrentLayout = useAppStore((s) => s.setCurrentLayout)

  // Handle resize and detect layout
  useEffect(() => {
    const handleResize = () => {
      const newLayout = detectLayout()
      if (newLayout !== currentLayout) {
        onLayoutChange?.(newLayout, currentLayout)
        setCurrentLayout(newLayout)
        // Update body class for CSS hooks
        document.body.classList.remove('layout-desktop', 'layout-tablet', 'layout-mobile')
        document.body.classList.add(`layout-${newLayout}`)
      }
    }

    // Initial detection
    const initialLayout = detectLayout()
    if (initialLayout !== currentLayout) {
      setCurrentLayout(initialLayout)
      document.body.classList.add(`layout-${initialLayout}`)
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [currentLayout, setCurrentLayout, onLayoutChange])

  // Notify when view changes
  useEffect(() => {
    onViewChange?.(currentView)
  }, [currentView, onViewChange])

  // For now, render children directly
  // The actual layout rendering will be done in future phases
  // when we migrate the scene and feed panels
  return <>{children}</>
}
