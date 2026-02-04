/**
 * FeedPanelPortal - Renders FeedPanel into the existing DOM container
 *
 * This component bridges React and the vanilla TS layout system by using
 * a portal to render into the #activity-feed element.
 */

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { FeedPanel } from './FeedPanel'

interface FeedPanelPortalProps {
  cwd?: string
}

export function FeedPanelPortal({ cwd }: FeedPanelPortalProps) {
  const [container, setContainer] = useState<HTMLElement | null>(null)

  useEffect(() => {
    // Try to find the container immediately
    const el = document.getElementById('activity-feed')
    if (el) {
      setContainer(el)
      return
    }

    // If not found, use MutationObserver to wait for it
    const observer = new MutationObserver(() => {
      const el = document.getElementById('activity-feed')
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

  return createPortal(<FeedPanel cwd={cwd} />, container)
}
