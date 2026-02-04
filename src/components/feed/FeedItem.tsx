/**
 * FeedItem - Individual event item in the activity feed
 */

import { useMemo } from 'react'
import type {
  ClaudeEvent,
  PreToolUseEvent,
  PostToolUseEvent,
  StopEvent,
  UserPromptSubmitEvent,
} from '@shared/types'
import { getToolIcon } from '../../utils/ToolUtils'
import { cn } from '../../lib/utils'

interface FeedItemProps {
  event: ClaudeEvent
  sessionColor?: number
  cwd?: string
  completedData?: { success: boolean; duration?: number; response?: Record<string, unknown> }
  onShowMore?: (eventId: string) => void
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}

function shortenPath(path: string, cwd?: string): string {
  if (!cwd || !path) return path
  const cwdNorm = cwd.endsWith('/') ? cwd.slice(0, -1) : cwd
  if (path.startsWith(cwdNorm + '/')) {
    return path.slice(cwdNorm.length + 1)
  }
  return path
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function FeedItem({
  event,
  sessionColor,
  cwd,
  completedData,
  onShowMore,
}: FeedItemProps) {
  const colorStyle = useMemo(() => {
    if (sessionColor === undefined) return {}
    return {
      borderLeftColor: `#${sessionColor.toString(16).padStart(6, '0')}`,
      borderLeftWidth: '3px',
      borderLeftStyle: 'solid' as const,
    }
  }, [sessionColor])

  const content = useMemo(() => {
    switch (event.type) {
      case 'user_prompt_submit': {
        const e = event as UserPromptSubmitEvent
        return (
          <div className="feed-item user-prompt" style={colorStyle}>
            <div className="feed-item-header">
              <div className="feed-item-icon">💬</div>
              <div className="feed-item-title">You</div>
              <div className="feed-item-time">{formatTime(event.timestamp)}</div>
            </div>
            <div className="feed-item-content prompt-text">
              {e.prompt}
            </div>
          </div>
        )
      }

      case 'pre_tool_use': {
        const e = event as PreToolUseEvent
        const icon = getToolIcon(e.tool)
        const isCompleted = !!completedData
        const success = completedData?.success ?? false
        const duration = completedData?.duration

        // Format tool details
        let detail = ''
        if (e.tool === 'Read' && e.toolInput?.file_path) {
          detail = shortenPath(String(e.toolInput.file_path), cwd)
        } else if (e.tool === 'Edit' && e.toolInput?.file_path) {
          detail = shortenPath(String(e.toolInput.file_path), cwd)
        } else if (e.tool === 'Write' && e.toolInput?.file_path) {
          detail = shortenPath(String(e.toolInput.file_path), cwd)
        } else if (e.tool === 'Bash' && e.toolInput?.command) {
          const cmd = String(e.toolInput.command)
          detail = cmd.length > 60 ? cmd.slice(0, 57) + '...' : cmd
        } else if ((e.tool === 'Grep' || e.tool === 'Glob') && e.toolInput?.pattern) {
          detail = String(e.toolInput.pattern)
        } else if (e.tool === 'Task' && e.toolInput?.description) {
          detail = String(e.toolInput.description)
        }

        return (
          <div
            className={cn(
              'feed-item tool-use',
              isCompleted && (success ? 'success' : 'error')
            )}
            style={colorStyle}
          >
            <div className="feed-item-header">
              <div className="feed-item-icon">{icon}</div>
              <div className="feed-item-title">{e.tool}</div>
              {detail && <div className="feed-item-detail">{detail}</div>}
              <div className="feed-item-time">
                {formatTime(event.timestamp)}
                {duration !== undefined && (
                  <span className="feed-item-duration"> · {formatDuration(duration)}</span>
                )}
              </div>
            </div>
            {!isCompleted && (
              <div className="feed-item-pending">
                <span className="spinner" />
              </div>
            )}
          </div>
        )
      }

      case 'stop': {
        const e = event as StopEvent
        const response = e.response

        if (response) {
          const isLong = response.length > 2000
          const displayResponse = isLong ? response.slice(0, 2000) : response

          return (
            <div className="feed-item assistant-response" style={colorStyle}>
              <div className="feed-item-header">
                <div className="feed-item-icon">🤖</div>
                <div className="feed-item-title">Claude</div>
                <div className="feed-item-time">{formatTime(event.timestamp)}</div>
              </div>
              <div className="feed-item-content assistant-text">
                {displayResponse}
                {isLong && (
                  <span
                    className="show-more cursor-pointer text-primary hover:underline"
                    onClick={() => onShowMore?.(event.id)}
                  >
                    ... [show more]
                  </span>
                )}
              </div>
            </div>
          )
        }

        return (
          <div className="feed-item lifecycle compact" style={colorStyle}>
            <div className="feed-item-header">
              <div className="feed-item-icon">🏁</div>
              <div className="feed-item-title">Stopped</div>
              <div className="feed-item-time">{formatTime(event.timestamp)}</div>
            </div>
          </div>
        )
      }

      default:
        return null
    }
  }, [event, colorStyle, cwd, completedData, onShowMore])

  if (!content) return null

  return content
}

export function ThinkingIndicator({
  sessionColor,
}: {
  sessionColor?: number
}) {
  const colorStyle = useMemo(() => {
    if (sessionColor === undefined) return {}
    return {
      borderLeftColor: `#${sessionColor.toString(16).padStart(6, '0')}`,
      borderLeftWidth: '3px',
      borderLeftStyle: 'solid' as const,
    }
  }, [sessionColor])

  return (
    <div className="feed-item thinking-indicator" style={colorStyle}>
      <div className="feed-item-header">
        <div className="feed-item-icon thinking-icon">🤔</div>
        <div className="feed-item-title">Claude is thinking</div>
        <div className="thinking-dots">
          <span>.</span>
          <span>.</span>
          <span>.</span>
        </div>
      </div>
    </div>
  )
}
