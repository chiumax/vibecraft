/**
 * FeedPanel - Activity feed container
 *
 * Renders events from the Zustand store with session filtering,
 * auto-scroll, and thinking indicators.
 */

import { useRef, useEffect, useCallback, useMemo, useState } from 'react'
import { useAppStore } from '../../stores'
import { ZONE_COLORS } from '../../scene/WorkshopScene'
import { FeedItem, ThinkingIndicator } from './FeedItem'
import { Button } from '../ui/button'
import { ChevronDown } from 'lucide-react'
import type { ClaudeEvent, PostToolUseEvent } from '@shared/types'

interface FeedPanelProps {
  /** Working directory for path shortening */
  cwd?: string
}

export function FeedPanel({ cwd }: FeedPanelProps) {
  const feedRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set())

  // Subscribe to store
  const eventHistory = useAppStore((s) => s.eventHistory)
  const managedSessions = useAppStore((s) => s.managedSessions)
  const selectedManagedSession = useAppStore((s) => s.selectedManagedSession)

  // Get the active filter session ID (claude session ID for filtering events)
  const activeFilter = useMemo(() => {
    if (!selectedManagedSession) return null
    const session = managedSessions.find((s) => s.id === selectedManagedSession)
    return session?.claudeSessionId ?? null
  }, [selectedManagedSession, managedSessions])

  // Get session color by claude session ID
  const getSessionColor = useCallback(
    (claudeSessionId: string): number | undefined => {
      const index = managedSessions.findIndex(
        (s) => s.claudeSessionId === claudeSessionId
      )
      if (index === -1) return undefined
      return ZONE_COLORS[index % ZONE_COLORS.length]
    },
    [managedSessions]
  )

  // Build completed data map (toolUseId -> post_tool_use data)
  const completedDataMap = useMemo(() => {
    const map = new Map<
      string,
      { success: boolean; duration?: number; response?: Record<string, unknown> }
    >()
    for (const event of eventHistory) {
      if (event.type === 'post_tool_use') {
        const e = event as PostToolUseEvent
        map.set(e.toolUseId, {
          success: e.success ?? false,
          duration: e.duration,
          response: e.toolResponse,
        })
      }
    }
    return map
  }, [eventHistory])

  // Filter events
  const filteredEvents = useMemo(() => {
    if (!activeFilter) return eventHistory
    return eventHistory.filter((e) => e.sessionId === activeFilter)
  }, [eventHistory, activeFilter])

  // Check if we're showing thinking indicator for any session
  const thinkingSessionIds = useMemo(() => {
    const ids = new Set<string>()
    for (const session of managedSessions) {
      if (session.status === 'working' && session.claudeSessionId) {
        ids.add(session.claudeSessionId)
      }
    }
    return ids
  }, [managedSessions])

  // Check if near bottom
  const isNearBottom = useCallback(() => {
    if (!feedRef.current) return true
    const threshold = 100
    const { scrollHeight, scrollTop, clientHeight } = feedRef.current
    return scrollHeight - scrollTop - clientHeight < threshold
  }, [])

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [])

  // Handle scroll event
  const handleScroll = useCallback(() => {
    setShowScrollBtn(!isNearBottom())
  }, [isNearBottom])

  // Auto-scroll on new events
  useEffect(() => {
    if (isNearBottom()) {
      requestAnimationFrame(scrollToBottom)
    }
  }, [filteredEvents.length, scrollToBottom, isNearBottom])

  // Handle show more
  const handleShowMore = useCallback((eventId: string) => {
    setExpandedEvents((prev) => new Set([...prev, eventId]))
  }, [])

  // Dedupe events by ID and skip post_tool_use (rendered inline with pre_tool_use)
  const dedupedEvents = useMemo(() => {
    const seen = new Set<string>()
    const result: ClaudeEvent[] = []
    for (const event of filteredEvents) {
      if (seen.has(event.id)) continue
      if (event.type === 'post_tool_use') continue // Rendered as part of pre_tool_use
      seen.add(event.id)
      result.push(event)
    }
    return result
  }, [filteredEvents])

  if (dedupedEvents.length === 0 && thinkingSessionIds.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
        <p>No activity yet</p>
        <p className="text-sm">Events will appear here when Claude starts working</p>
      </div>
    )
  }

  return (
    <div className="relative h-full flex flex-col">
      <div
        ref={feedRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1"
        onScroll={handleScroll}
      >
        {dedupedEvents.map((event) => {
          const toolUseId =
            event.type === 'pre_tool_use'
              ? (event as { toolUseId: string }).toolUseId
              : undefined

          return (
            <FeedItem
              key={event.id}
              event={event}
              sessionColor={getSessionColor(event.sessionId)}
              cwd={cwd}
              completedData={toolUseId ? completedDataMap.get(toolUseId) : undefined}
              onShowMore={handleShowMore}
            />
          )
        })}

        {/* Thinking indicators for working sessions */}
        {Array.from(thinkingSessionIds)
          .filter((id) => !activeFilter || id === activeFilter)
          .map((sessionId) => (
            <ThinkingIndicator
              key={`thinking-${sessionId}`}
              sessionColor={getSessionColor(sessionId)}
            />
          ))}
      </div>

      {/* Scroll to bottom button */}
      {showScrollBtn && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute bottom-4 right-4 rounded-full shadow-lg"
          onClick={scrollToBottom}
        >
          <ChevronDown className="h-4 w-4" />
        </Button>
      )}
    </div>
  )
}
