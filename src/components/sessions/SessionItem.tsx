/**
 * SessionItem - A single session in the sessions list
 *
 * Displays session name, status, and provides actions like
 * terminal toggle, restart, and close.
 */

import type { ManagedSession } from '@shared/types'
import { ContextIndicatorCompact } from './ContextIndicator'

interface SessionItemProps {
  session: ManagedSession
  /** Color associated with this session */
  color: number
  /** Whether this session is currently selected */
  isSelected: boolean
  /** Whether this session needs attention */
  needsAttention: boolean
  /** Keybind to show (e.g., "1", "2") */
  keybind?: string
  /** Called when session is clicked */
  onClick: (sessionId: string) => void
  /** Called when terminal toggle is clicked */
  onTerminalToggle: (sessionId: string) => void
  /** Called when restart is clicked (for offline sessions) */
  onRestart: (sessionId: string) => void
  /** Called when close is clicked */
  onClose: (sessionId: string) => void
  /** Called on right-click for context menu */
  onContextMenu: (e: React.MouseEvent, session: ManagedSession) => void
}

export function SessionItem({
  session,
  color,
  isSelected,
  needsAttention,
  keybind,
  onClick,
  onTerminalToggle,
  onRestart,
  onClose,
  onContextMenu,
}: SessionItemProps) {
  const colorHex = `#${color.toString(16).padStart(6, '0')}`

  const statusIcons: Record<string, string> = {
    idle: '💤',
    working: '⚙️',
    waiting: '⏳',
    offline: '❌',
    dismissed: '🚫',
  }

  const handleClick = () => onClick(session.id)
  const handleTerminalClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onTerminalToggle(session.id)
  }
  const handleRestartClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onRestart(session.id)
  }
  const handleCloseClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onClose(session.id)
  }
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    onContextMenu(e, session)
  }

  return (
    <div
      className={`managed-session ${isSelected ? 'selected' : ''} ${needsAttention ? 'attention' : ''} ${session.status === 'offline' ? 'offline' : ''}`}
      data-session-id={session.id}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      style={{ '--session-color': colorHex } as React.CSSProperties}
    >
      <div className="session-dot" style={{ background: colorHex }} />

      <div className="session-info">
        <div className="session-name-row">
          <span className="session-name">{session.name}</span>
          <ContextIndicatorCompact context={session.context} />
          {keybind && <span className="session-keybind">{keybind}</span>}
        </div>
        <div className="session-meta">
          <span className="session-status">
            {statusIcons[session.status] || '❓'} {session.status}
          </span>
          {session.currentTool && (
            <span className="session-tool">{session.currentTool}</span>
          )}
        </div>
      </div>

      <div className="session-actions">
        <button
          className="session-action-btn terminal-toggle"
          onClick={handleTerminalClick}
          title="Toggle terminal"
        >
          ⌨️
        </button>
        {session.status === 'offline' && (
          <button
            className="session-action-btn restart-btn"
            onClick={handleRestartClick}
            title="Restart session"
          >
            🔄
          </button>
        )}
        <button
          className="session-action-btn close-btn"
          onClick={handleCloseClick}
          title="Close session"
        >
          ✕
        </button>
      </div>
    </div>
  )
}
