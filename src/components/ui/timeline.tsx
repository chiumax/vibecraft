/**
 * Timeline - React timeline component for tool usage history
 *
 * Displays tool usage as a horizontal strip of icons at the bottom.
 */

import { useMemo, useCallback, useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAppStore } from '../../stores'
import { getToolIcon } from '../../utils/ToolUtils'
import { ZONE_COLORS } from '../../scene/WorkshopScene'
import { cn } from '../../lib/utils'
import type { ClaudeEvent, PreToolUseEvent, PostToolUseEvent } from '@shared/types'

interface TimelineIconData {
  id: string
  eventId: string
  tool: string
  icon: string
  status: 'pending' | 'success' | 'fail'
  timestamp: number
  sessionId: string
  sessionColor?: number
  duration?: number
  toolUseId?: string
}

const MAX_ICONS = 50

export function Timeline() {
  const [mounted, setMounted] = useState(false)
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const eventHistory = useAppStore((s) => s.eventHistory)
  const managedSessions = useAppStore((s) => s.managedSessions)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Get session color by session ID
  const getSessionColor = useCallback(
    (sessionId: string): number | undefined => {
      const index = managedSessions.findIndex((s) => s.claudeSessionId === sessionId)
      if (index === -1) return undefined
      return ZONE_COLORS[index % ZONE_COLORS.length]
    },
    [managedSessions]
  )

  // Build completed map
  const completedMap = useMemo(() => {
    const map = new Map<string, { success: boolean; duration?: number }>()
    for (const event of eventHistory) {
      if (event.type === 'post_tool_use') {
        const e = event as PostToolUseEvent
        map.set(e.toolUseId, { success: e.success, duration: e.duration })
      }
    }
    return map
  }, [eventHistory])

  // Build timeline icons
  const icons = useMemo(() => {
    const result: TimelineIconData[] = []
    const seenIds = new Set<string>()

    for (const event of eventHistory) {
      if (seenIds.has(event.id)) continue
      seenIds.add(event.id)

      if (event.type === 'pre_tool_use') {
        const e = event as PreToolUseEvent
        const completed = completedMap.get(e.toolUseId)

        result.push({
          id: e.toolUseId,
          eventId: event.id,
          tool: e.tool,
          icon: getToolIcon(e.tool),
          status: completed ? (completed.success ? 'success' : 'fail') : 'pending',
          timestamp: event.timestamp,
          sessionId: event.sessionId,
          sessionColor: getSessionColor(event.sessionId),
          duration: completed?.duration,
          toolUseId: e.toolUseId,
        })
      }
    }

    // Limit to max icons
    return result.slice(-MAX_ICONS)
  }, [eventHistory, completedMap, getSessionColor])

  const handleMouseEnter = useCallback(
    (icon: TimelineIconData, e: React.MouseEvent) => {
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      const statusText = icon.status === 'pending' ? 'Running...' :
                        icon.status === 'success' ? 'Success' : 'Failed'
      const durationText = icon.duration ? ` (${(icon.duration / 1000).toFixed(1)}s)` : ''
      setTooltip({
        text: `${icon.tool} - ${statusText}${durationText}`,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
      })
    },
    []
  )

  const handleMouseLeave = useCallback(() => {
    setTooltip(null)
  }, [])

  if (!mounted) return null

  const container = document.getElementById('timeline')
  if (!container) return null

  return createPortal(
    <>
      <div ref={containerRef} className="flex gap-1 p-1">
        {icons.map((icon) => (
          <div
            key={icon.id}
            className={cn(
              'w-6 h-6 flex items-center justify-center rounded text-sm cursor-pointer',
              'transition-all duration-200 border-2',
              icon.status === 'pending' && 'bg-secondary animate-pulse border-secondary',
              icon.status === 'success' && 'bg-green-900/50 border-green-500/50',
              icon.status === 'fail' && 'bg-red-900/50 border-red-500/50'
            )}
            style={
              icon.sessionColor
                ? { borderColor: `#${icon.sessionColor.toString(16).padStart(6, '0')}` }
                : undefined
            }
            onMouseEnter={(e) => handleMouseEnter(icon, e)}
            onMouseLeave={handleMouseLeave}
          >
            {icon.icon}
          </div>
        ))}
      </div>
      {tooltip && (
        <div
          className="fixed z-[9999] px-2 py-1 bg-background border border-border rounded text-xs shadow-lg pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </>,
    container
  )
}
