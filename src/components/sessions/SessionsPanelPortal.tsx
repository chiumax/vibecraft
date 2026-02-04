/**
 * SessionsPanelPortal - Renders SessionsPanel into the existing DOM container
 *
 * This component bridges React and the vanilla TS layout system by using
 * a portal to render into the #managed-sessions element.
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { SessionsPanel } from './SessionsPanel'

interface SessionsPanelPortalProps {
  onSelectSession: (sessionId: string | null) => void
  onDeleteSession: (sessionId: string) => void
  onRestartSession: (sessionId: string, name: string) => void
  onDismissSession: (sessionId: string) => void
  onReactivateSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, newName: string) => void
  onNewSession: () => void
}

export function SessionsPanelPortal(props: SessionsPanelPortalProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    // Try to find the container immediately
    const el = document.getElementById('managed-sessions')
    if (el) {
      setContainer(el)
      return
    }

    // If not found, use MutationObserver to wait for it
    const observer = new MutationObserver(() => {
      const el = document.getElementById('managed-sessions')
      if (el) {
        setContainer(el)
        observer.disconnect()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [])

  if (!container) return null

  return createPortal(
    <SessionsPanel {...props} />,
    container
  )
}
