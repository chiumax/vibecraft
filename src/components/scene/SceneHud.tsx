/**
 * SceneHud - Overlay HUD for the 3D scene
 *
 * Shows connection status, username, token count, and settings button.
 */

import { useAppStore } from '../../stores'

interface SceneHudProps {
  /** Username to display */
  username?: string
  /** Status text */
  statusText?: string
  /** Token count */
  tokens?: number
  /** Called when settings button is clicked */
  onSettingsClick?: () => void
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

export function SceneHud({
  username = '...',
  statusText = '',
  tokens = 0,
  onSettingsClick,
}: SceneHudProps) {
  const connected = useAppStore((s) => s.connected)
  const showModal = useAppStore((s) => s.showModal)

  const handleSettingsClick = () => {
    if (onSettingsClick) {
      onSettingsClick()
    } else {
      showModal('settings')
    }
  }

  return (
    <div id="scene-hud">
      <div className="scene-badge unified-hud">
        <div
          id="status-dot"
          className={connected ? 'connected' : 'disconnected'}
        />
        <span id="username" className="hud-user">
          {username}
        </span>
        <span id="status-text">{statusText}</span>
        <span className="hud-sep">|</span>
        <span id="token-counter" className="hud-tokens" title="Tokens used this session">
          {formatTokens(tokens)} tok
        </span>
        <span className="hud-sep">|</span>
        <button
          id="settings-btn"
          className="hud-btn"
          title="Settings"
          onClick={handleSettingsClick}
        >
          Settings
        </button>
      </div>
    </div>
  )
}
