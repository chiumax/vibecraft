/**
 * useKeyboardShortcuts - React hook for keyboard shortcut handling
 *
 * Provides keyboard shortcut functionality for the app,
 * handling session switching, view toggling, and other actions.
 */

import { useEffect, useCallback } from 'react'
import { useAppStore } from '../stores'
import type { ViewType } from '../stores'

export interface UseKeyboardShortcutsOptions {
  /** Whether shortcuts are enabled */
  enabled?: boolean
  /** Callback when session is selected by number key */
  onSelectSession?: (index: number) => void
  /** Callback when overview mode is requested */
  onOverview?: () => void
  /** Callback when next attention is requested */
  onNextAttention?: () => void
  /** Callback when draw mode is toggled */
  onToggleDrawMode?: () => void
  /** Callback when dev panel is toggled */
  onToggleDevPanel?: () => void
}

/**
 * Hook to handle keyboard shortcuts
 */
export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions = {}) {
  const {
    enabled = true,
    onSelectSession,
    onOverview,
    onNextAttention,
    onToggleDrawMode,
    onToggleDevPanel,
  } = options

  const currentView = useAppStore((s) => s.currentView)
  const setCurrentView = useAppStore((s) => s.setCurrentView)
  const currentLayout = useAppStore((s) => s.currentLayout)

  // Toggle between views
  const toggleView = useCallback(() => {
    const newView: ViewType = currentView === 'feed' ? 'scene' : 'feed'
    setCurrentView(newView)
  }, [currentView, setCurrentView])

  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle shortcuts when typing in inputs
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        // Unless Alt is pressed (for session switching in inputs)
        if (!e.altKey) return
      }

      // Tab or Escape: toggle view
      if (e.key === 'Tab' || e.key === 'Escape') {
        e.preventDefault()
        toggleView()
        return
      }

      // Alt+A: go to next attention
      if (e.altKey && e.key.toLowerCase() === 'a') {
        e.preventDefault()
        onNextAttention?.()
        return
      }

      // Alt+D: toggle dev panel
      if (e.altKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        onToggleDevPanel?.()
        return
      }

      // Alt+N: new session (handled by other components)
      // Alt+R: toggle voice recording (handled by voice control)
      // Alt+Space: expand most recent show more (handled by feed)

      // D: toggle draw mode (when not in input)
      if (e.key.toLowerCase() === 'd' && !e.altKey && !e.ctrlKey && !e.metaKey) {
        onToggleDrawMode?.()
        return
      }

      // Number keys 1-6: select session
      if (/^[1-6]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) {
        const index = parseInt(e.key, 10) - 1
        onSelectSession?.(index)
        return
      }

      // 0 or backtick: overview
      if ((e.key === '0' || e.key === '`') && !e.altKey && !e.ctrlKey && !e.metaKey) {
        onOverview?.()
        return
      }

      // Alt+number: select session (works in inputs)
      if (e.altKey && /^[1-6]$/.test(e.key)) {
        e.preventDefault()
        const index = parseInt(e.key, 10) - 1
        onSelectSession?.(index)
        return
      }

      // Alt+0 or Alt+backtick: overview
      if (e.altKey && (e.key === '0' || e.key === '`')) {
        e.preventDefault()
        onOverview?.()
        return
      }

      // Extended keybinds: Q-Y = sessions 7-12
      const qwertyMap: Record<string, number> = {
        q: 6, w: 7, e: 8, r: 9, t: 10, y: 11,
      }
      if (qwertyMap[e.key.toLowerCase()] !== undefined && !e.altKey && !e.ctrlKey && !e.metaKey) {
        onSelectSession?.(qwertyMap[e.key.toLowerCase()])
        return
      }

      // Extended keybinds: A-H = sessions 13-18
      const asdfMap: Record<string, number> = {
        a: 12, s: 13, d: 14, f: 15, g: 16, h: 17,
      }
      // Note: 'a' conflicts with Alt+A for attention, handled above
      // 'd' conflicts with draw mode, handled above when not in input
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [
    enabled,
    toggleView,
    onSelectSession,
    onOverview,
    onNextAttention,
    onToggleDrawMode,
    onToggleDevPanel,
  ])

  return { toggleView }
}
