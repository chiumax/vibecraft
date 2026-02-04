/**
 * TranscriptPanel - Displays Claude's output in a clean readable format
 *
 * Shows text, tool uses, and thinking blocks from the TranscriptWatcher.
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react'
import { useAppStore } from '../../stores'
import { ZONE_COLORS } from '../../scene/WorkshopScene'
import { Button } from '../ui/button'
import { ChevronDown, MessageSquare, Wrench, Brain, Check, X } from 'lucide-react'
import type { TranscriptContent } from '@shared/types'

interface TranscriptPanelProps {
  /** Working directory for path shortening */
  cwd?: string
}

/** Format a single transcript entry */
function TranscriptEntry({
  content,
  sessionColor,
  cwd,
}: {
  content: TranscriptContent
  sessionColor?: number
  cwd?: string
}) {
  const colorStyle = sessionColor
    ? { borderLeftColor: `#${sessionColor.toString(16).padStart(6, '0')}` }
    : {}

  // Format tool use content
  const formatToolContent = () => {
    const metadata = content.metadata as { input?: Record<string, unknown> } | undefined
    const input = metadata?.input

    if (!input) return content.content

    // Special formatting for common tools
    switch (content.content) {
      case 'Read':
        return `Reading: ${(input.file_path as string) || 'unknown file'}`
      case 'Write':
        return `Writing: ${(input.file_path as string) || 'unknown file'}`
      case 'Edit':
        return `Editing: ${(input.file_path as string) || 'unknown file'}`
      case 'Bash':
        const cmd = (input.command as string) || ''
        return `$ ${cmd.length > 100 ? cmd.slice(0, 100) + '...' : cmd}`
      case 'Grep':
        return `Searching for: ${(input.pattern as string) || 'unknown'}`
      case 'Glob':
        return `Finding files: ${(input.pattern as string) || 'unknown'}`
      default:
        return content.content
    }
  }

  return (
    <div
      className="transcript-entry border-l-2 pl-3 py-2"
      style={colorStyle}
    >
      {content.type === 'text' && (
        <div className="transcript-text">
          <div className="flex items-start gap-2">
            <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {content.content}
            </div>
          </div>
        </div>
      )}

      {content.type === 'tool_use' && (
        <div className="transcript-tool-use">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wrench className="h-4 w-4 text-blue-500" />
            <span className="font-medium text-foreground">{content.content}</span>
            <span className="text-xs">{formatToolContent()}</span>
          </div>
        </div>
      )}

      {content.type === 'tool_result' && (
        <div className="transcript-tool-result">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-green-500" />
            <span className="text-xs truncate max-w-md">
              {content.content.slice(0, 100)}
              {content.content.length > 100 && '...'}
            </span>
          </div>
        </div>
      )}

      {content.type === 'thinking' && (
        <div className="transcript-thinking">
          <div className="flex items-start gap-2">
            <Brain className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
            <div className="text-sm text-muted-foreground italic whitespace-pre-wrap">
              {content.content}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function TranscriptPanel({ cwd }: TranscriptPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [showScrollBtn, setShowScrollBtn] = useState(false)

  // Subscribe to store
  const transcriptContent = useAppStore((s) => s.transcriptContent)
  const managedSessions = useAppStore((s) => s.managedSessions)
  const selectedManagedSession = useAppStore((s) => s.selectedManagedSession)

  // Get the active filter session ID (claude session ID for filtering)
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

  // Filter content by active session
  const filteredContent = useMemo(() => {
    if (!activeFilter) return transcriptContent
    return transcriptContent.filter((c) => c.sessionId === activeFilter)
  }, [transcriptContent, activeFilter])

  // Check if near bottom
  const isNearBottom = useCallback(() => {
    if (!panelRef.current) return true
    const threshold = 100
    const { scrollHeight, scrollTop, clientHeight } = panelRef.current
    return scrollHeight - scrollTop - clientHeight < threshold
  }, [])

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    if (panelRef.current) {
      panelRef.current.scrollTop = panelRef.current.scrollHeight
    }
  }, [])

  // Handle scroll event
  const handleScroll = useCallback(() => {
    setShowScrollBtn(!isNearBottom())
  }, [isNearBottom])

  // Auto-scroll on new content
  useEffect(() => {
    if (isNearBottom()) {
      requestAnimationFrame(scrollToBottom)
    }
  }, [filteredContent.length, scrollToBottom, isNearBottom])

  if (filteredContent.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center text-muted-foreground">
        <Brain className="h-8 w-8 mb-2 opacity-50" />
        <p>No transcript content yet</p>
        <p className="text-sm">Claude's output will appear here as it works</p>
      </div>
    )
  }

  return (
    <div className="relative h-full flex flex-col">
      <div
        ref={panelRef}
        className="flex-1 overflow-y-auto scrollbar-thin p-2 space-y-1"
        onScroll={handleScroll}
      >
        {filteredContent.map((content, index) => (
          <TranscriptEntry
            key={`${content.sessionId}-${content.timestamp}-${index}`}
            content={content}
            sessionColor={getSessionColor(content.sessionId)}
            cwd={cwd}
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
