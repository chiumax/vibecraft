/**
 * ContextMenu - React context menu component
 *
 * Shows at cursor position with smart viewport clamping.
 * Dismisses when clicking outside or moving mouse away.
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

export interface ContextMenuItem {
  key: string
  label: string
  action: string
  danger?: boolean
}

export interface ContextMenuContext {
  worldPosition?: { x: number; z: number }
  zoneId?: string
  screenPosition: { x: number; y: number }
  [key: string]: unknown
}

interface ContextMenuState {
  visible: boolean
  items: ContextMenuItem[]
  context: ContextMenuContext | null
}

// Global context menu state
let menuListener: ((state: ContextMenuState) => void) | null = null
let currentState: ContextMenuState = {
  visible: false,
  items: [],
  context: null,
}
let actionHandler: ((action: string, context: ContextMenuContext) => void) | null = null

function notifyListener() {
  menuListener?.({ ...currentState })
}

// Imperative API
export const contextMenu = {
  show: (
    screenX: number,
    screenY: number,
    items: ContextMenuItem[],
    context: Omit<ContextMenuContext, 'screenPosition'>
  ) => {
    currentState = {
      visible: true,
      items,
      context: {
        ...context,
        screenPosition: { x: screenX, y: screenY },
      },
    }
    notifyListener()
  },

  hide: () => {
    currentState = {
      visible: false,
      items: [],
      context: null,
    }
    notifyListener()
  },

  isVisible: () => currentState.visible,
  getContext: () => currentState.context,

  setActionHandler: (handler: (action: string, context: ContextMenuContext) => void) => {
    actionHandler = handler
  },
}

export function ContextMenuContainer() {
  const [state, setState] = useState<ContextMenuState>(currentState)
  const menuRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    menuListener = setState
    return () => {
      menuListener = null
    }
  }, [])

  // Position adjustment after render
  useEffect(() => {
    if (!state.visible || !state.context || !menuRef.current) return

    const { x: screenX, y: screenY } = state.context.screenPosition
    let left = screenX + 10
    let top = screenY - 10

    // Keep in viewport
    const rect = menuRef.current.getBoundingClientRect()
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    if (left + rect.width > viewportWidth - 10) {
      left = screenX - rect.width - 10
    }
    if (top + rect.height > viewportHeight - 10) {
      top = screenY - rect.height + 10
    }

    setPosition({ left, top })
  }, [state.visible, state.context])

  // Dismiss on click outside
  useEffect(() => {
    if (!state.visible) return

    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        contextMenu.hide()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [state.visible])

  // Dismiss on mouse move far away
  useEffect(() => {
    if (!state.visible || !state.context) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!state.context) return
      const dx = e.clientX - state.context.screenPosition.x
      const dy = e.clientY - state.context.screenPosition.y
      const distance = Math.sqrt(dx * dx + dy * dy)

      if (distance > 150) {
        contextMenu.hide()
      }
    }

    document.addEventListener('mousemove', handleMouseMove)
    return () => document.removeEventListener('mousemove', handleMouseMove)
  }, [state.visible, state.context])

  // Keyboard shortcuts
  useEffect(() => {
    if (!state.visible) return

    const handleKeyDown = (e: KeyboardEvent) => {
      const inInput =
        e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (inInput) return

      const key = e.key.toUpperCase()
      const matchingItem = state.items.find((item) => item.key.toUpperCase() === key)

      if (matchingItem) {
        e.preventDefault()
        if (state.context && actionHandler) {
          actionHandler(matchingItem.action, state.context)
        }
        contextMenu.hide()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        contextMenu.hide()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [state.visible, state.items, state.context])

  const handleItemClick = useCallback(
    (action: string) => {
      if (state.context && actionHandler) {
        actionHandler(action, state.context)
      }
      contextMenu.hide()
    },
    [state.context]
  )

  if (!mounted || !state.visible) return null

  return createPortal(
    <div
      ref={menuRef}
      className={cn(
        'fixed z-[9998] bg-background border border-border rounded-lg shadow-lg p-1 min-w-[160px]',
        'animate-in fade-in-0 zoom-in-95 duration-100'
      )}
      style={{ left: position.left, top: position.top }}
    >
      <div className="space-y-0.5">
        {state.items.map((item) => (
          <div
            key={item.action}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded cursor-pointer',
              'hover:bg-secondary transition-colors',
              item.danger && 'text-red-400 hover:bg-red-500/20'
            )}
            onClick={() => handleItemClick(item.action)}
          >
            <span className="text-xs font-mono text-muted-foreground w-4 text-center">
              {item.key}
            </span>
            <span className="text-sm">{item.label}</span>
          </div>
        ))}
      </div>
      <div className="text-xs text-muted-foreground text-center mt-2 pt-2 border-t border-border">
        Move elsewhere to dismiss
      </div>
    </div>,
    document.body
  )
}
