/**
 * SessionsPanel - Main sessions list panel
 *
 * This is the React replacement for the vanilla DOM session rendering.
 * It mounts into the #managed-sessions element.
 */

import { useCallback } from 'react'
import { useAppStore, getAppState, showAppModal } from '../../stores'
import { ZONE_COLORS } from '../../scene/WorkshopScene'
import { formatTimeAgo } from '../../utils/formatters'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'
import type { ManagedSession } from '@shared/types'

interface SessionsPanelProps {
  onSelectSession: (sessionId: string | null) => void
  onDeleteSession: (sessionId: string) => void
  onRestartSession: (sessionId: string, name: string) => void
  onDismissSession: (sessionId: string) => void
  onReactivateSession: (sessionId: string) => void
  onRenameSession: (sessionId: string, newName: string) => void
  onNewSession: () => void
}

function getSessionKeybind(index: number): string | undefined {
  if (index >= 0 && index < 6) {
    return String(index + 1)
  }
  const extendedKeys = ['Q', 'W', 'E', 'R', 'T', 'Y', 'A', 'S', 'D', 'F', 'G', 'H']
  if (index >= 6 && index < 6 + extendedKeys.length) {
    return extendedKeys[index - 6]
  }
  return undefined
}

export function SessionsPanel({
  onSelectSession,
  onDeleteSession,
  onRestartSession,
  onDismissSession,
  onReactivateSession,
  onRenameSession,
  onNewSession,
}: SessionsPanelProps) {
  const managedSessions = useAppStore((s) => s.managedSessions)
  const selectedManagedSession = useAppStore((s) => s.selectedManagedSession)
  const attentionSystem = useAppStore((s) => s.attentionSystem)
  const attentionVersion = useAppStore((s) => s.attentionVersion)
  const lastPrompts = useAppStore((s) => s.lastPrompts)

  const needsAttention = useCallback(
    (sessionId: string): boolean => {
      return attentionSystem?.needsAttention(sessionId) ?? false
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [attentionSystem, attentionVersion] // attentionVersion triggers re-check
  )

  const getSessionColor = useCallback((index: number): number => {
    return ZONE_COLORS[index % ZONE_COLORS.length]
  }, [])

  const handleRename = useCallback((session: ManagedSession) => {
    const newName = window.prompt('Enter new name:', session.name)
    if (newName && newName !== session.name) {
      onRenameSession(session.id, newName)
    }
  }, [onRenameSession])

  const handleDelete = useCallback((session: ManagedSession) => {
    if (window.confirm(`Delete session "${session.name}"?`)) {
      onDeleteSession(session.id)
    }
  }, [onDeleteSession])

  if (managedSessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <p className="text-muted-foreground mb-4">No sessions yet</p>
        <Button onClick={onNewSession} variant="secondary" size="sm">
          + New Zone
        </Button>
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="h-full overflow-y-auto scrollbar-thin">
          {managedSessions.map((session, index) => {
            const color = getSessionColor(index)
            const colorHex = `#${color.toString(16).padStart(6, '0')}`
            const hasAttention = needsAttention(session.id)
            const isSelected = session.id === selectedManagedSession
            const hotkey = index < 6 ? getSessionKeybind(index) : undefined
            const lastPrompt = session.claudeSessionId
              ? lastPrompts.get(session.claudeSessionId)
              : null
            const truncatedPrompt = lastPrompt
              ? (lastPrompt.length > 35 ? lastPrompt.slice(0, 32) + '...' : lastPrompt)
              : null

            // Build detail line
            const projectName = session.cwd ? session.cwd.split('/').pop() : ''
            let detail = ''
            if (hasAttention) {
              detail = '⚡ Needs attention'
            } else if (session.status === 'waiting') {
              detail = `⏳ Waiting for permission: ${session.currentTool || 'Unknown'}`
            } else if (session.currentTool) {
              detail = `Using ${session.currentTool}`
            } else if (session.status === 'offline') {
              detail = session.lastActivity
                ? `Offline · was ${formatTimeAgo(session.lastActivity)}`
                : 'Offline - click 🔄 to restart'
            } else if (session.status === 'dismissed') {
              detail = '💤 Dismissed - click ▶️ to reactivate'
            } else {
              detail = projectName ? `📁 ${projectName}` : 'Ready'
            }

            const lastActive = session.lastActivity ? formatTimeAgo(session.lastActivity) : ''
            const showLastActive = !hasAttention
              && session.status !== 'offline'
              && session.status !== 'dismissed'
              && lastActive

            // Tooltip content
            const tooltipContent = [
              `Name: ${session.name}`,
              `Status: ${session.status}`,
              `tmux: ${session.tmuxSession}`,
              session.claudeSessionId ? `Claude ID: ${session.claudeSessionId.slice(0, 12)}...` : 'Not linked yet',
              session.cwd ? `Dir: ${session.cwd}` : '',
              session.lastActivity ? `Last active: ${new Date(session.lastActivity).toLocaleString()}` : '',
              lastPrompt ? `Last prompt: ${lastPrompt}` : '',
            ].filter(Boolean).join('\n')

            return (
              <Tooltip key={session.id}>
                <TooltipTrigger asChild>
                  <div
                    className={`
                      flex items-center gap-2 px-3 py-2 mx-1 my-0.5 rounded-md cursor-pointer
                      transition-colors border border-transparent
                      hover:bg-secondary/50
                      ${isSelected ? 'bg-secondary border-primary/50' : ''}
                      ${hasAttention ? 'border-yellow-500/50 bg-yellow-500/10' : ''}
                      ${session.status === 'offline' ? 'opacity-60' : ''}
                    `}
                    onClick={() => onSelectSession(session.id)}
                    style={{ '--session-color': colorHex } as React.CSSProperties}
                  >
                    {/* Hotkey */}
                    {hotkey && (
                      <span className="text-xs text-muted-foreground w-4 text-center font-mono">
                        {hotkey}
                      </span>
                    )}

                    {/* Status dot */}
                    <span
                      className={`
                        w-2 h-2 rounded-full flex-shrink-0
                        ${session.status === 'working' ? 'animate-pulse' : ''}
                      `}
                      style={{ backgroundColor: colorHex }}
                    />

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-medium truncate">
                          {session.name}
                        </span>
                        {session.status === 'working' && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">
                            working
                          </Badge>
                        )}
                      </div>
                      <div className={`
                        text-xs truncate
                        ${hasAttention ? 'text-yellow-500' : ''}
                        ${session.status === 'waiting' ? 'text-amber-400' : ''}
                        ${session.status === 'dismissed' ? 'text-muted-foreground/50' : 'text-muted-foreground'}
                      `}>
                        {detail}
                        {showLastActive && ` · ${lastActive}`}
                      </div>
                      {truncatedPrompt && (
                        <div className="text-xs text-muted-foreground/70 truncate">
                          💬 {truncatedPrompt}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                      {session.status === 'offline' && (
                        <button
                          className="p-1 hover:bg-secondary rounded text-xs"
                          onClick={() => onRestartSession(session.id, session.name)}
                          title="Restart session"
                        >
                          🔄
                        </button>
                      )}
                      {session.status === 'dismissed' && (
                        <button
                          className="p-1 hover:bg-secondary rounded text-xs"
                          onClick={() => onReactivateSession(session.id)}
                          title="Reactivate session"
                        >
                          ▶️
                        </button>
                      )}
                      {session.status !== 'offline' && session.status !== 'dismissed' && (
                        <button
                          className="p-1 hover:bg-secondary rounded text-xs opacity-50 hover:opacity-100"
                          onClick={() => onDismissSession(session.id)}
                          title="Dismiss (keep context)"
                        >
                          💤
                        </button>
                      )}
                      <button
                        className="p-1 hover:bg-secondary rounded text-xs opacity-50 hover:opacity-100"
                        onClick={() => handleRename(session)}
                        title="Rename"
                      >
                        ✏️
                      </button>
                      <button
                        className="p-1 hover:bg-secondary rounded text-xs opacity-50 hover:opacity-100 hover:text-red-400"
                        onClick={() => handleDelete(session)}
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="max-w-xs whitespace-pre-wrap text-xs">
                  {tooltipContent}
                </TooltipContent>
              </Tooltip>
            )
          })}
      </div>
    </TooltipProvider>
  )
}
