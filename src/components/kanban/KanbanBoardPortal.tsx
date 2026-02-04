/**
 * KanbanBoardPortal - Renders KanbanBoard into #todos-board-view via portal
 */

import { createPortal } from 'react-dom'
import { useEffect, useState, useCallback } from 'react'
import { KanbanBoard } from './KanbanBoard'
import { useTodosStore } from '../../stores/todosStore'

interface KanbanBoardPortalProps {
  apiUrl?: string
  onSendPrompt?: (sessionId: string, prompt: string) => Promise<{ ok: boolean; error?: string }>
}

export function KanbanBoardPortal({ apiUrl = '/api', onSendPrompt }: KanbanBoardPortalProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const loadTodos = useTodosStore((s) => s.loadTodos)

  // Reload todos when board becomes visible
  const checkVisibility = useCallback(() => {
    const el = document.getElementById('todos-board-view')
    const visible = el ? !el.classList.contains('hidden') : false
    setIsVisible(visible)
    if (visible) {
      loadTodos()
    }
  }, [loadTodos])

  useEffect(() => {
    // Wait for the DOM element to be available
    const findContainer = () => {
      const el = document.getElementById('todos-board-view')
      if (el) {
        setContainer(el)
        return true
      }
      return false
    }

    // Try immediately
    if (!findContainer()) {
      // Use MutationObserver to wait for element
      const observer = new MutationObserver(() => {
        if (findContainer()) {
          observer.disconnect()
        }
      })

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      })

      return () => observer.disconnect()
    }
  }, [])

  // Watch for visibility changes (class changes on container)
  useEffect(() => {
    if (!container) return

    // Check initial visibility
    checkVisibility()

    // Watch for class changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          checkVisibility()
        }
      }
    })

    observer.observe(container, {
      attributes: true,
      attributeFilter: ['class'],
    })

    return () => observer.disconnect()
  }, [container, checkVisibility])

  if (!container) return null

  return createPortal(
    <KanbanBoard apiUrl={apiUrl} onSendPrompt={onSendPrompt} />,
    container
  )
}
