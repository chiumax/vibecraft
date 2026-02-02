/**
 * SettingsModal - Settings modal setup and handlers
 *
 * Handles volume, spatial audio, streaming mode, grid size, port configuration,
 * and other application settings.
 */

import { state } from '../state'
import { soundManager } from '../audio'
import { drawMode } from './DrawMode'
import { setupKeybindSettings, updateVoiceHint } from './KeybindSettings'
import type { SessionAPI } from '../api'

// ============================================================================
// Audio Initialization
// ============================================================================

let audioInitialized = false

/**
 * Initialize audio on first user interaction (required by Web Audio API)
 */
export async function initAudioOnInteraction(): Promise<void> {
  if (audioInitialized) return
  audioInitialized = true

  try {
    await soundManager.init()
    console.log('Audio initialized on user interaction')
    // Play jazzy intro sound on first interaction
    soundManager.play('intro')
  } catch (e) {
    console.error('Failed to initialize audio:', e)
  }
}

// ============================================================================
// Settings Modal
// ============================================================================

/**
 * Setup settings modal
 */
export function setupSettingsModal(sessionAPI: SessionAPI, agentPort: number): void {
  const settingsBtn = document.getElementById('settings-btn')
  const modal = document.getElementById('settings-modal')
  const closeBtn = document.getElementById('settings-close')
  const volumeSlider = document.getElementById('settings-volume') as HTMLInputElement | null
  const volumeValue = document.getElementById('settings-volume-value')
  const spatialCheckbox = document.getElementById('settings-spatial-audio') as HTMLInputElement | null
  const streamingCheckbox = document.getElementById('settings-streaming-mode') as HTMLInputElement | null
  const stackShellCheckbox = document.getElementById('settings-stack-shell') as HTMLInputElement | null
  const gridSizeSlider = document.getElementById('settings-grid-size') as HTMLInputElement | null
  const gridSizeValue = document.getElementById('settings-grid-size-value')
  const refreshBtn = document.getElementById('settings-refresh-sessions')

  if (!modal) return

  // Setup keybind settings UI
  setupKeybindSettings()
  updateVoiceHint()

  // Initialize draw mode UI
  drawMode.init()

  // Wire up draw mode clear callback
  drawMode.onClear(() => {
    state.scene?.clearAllPaintedHexes()
    // Clear from localStorage too
    localStorage.removeItem('vibecraft-hexart')
    localStorage.removeItem('vibecraft-zone-elevations')
    console.log('Cleared hex art and zone elevations from localStorage')
  })

  // Port input
  const portInput = document.getElementById('settings-port') as HTMLInputElement | null
  const portStatus = document.getElementById('settings-port-status')

  // Load saved volume from localStorage
  const savedVolume = localStorage.getItem('vibecraft-volume')
  if (savedVolume !== null) {
    const vol = parseInt(savedVolume, 10) / 100
    soundManager.setVolume(vol)
    if (volumeSlider) volumeSlider.value = savedVolume
    if (volumeValue) volumeValue.textContent = `${savedVolume}%`
  }

  // Load saved grid size from localStorage
  const savedGridSize = localStorage.getItem('vibecraft-grid-size')
  if (savedGridSize !== null) {
    const size = parseInt(savedGridSize, 10)
    state.scene?.setGridRange(size)
    if (gridSizeSlider) gridSizeSlider.value = savedGridSize
    if (gridSizeValue) gridSizeValue.textContent = savedGridSize
  }

  // Load saved spatial audio setting from localStorage
  const savedSpatial = localStorage.getItem('vibecraft-spatial-audio')
  if (savedSpatial !== null) {
    const enabled = savedSpatial === 'true'
    soundManager.setSpatialEnabled(enabled)
    if (spatialCheckbox) spatialCheckbox.checked = enabled
  }

  // Load saved streaming mode setting from localStorage
  const savedStreaming = localStorage.getItem('vibecraft-streaming-mode')
  if (savedStreaming !== null) {
    const enabled = savedStreaming === 'true'
    if (streamingCheckbox) streamingCheckbox.checked = enabled
    applyStreamingMode(enabled)
  }

  // Apply streaming mode (hide/show username)
  function applyStreamingMode(enabled: boolean) {
    const usernameEl = document.getElementById('username')
    if (usernameEl) {
      if (enabled) {
        usernameEl.dataset.realName = usernameEl.textContent || ''
        usernameEl.textContent = '...'
      } else {
        usernameEl.textContent = usernameEl.dataset.realName || usernameEl.textContent
      }
    }
  }

  // Load saved stack-shell setting from localStorage
  const savedStackShell = localStorage.getItem('vibecraft-stack-shell')
  if (savedStackShell !== null) {
    const enabled = savedStackShell === 'true'
    if (stackShellCheckbox) stackShellCheckbox.checked = enabled
    applyStackShellMode(enabled)
  }

  // Apply stack-shell mode
  function applyStackShellMode(enabled: boolean) {
    const sessionsPanel = document.getElementById('sessions-panel')
    if (sessionsPanel) {
      if (enabled) {
        sessionsPanel.classList.add('stacked-shell')
      } else {
        sessionsPanel.classList.remove('stacked-shell')
      }
    }
  }

  // Open modal
  settingsBtn?.addEventListener('click', () => {
    // Sync slider/checkbox states with current settings
    if (volumeSlider) {
      const currentVol = Math.round(soundManager.getVolume() * 100)
      volumeSlider.value = String(currentVol)
      if (volumeValue) volumeValue.textContent = `${currentVol}%`
    }
    // Sync grid size slider
    if (gridSizeSlider && state.scene) {
      const currentSize = state.scene.getGridRange()
      gridSizeSlider.value = String(currentSize)
      if (gridSizeValue) gridSizeValue.textContent = String(currentSize)
    }
    // Sync spatial audio checkbox
    if (spatialCheckbox) {
      spatialCheckbox.checked = soundManager.isSpatialEnabled()
    }
    // Sync streaming mode checkbox
    if (streamingCheckbox) {
      streamingCheckbox.checked = localStorage.getItem('vibecraft-streaming-mode') === 'true'
    }
    // Sync stack-shell checkbox
    if (stackShellCheckbox) {
      stackShellCheckbox.checked = localStorage.getItem('vibecraft-stack-shell') === 'true'
    }
    // Sync port input
    if (portInput) portInput.value = String(agentPort)
    // Update port status
    if (portStatus) {
      const connected = state.client?.isConnected ?? false
      portStatus.textContent = connected ? '● Connected' : '○ Disconnected'
      portStatus.className = `port-status ${connected ? 'connected' : 'disconnected'}`
    }
    modal.classList.add('visible')
  })

  // Close modal
  const closeModal = () => modal.classList.remove('visible')
  closeBtn?.addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal()
  })

  // Volume slider - plays pitch-modulated tick on every change
  volumeSlider?.addEventListener('input', () => {
    const vol = parseInt(volumeSlider.value, 10)
    soundManager.setVolume(vol / 100)
    if (volumeValue) volumeValue.textContent = `${vol}%`
    localStorage.setItem('vibecraft-volume', String(vol))
    // Play tick with pitch based on slider position
    if (state.soundEnabled) {
      soundManager.playSliderTick(vol / 100)
    }
  })

  // Grid size slider - rebuilds hex grid on change
  gridSizeSlider?.addEventListener('input', () => {
    const size = parseInt(gridSizeSlider.value, 10)
    if (gridSizeValue) gridSizeValue.textContent = String(size)
    state.scene?.setGridRange(size)
    localStorage.setItem('vibecraft-grid-size', String(size))
    // Play tick with pitch based on slider position (normalized 5-80 to 0-1)
    if (state.soundEnabled) {
      soundManager.playSliderTick((size - 5) / 75)
    }
  })

  // Spatial audio checkbox
  spatialCheckbox?.addEventListener('change', () => {
    const enabled = spatialCheckbox.checked
    soundManager.setSpatialEnabled(enabled)
    localStorage.setItem('vibecraft-spatial-audio', String(enabled))
  })

  // Streaming mode checkbox
  streamingCheckbox?.addEventListener('change', () => {
    const enabled = streamingCheckbox.checked
    localStorage.setItem('vibecraft-streaming-mode', String(enabled))
    applyStreamingMode(enabled)
  })

  // Stack shell checkbox
  stackShellCheckbox?.addEventListener('change', () => {
    const enabled = stackShellCheckbox.checked
    localStorage.setItem('vibecraft-stack-shell', String(enabled))
    applyStackShellMode(enabled)
    // Refit active terminal after layout change
    if (state.activeShellId) {
      setTimeout(() => state.shells.get(state.activeShellId!)?.fit(), 50)
    }
  })

  // Port change - save to localStorage and prompt refresh
  portInput?.addEventListener('change', () => {
    const newPort = parseInt(portInput.value, 10)
    if (newPort && newPort > 0 && newPort <= 65535 && newPort !== agentPort) {
      localStorage.setItem('vibecraft-agent-port', String(newPort))
      if (confirm(`Port changed to ${newPort}. Reload page to connect to new port?`)) {
        window.location.reload()
      }
    }
  })

  // Refresh sessions button
  refreshBtn?.addEventListener('click', async () => {
    await sessionAPI.refreshSessions()
    closeModal()
  })

  // Escape to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) {
      closeModal()
    }
  })
}
