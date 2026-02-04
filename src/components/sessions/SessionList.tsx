/**
 * SessionList - List of all managed sessions
 *
 * Displays all sessions with their status and provides
 * session management actions.
 */

import { useCallback } from 'react'
import { useAppStore, getAppState } from '../../stores'
import { SessionItem } from './SessionItem'
import type { ManagedSession } from '@shared/types'
import { ZONE_COLORS } from '../../scene/WorkshopScene'

interface SessionListProps {
  /** Called when a session is selected */
  onSelectSession: (sessionId: string) => void
  /** Called when terminal toggle is clicked */
  onTerminalToggle: (sessionId: string) => void
  /** Called when restart is clicked */
  onRestart: (sessionId: string) => void
  /** Called when close is clicked */
  onClose: (sessionId: string) => void
  /** Called when new session button is clicked */
  onNewSession: () => void
  /** Called on right-click for context menu */
  onContextMenu: (e: React.MouseEvent, session: ManagedSession) => void
}

function getSessionKeybind(index: number): string | undefined {
  if (index >= 0 && index < 6) {
    return String(index + 1)
  }
  // Extended keybinds
  const extendedKeys = ['Q', 'W', 'E', 'R', 'T', 'Y', 'A', 'S', 'D', 'F', 'G', 'H']
  if (index >= 6 && index < 6 + extendedKeys.length) {
    return extendedKeys[index - 6]
  }
  return undefined
}

export function SessionList({
  onSelectSession,
  onTerminalToggle,
  onRestart,
  onClose,
  onNewSession,
  onContextMenu,
}: SessionListProps) {
  const managedSessions = useAppStore((s) => s.managedSessions)
  const selectedManagedSession = useAppStore((s) => s.selectedManagedSession)
  const attentionSystem = useAppStore((s) => s.attentionSystem)

  const needsAttention = useCallback(
    (sessionId: string): boolean => {
      return attentionSystem?.needsAttention(sessionId) ?? false
    },
    [attentionSystem]
  )

  const getSessionColor = useCallback((index: number): number => {
    return ZONE_COLORS[index % ZONE_COLORS.length]
  }, [])

  if (managedSessions.length === 0) {
    return (
      <div id="managed-sessions" className="empty">
        <div className="empty-state">
          <p>No sessions yet</p>
          <button className="new-session-btn" onClick={onNewSession}>
            + New Zone
          </button>
        </div>
      </div>
    )
  }

  return (
    <div id="managed-sessions">
      {managedSessions.map((session, index) => (
        <SessionItem
          key={session.id}
          session={session}
          color={getSessionColor(index)}
          isSelected={session.id === selectedManagedSession}
          needsAttention={needsAttention(session.id)}
          keybind={getSessionKeybind(index)}
          onClick={onSelectSession}
          onTerminalToggle={onTerminalToggle}
          onRestart={onRestart}
          onClose={onClose}
          onContextMenu={onContextMenu}
        />
      ))}
      <button className="new-session-btn" onClick={onNewSession}>
        + New Zone
      </button>
    </div>
  )
}
