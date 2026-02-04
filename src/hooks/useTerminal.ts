/**
 * useTerminal - React hook for xterm.js terminal integration
 *
 * Manages the lifecycle of an xterm.js terminal instance within React,
 * handling initialization, cleanup, and resize.
 */

import { useEffect, useRef, useCallback, type RefObject } from 'react'
import { TerminalUI } from '../ui/Terminal'

export interface UseTerminalOptions {
  /** Callback when user types input */
  onData?: (data: string) => void
  /** Callback when terminal is resized */
  onResize?: (cols: number, rows: number) => void
  /** Whether terminal should be focused on mount */
  autoFocus?: boolean
}

export interface UseTerminalReturn {
  /** Reference to the terminal instance */
  terminalRef: RefObject<TerminalUI | null>
  /** Write data to the terminal */
  write: (data: string) => void
  /** Clear the terminal */
  clear: () => void
  /** Fit terminal to container */
  fit: () => void
  /** Focus the terminal */
  focus: () => void
  /** Get terminal dimensions */
  getDimensions: () => { cols: number; rows: number } | null
}

/**
 * Hook to manage an xterm.js terminal
 *
 * @param containerRef - Ref to the container element
 * @param options - Terminal options
 */
export function useTerminal(
  containerRef: RefObject<HTMLElement | null>,
  options: UseTerminalOptions = {}
): UseTerminalReturn {
  const terminalRef = useRef<TerminalUI | null>(null)
  const { onData, onResize, autoFocus = false } = options

  // Initialize terminal when container is available
  useEffect(() => {
    if (!containerRef.current) return

    // Create terminal
    const terminal = new TerminalUI({
      container: containerRef.current,
      onData,
      onResize,
    })

    terminalRef.current = terminal

    // Auto-focus if requested
    if (autoFocus) {
      terminal.focus()
    }

    // Cleanup on unmount
    return () => {
      terminal.dispose()
      terminalRef.current = null
    }
  }, [containerRef, onData, onResize, autoFocus])

  // Stable callbacks
  const write = useCallback((data: string) => {
    terminalRef.current?.write(data)
  }, [])

  const clear = useCallback(() => {
    terminalRef.current?.clear()
  }, [])

  const fit = useCallback(() => {
    terminalRef.current?.fit()
  }, [])

  const focus = useCallback(() => {
    terminalRef.current?.focus()
  }, [])

  const getDimensions = useCallback(() => {
    return terminalRef.current?.getDimensions() ?? null
  }, [])

  return {
    terminalRef,
    write,
    clear,
    fit,
    focus,
    getDimensions,
  }
}
