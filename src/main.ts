/**
 * Vibecraft - Main Entry Point
 *
 * Visualize Claude Code as an interactive 3D workshop
 * Supports multiple Claude instances in separate zones
 */

import './styles/index.css'
import * as THREE from 'three'
import { WorkshopScene, ZONE_COLORS, type Zone, type CameraMode } from './scene/WorkshopScene'
// Character model - swap by changing the import:
// import { Claude } from './entities/Claude'      // Original simple character
import { Claude } from './entities/ClaudeMon'      // Robot buddy character
import { SubagentManager } from './entities/SubagentManager'
import { EventClient } from './events/EventClient'
import { eventBus, type EventContext, type EventType } from './events/EventBus'
import { registerAllHandlers } from './events/handlers'
import {
  type ClaudeEvent,
  type PreToolUseEvent,
  type PostToolUseEvent,
  type ManagedSession,
} from '../shared/types'
import { soundManager } from './audio'

// Expose for console testing (can remove in production)
;(window as any).soundManager = soundManager
import { setupVoiceControl, type VoiceState } from './ui/VoiceControl'
import { getToolIcon } from './utils/ToolUtils'
import { AttentionSystem } from './systems/AttentionSystem'
import { TimelineManager } from './ui/TimelineManager'
import { formatTokens, formatTimeAgo, escapeHtml } from './ui/FeedManager'
import { ContextMenu, type ContextMenuContext } from './ui/ContextMenu'
import { setupKeyboardShortcuts, getSessionKeybind } from './ui/KeyboardShortcuts'
import { setupKeybindSettings, updateVoiceHint } from './ui/KeybindSettings'
import {
  setupQuestionModal,
  showQuestionModal,
  hideQuestionModal,
  type QuestionData,
} from './ui/QuestionModal'
import { toast } from './ui/Toast'
import {
  setupZoneInfoModal,
  showZoneInfoModal,
  setZoneInfoSoundEnabled,
} from './ui/ZoneInfoModal'
import {
  setupZoneCommandModal,
  showZoneCommandModal,
} from './ui/ZoneCommandModal'
import {
  setupPermissionModal,
  showPermissionModal,
  hidePermissionModal,
} from './ui/PermissionModal'
// Removed: SlashCommands (no longer needed without prompt form)
import { setupDirectoryAutocomplete } from './ui/DirectoryAutocomplete'
import { checkForUpdates } from './ui/VersionChecker'
import { drawMode } from './ui/DrawMode'
import { setupTextLabelModal, showTextLabelModal } from './ui/TextLabelModal'
import { createSessionAPI, type SessionAPI } from './api'
import { TerminalManager, TerminalUI } from './ui/Terminal'
import { initLayoutManager, getLayoutManager, type LayoutType } from './ui/LayoutManager'
import { initTodosManager, getTodosManager } from './ui/TodosManager'

// ============================================================================
// Configuration
// ============================================================================

// Injected by Vite at build time from shared/defaults.ts
declare const __VIBECRAFT_DEFAULT_PORT__: number

// Port configuration: URL param > localStorage > default from shared/defaults.ts
function getAgentPort(): number {
  const params = new URLSearchParams(window.location.search)
  const urlPort = params.get('port')
  if (urlPort) return parseInt(urlPort, 10)

  const storedPort = localStorage.getItem('vibecraft-agent-port')
  if (storedPort) return parseInt(storedPort, 10)

  return __VIBECRAFT_DEFAULT_PORT__
}

const AGENT_PORT = getAgentPort()

// In dev, Vite proxies /ws and /api to the server
// In prod (hosted), connect to localhost where user's agent runs
const WS_URL = import.meta.env.DEV
  ? `ws://${window.location.host}/ws`
  : `ws://${window.location.hostname}:${AGENT_PORT}`

const API_URL = import.meta.env.DEV
  ? '/api'
  : `http://${window.location.hostname}:${AGENT_PORT}`

// Create session API instance
const sessionAPI = createSessionAPI(API_URL)

// ============================================================================
// State
// ============================================================================

/** Per-session state */
interface SessionState {
  claude: Claude
  subagents: SubagentManager
  zone: Zone
  color: number
  stats: {
    toolsUsed: number
    filesTouched: Set<string>
    activeSubagents: number
  }
}

interface AppState {
  scene: WorkshopScene | null
  client: EventClient | null
  sessions: Map<string, SessionState>
  focusedSessionId: string | null  // Currently focused session for camera/prompts
  eventHistory: ClaudeEvent[]
  managedSessions: ManagedSession[]  // Managed sessions from server
  selectedManagedSession: string | null  // Selected managed session ID for prompts
  serverCwd: string  // Server's working directory
  attentionSystem: AttentionSystem | null  // Manages attention queue and notifications
  timelineManager: TimelineManager | null  // Manages icon timeline
  terminalManager: TerminalManager | null  // Manages PTY terminal sessions
  shells: Map<string, TerminalUI>  // Multiple standalone shell terminals
  activeShellId: string | null  // Currently active shell ID
  shellCounter: number  // Counter for generating shell IDs
  soundEnabled: boolean  // Whether to play sounds
  hasAutoOverviewed: boolean  // Whether we've done initial auto-overview for 2+ sessions
  userChangedCamera: boolean  // Whether user has manually changed camera (to avoid overriding)
  voice: VoiceState | null  // Voice input state and controls
  lastPrompts: Map<string, string>  // Last prompt sent per Claude session ID
}

const state: AppState = {
  scene: null,
  client: null,
  sessions: new Map(),
  focusedSessionId: null,
  eventHistory: [],
  serverCwd: '~',
  managedSessions: [],
  selectedManagedSession: null,
  attentionSystem: null,  // Initialized in init()
  timelineManager: null,  // Initialized in init()
  terminalManager: null,  // Initialized in init()
  shells: new Map(),  // Shell terminals
  activeShellId: null,
  shellCounter: 0,
  soundEnabled: true,
  hasAutoOverviewed: false,
  userChangedCamera: false,
  voice: null,  // Initialized in setupVoiceInput()
  lastPrompts: new Map(),
}

// Expose for console testing (can remove in production)
;(window as any).state = state

// Track pending zone hints for direction-aware placement
// Maps managed session name → click position (used when zone is created)
const pendingZoneHints = new Map<string, { x: number; z: number }>()

// Track pending zones to clean up when real zone appears
// Maps managed session name → pending zone ID
const pendingZonesToCleanup = new Map<string, string>()

// Track zone creation timeouts (pendingId → timeoutId)
const pendingZoneTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

// Zone creation timeout in ms
const ZONE_CREATION_TIMEOUT = 10000

// ============================================================================
// Managed Sessions (Orchestration)
// ============================================================================

/**
 * Render the managed sessions list
 */
function renderManagedSessions(): void {
  const container = document.getElementById('managed-sessions')
  if (!container) return

  container.innerHTML = ''

  state.managedSessions.forEach((session, index) => {
    const el = document.createElement('div')
    el.className = 'session-item'
    if (session.id === state.selectedManagedSession) {
      el.classList.add('active')
    }

    // Check if session needs attention
    const needsAttention = state.attentionSystem?.needsAttention(session.id) ?? false
    if (needsAttention) {
      el.classList.add('needs-attention')
    }

    const statusClass = session.status
    const hotkey = index < 6 ? getSessionKeybind(index) : '' // 1-6 shown in UI

    // Time since last activity (needed for detail line)
    const lastActive = session.lastActivity
      ? formatTimeAgo(session.lastActivity)
      : ''

    // Build detail line with status and project
    const projectName = session.cwd ? session.cwd.split('/').pop() : ''
    let detail = ''
    if (needsAttention) {
      detail = '⚡ Needs attention'
    } else if (session.status === 'waiting') {
      detail = `⏳ Waiting for permission: ${session.currentTool || 'Unknown'}`
    } else if (session.currentTool) {
      detail = `Using ${session.currentTool}`
    } else if (session.status === 'offline') {
      detail = lastActive ? `Offline · was ${lastActive}` : 'Offline - click 🔄 to restart'
    } else if (session.status === 'dismissed') {
      detail = '💤 Dismissed - click ▶️ to reactivate'
    } else {
      detail = projectName ? `📁 ${projectName}` : 'Ready'
    }
    const detailClass = session.status === 'working' ? 'session-detail working'
      : session.status === 'waiting' ? 'session-detail attention'
      : needsAttention ? 'session-detail attention'
      : session.status === 'dismissed' ? 'session-detail dismissed'
      : 'session-detail'

    // Get last prompt for this session (via claudeSessionId)
    const lastPrompt = session.claudeSessionId ? state.lastPrompts.get(session.claudeSessionId) : null
    const truncatedPrompt = lastPrompt
      ? (lastPrompt.length > 35 ? lastPrompt.slice(0, 32) + '...' : lastPrompt)
      : null

    // Build detailed tooltip
    const tooltipParts = [
      `Name: ${session.name}`,
      `Status: ${session.status}`,
      `tmux: ${session.tmuxSession}`,
      session.claudeSessionId ? `Claude ID: ${session.claudeSessionId.slice(0, 12)}...` : 'Not linked yet',
      session.cwd ? `Dir: ${session.cwd}` : '',
      session.lastActivity ? `Last active: ${new Date(session.lastActivity).toLocaleString()}` : '',
      lastPrompt ? `Last prompt: ${lastPrompt}` : '',
    ].filter(Boolean)
    el.title = tooltipParts.join('\n')

    el.innerHTML = `
      ${hotkey ? `<div class="session-hotkey">${hotkey}</div>` : ''}
      <div class="session-status ${statusClass}"></div>
      <div class="session-info">
        <div class="session-name">${escapeHtml(session.name)}</div>
        <div class="${detailClass}">${detail}${!needsAttention && session.status !== 'offline' && session.status !== 'dismissed' && lastActive ? ` · ${lastActive}` : ''}</div>
        ${truncatedPrompt ? `<div class="session-prompt">💬 ${escapeHtml(truncatedPrompt)}</div>` : ''}
      </div>
      <div class="session-actions">
        ${session.status === 'offline' ? `<button class="restart-btn" title="Restart session">🔄</button>` : ''}
        ${session.status === 'dismissed' ? `<button class="reactivate-btn" title="Reactivate session">▶️</button>` : ''}
        ${session.status !== 'offline' && session.status !== 'dismissed' ? `<button class="dismiss-btn" title="Dismiss (keep context)">💤</button>` : ''}
        <button class="rename-btn" title="Rename">✏️</button>
        <button class="delete-btn" title="Delete">🗑️</button>
      </div>
    `

    // Click to select and filter
    el.addEventListener('click', (e) => {
      // Ignore if clicking action buttons
      if ((e.target as HTMLElement).closest('.session-actions')) return
      selectManagedSession(session.id)
    })

    // Rename button
    el.querySelector('.rename-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      const newName = prompt('Enter new name:', session.name)
      if (newName && newName !== session.name) {
        renameManagedSession(session.id, newName)
      }
    })

    // Delete button
    el.querySelector('.delete-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      if (confirm(`Delete session "${session.name}"?`)) {
        deleteManagedSession(session.id)
      }
    })

    // Restart button (only shown for offline sessions)
    el.querySelector('.restart-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      restartManagedSession(session.id, session.name)
    })

    // Dismiss button (grey out but keep tmux alive)
    el.querySelector('.dismiss-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      dismissManagedSession(session.id)
    })

    // Reactivate button (for dismissed sessions)
    el.querySelector('.reactivate-btn')?.addEventListener('click', (e) => {
      e.stopPropagation()
      reactivateManagedSession(session.id)
    })

    container.appendChild(el)
  })
}

/**
 * Select a managed session for prompts (null = all/legacy mode)
 * Also focuses the 3D zone if available
 */
function selectManagedSession(sessionId: string | null): void {
  state.selectedManagedSession = sessionId
  renderManagedSessions()
  // Sound is played in focusSession() when the zone is focused

  // Persist selection to localStorage
  if (sessionId) {
    localStorage.setItem('vibecraft-selected-session', sessionId)
  } else {
    localStorage.removeItem('vibecraft-selected-session')
  }

  // Show terminal for selected session (PTY is now the only mode)
  if (sessionId) {
    const session = state.managedSessions.find(s => s.id === sessionId)

    // Focus the 3D zone if session is linked
    if (session?.claudeSessionId && state.scene) {
      state.scene.focusZone(session.claudeSessionId)
      focusSession(session.claudeSessionId)
    }

    // Show terminal for this session
    showTerminalForSession(sessionId)
  } else {
    hideTerminal()

    // Switch to overview mode showing all zones
    if (state.scene) {
      state.scene.setOverviewMode()
    }
  }
}

/**
 * Create a new managed session
 */
interface SessionFlags {
  continue?: boolean
  skipPermissions?: boolean
  chrome?: boolean
}

async function createManagedSession(
  name?: string,
  cwd?: string,
  flags?: SessionFlags,
  hintPosition?: { x: number; z: number },
  pendingZoneId?: string
): Promise<void> {
  // PTY is now the only mode - always use PTY
  const data = await sessionAPI.createSession(name, cwd, flags, true)

  if (!data.ok) {
    console.error('Failed to create session:', data.error)
    // Show offline banner if not connected, otherwise show alert
    if (!state.client?.isConnected) {
      showOfflineBanner()
    } else {
      alert(`Failed to create session: ${data.error}`)
    }
    // Clean up pending zone on failure
    if (pendingZoneId && state.scene) {
      state.scene.removePendingZone(pendingZoneId)
    }
    return
  }

  // Store hint position using the ACTUAL name from server response
  // Server auto-generates "Claude N" if no name provided, so we must use its name
  // Also store pending zone ID so we can remove it when real zone appears
  const actualName = data.session?.name
  if (actualName) {
    if (hintPosition) {
      pendingZoneHints.set(actualName, hintPosition)
    }
    if (pendingZoneId) {
      pendingZonesToCleanup.set(actualName, pendingZoneId)
    }
  }

  // DON'T remove pending zone here - keep it spinning until real zone appears
  // Session will be broadcast via WebSocket
}

/**
 * Fetch server info (cwd, etc.) and update UI
 */
async function fetchServerInfo(): Promise<void> {
  const data = await sessionAPI.getServerInfo()
  if (data.ok && data.cwd) {
    state.serverCwd = data.cwd
    // Update modal display
    const cwdEl = document.getElementById('modal-default-cwd')
    if (cwdEl) {
      cwdEl.textContent = data.cwd
    }
  }
}

/**
 * Rename a managed session
 */
async function renameManagedSession(sessionId: string, name: string): Promise<void> {
  const data = await sessionAPI.renameSession(sessionId, name)
  if (!data.ok) {
    console.error('Failed to rename session:', data.error)
  }
  // Update will be broadcast via WebSocket
}

/**
 * Save zone position for a managed session (persists grid layout)
 */
async function saveZonePosition(sessionId: string, position: { q: number; r: number }): Promise<void> {
  const data = await sessionAPI.saveZonePosition(sessionId, position)
  if (!data.ok) {
    console.error('Failed to save zone position:', data.error)
  }
}

/**
 * Delete a managed session
 */
async function deleteManagedSession(sessionId: string): Promise<void> {
  const data = await sessionAPI.deleteSession(sessionId)
  if (!data.ok) {
    console.error('Failed to delete session:', data.error)
  }
  // If we deleted the selected session, clear selection
  if (state.selectedManagedSession === sessionId) {
    state.selectedManagedSession = null
    const targetEl = document.getElementById('prompt-target')
    if (targetEl) targetEl.innerHTML = ''
  }
  // Update will be broadcast via WebSocket
}

/**
 * Restart an offline session
 */
async function restartManagedSession(sessionId: string, sessionName: string): Promise<void> {
  // Show feedback while restarting
  const statusEl = document.getElementById('connection-status')
  const originalText = statusEl?.textContent
  if (statusEl) {
    statusEl.textContent = `Restarting ${sessionName}...`
    statusEl.className = ''
  }

  const data = await sessionAPI.restartSession(sessionId)

  if (!data.ok) {
    console.error('Failed to restart session:', data.error)
    if (statusEl) {
      statusEl.textContent = `Failed: ${data.error}`
      statusEl.className = 'error'
      setTimeout(() => {
        statusEl.textContent = originalText || 'Connected'
        statusEl.className = 'connected'
      }, 3000)
    }
  } else {
    if (statusEl) {
      statusEl.textContent = `${sessionName} restarted!`
      statusEl.className = 'connected'
      setTimeout(() => {
        statusEl.textContent = originalText || 'Connected'
      }, 2000)
    }
  }
  // Update will be broadcast via WebSocket
}

/**
 * Dismiss a managed session (grey out but keep tmux alive)
 */
async function dismissManagedSession(sessionId: string): Promise<void> {
  const data = await sessionAPI.dismissSession(sessionId)
  if (!data.ok) {
    console.error('Failed to dismiss session:', data.error)
  }
  // Update will be broadcast via WebSocket
}

/**
 * Reactivate a dismissed session
 */
async function reactivateManagedSession(sessionId: string): Promise<void> {
  const data = await sessionAPI.reactivateSession(sessionId)
  if (!data.ok) {
    console.error('Failed to reactivate session:', data.error)
  }
  // Update will be broadcast via WebSocket
}

/**
 * Send a prompt to the selected managed session
 */
async function sendPromptToManagedSession(prompt: string, sessionId?: string): Promise<{ ok: boolean; error?: string }> {
  const targetSession = sessionId ?? state.selectedManagedSession
  if (!targetSession) {
    return { ok: false, error: 'No session selected' }
  }

  return sessionAPI.sendPrompt(targetSession, prompt)
}

// ============================================================================
// Attention System Helpers
// ============================================================================

/** Go to the next session needing attention */
function goToNextAttention(): void {
  if (!state.attentionSystem) return

  const session = state.attentionSystem.getNext(state.managedSessions)
  if (!session) return

  // Select and focus
  state.userChangedCamera = true  // User intentionally chose this view
  selectManagedSession(session.id)
  if (session.claudeSessionId && state.scene) {
    state.scene.focusZone(session.claudeSessionId)
    focusSession(session.claudeSessionId)
  }
}

/**
 * Setup managed sessions UI
 */

// Current zone hint for the open modal (set when modal opens from click)
let currentModalHint: { x: number; z: number } | null = null

/**
 * Open the new session modal (callable from anywhere)
 * @param hintPosition - Optional world position from click for direction-aware placement
 */
function openNewSessionModal(hintPosition?: { x: number; z: number }): void {
  const modal = document.getElementById('new-session-modal')
  const nameInput = document.getElementById('session-name-input') as HTMLInputElement
  const cwdInput = document.getElementById('session-cwd-input') as HTMLInputElement

  if (!modal) return

  // Store hint for when session is created
  currentModalHint = hintPosition ?? null

  // Request notification permission on first interaction
  AttentionSystem.requestPermission()

  // Reset inputs
  if (nameInput) {
    nameInput.value = ''
    nameInput.dataset.autoFilled = 'false'
  }
  if (cwdInput) cwdInput.value = ''

  modal.classList.add('visible')

  // Play modal open sound
  soundManager.play('modal_open')

  // Focus directory input after animation (it's now first)
  setTimeout(() => cwdInput?.focus(), 100)
}

function setupManagedSessions(): void {
  // Modal elements
  const modal = document.getElementById('new-session-modal')
  const nameInput = document.getElementById('session-name-input') as HTMLInputElement
  const cwdInput = document.getElementById('session-cwd-input') as HTMLInputElement
  const defaultCwdEl = document.getElementById('modal-default-cwd')
  const cancelBtn = document.getElementById('modal-cancel')
  const createBtn = document.getElementById('modal-create')

  // Default cwd will be set by fetchServerInfo()

  // Setup directory autocomplete
  if (cwdInput) {
    setupDirectoryAutocomplete(cwdInput)
  }

  // Auto-populate name from directory when cwd changes
  if (cwdInput && nameInput) {
    cwdInput.addEventListener('input', () => {
      // Only auto-fill if name is empty or was auto-filled before
      if (nameInput.value.trim() === '' || nameInput.dataset.autoFilled === 'true') {
        const cwd = cwdInput.value.trim()
        if (cwd) {
          // Extract basename (last path component)
          const basename = cwd.replace(/\/+$/, '').split('/').pop() || ''
          if (basename) {
            // Check for duplicate names and add suffix if needed
            let name = basename
            let suffix = 1
            while (state.managedSessions.some(s => s.name === name)) {
              suffix++
              name = `${basename} ${suffix}`
            }
            nameInput.value = name
            nameInput.dataset.autoFilled = 'true'
          }
        }
      }
    })

    // Mark as manually edited when user types in name field
    nameInput.addEventListener('input', () => {
      nameInput.dataset.autoFilled = 'false'
    })
  }

  const closeModal = (): void => {
    modal?.classList.remove('visible')
    currentModalHint = null  // Clear hint when modal closes
  }

  const handleCreate = (): void => {
    const name = nameInput?.value.trim() || undefined
    const cwd = cwdInput?.value.trim() || undefined

    // Read flag checkboxes
    const continueCheck = document.getElementById('session-opt-continue') as HTMLInputElement
    const skipPermsCheck = document.getElementById('session-opt-skip-perms') as HTMLInputElement
    const chromeCheck = document.getElementById('session-opt-chrome') as HTMLInputElement

    const flags: SessionFlags = {
      continue: continueCheck?.checked ?? true,
      skipPermissions: skipPermsCheck?.checked ?? true,
      chrome: chromeCheck?.checked ?? false,
    }

    // Capture hint before closing modal (closeModal clears it)
    const hintPosition = currentModalHint

    // Create pending zone immediately for visual feedback
    const pendingId = `pending-${Date.now()}`
    if (state.scene) {
      state.scene.createPendingZone(pendingId, hintPosition ?? undefined)
    }

    // Set timeout to show troubleshooting modal if zone doesn't start
    const timeoutId = setTimeout(() => {
      // Check if this pending zone still exists (wasn't cleaned up)
      for (const [, pId] of pendingZonesToCleanup) {
        if (pId === pendingId) {
          showZoneTimeoutModal()
          break
        }
      }
      pendingZoneTimeouts.delete(pendingId)
    }, ZONE_CREATION_TIMEOUT)
    pendingZoneTimeouts.set(pendingId, timeoutId)

    // Play confirm sound
    soundManager.play('modal_confirm')

    closeModal()
    createManagedSession(name, cwd, flags, hintPosition ?? undefined, pendingId)
  }

  const handleCancel = (): void => {
    soundManager.play('modal_cancel')
    closeModal()
  }

  // New session button opens modal (no hint position from button click)
  const newBtn = document.getElementById('new-session-btn')
  if (newBtn) {
    newBtn.addEventListener('click', () => openNewSessionModal())
  }

  // Modal cancel button
  if (cancelBtn) {
    cancelBtn.addEventListener('click', handleCancel)
  }

  // Modal create button
  if (createBtn) {
    createBtn.addEventListener('click', handleCreate)
  }

  // Close on Escape key (also plays cancel sound)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('visible')) {
      soundManager.play('modal_cancel')
      closeModal()
    }
  })

  // Close on backdrop click
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        closeModal()
      }
    })
  }

  // Enter key in inputs triggers create
  const handleEnter = (e: KeyboardEvent): void => {
    if (e.key === 'Enter' && modal?.classList.contains('visible')) {
      handleCreate()
    }
  }
  nameInput?.addEventListener('keydown', handleEnter)
  cwdInput?.addEventListener('keydown', handleEnter)

  // Initial render
  renderManagedSessions()
}

// ============================================================================
// Context Menu (appears at click location for create/delete actions)
// ============================================================================

let contextMenu: ContextMenu | null = null

function handleContextMenuAction(action: string, context: ContextMenuContext): void {
  if (action === 'create' && context.worldPosition) {
    openNewSessionModal({ x: context.worldPosition.x, z: context.worldPosition.z })
  } else if (action === 'command' && context.zoneId) {
    showZoneCommand(context.zoneId)
  } else if (action === 'info' && context.zoneId) {
    showZoneInfo(context.zoneId)
  } else if (action === 'delete' && context.zoneId) {
    deleteZoneBySessionId(context.zoneId)
  } else if (action === 'create_text_tile' && context.hexPosition) {
    createTextTileAtHex(context.hexPosition as { q: number; r: number })
  } else if (action === 'edit_text_tile' && context.textTileId) {
    editTextTile(context.textTileId as string)
  } else if (action === 'delete_text_tile' && context.textTileId) {
    deleteTextTile(context.textTileId as string)
  }
}

/**
 * Show the zone info modal for a session
 */
function showZoneInfo(sessionId: string): void {
  // Find the managed session
  const managed = state.managedSessions.find(s => s.claudeSessionId === sessionId)
  if (!managed) {
    console.warn('No managed session found for zone:', sessionId)
    return
  }

  // Get session stats if available
  const sessionState = state.sessions.get(sessionId)
  const stats = sessionState?.stats

  showZoneInfoModal({
    managedSession: managed,
    stats,
  })
}

/**
 * Show the zone command modal for quick commands to a specific zone
 */
function showZoneCommand(sessionId: string): void {
  // Find the managed session
  const managed = state.managedSessions.find(s => s.claudeSessionId === sessionId)
  if (!managed) {
    console.warn('No managed session found for zone:', sessionId)
    return
  }

  // Get zone position
  const zone = state.scene?.getZone(sessionId)
  if (!zone || !state.scene) {
    console.warn('No zone found for session:', sessionId)
    return
  }

  showZoneCommandModal({
    sessionId: managed.id,
    sessionName: managed.name,
    sessionColor: zone.color,
    zonePosition: zone.position,
    camera: state.scene.camera,
    renderer: state.scene.renderer,
    onSend: async (id: string, prompt: string) => {
      return sendPromptToManagedSession(prompt, id)
    },
  })
}

/**
 * Create a text tile at a hex position (opens modal for text)
 */
async function createTextTileAtHex(hex: { q: number; r: number }): Promise<void> {
  const text = await showTextLabelModal({
    title: 'Add Label',
    placeholder: 'Enter your label text here...\nSupports multiple lines.',
  })
  if (!text?.trim()) return

  try {
    await fetch(`${API_URL}/tiles`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: text.trim(),
        position: hex,
      }),
    })
  } catch (e) {
    console.error('Failed to create text tile:', e)
  }
}

/**
 * Edit an existing text tile
 */
async function editTextTile(tileId: string): Promise<void> {
  const tile = state.scene?.getTextTiles().find(t => t.id === tileId)
  if (!tile) return

  const text = await showTextLabelModal({
    title: 'Edit Label',
    placeholder: 'Enter your label text here...',
    initialText: tile.text,
  })
  if (text === null || text.trim() === tile.text) return

  try {
    await fetch(`${API_URL}/tiles/${tileId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.trim() }),
    })
  } catch (e) {
    console.error('Failed to update text tile:', e)
  }
}

/**
 * Delete a text tile
 */
async function deleteTextTile(tileId: string): Promise<void> {
  try {
    await fetch(`${API_URL}/tiles/${tileId}`, {
      method: 'DELETE',
    })
  } catch (e) {
    console.error('Failed to delete text tile:', e)
  }
}

/**
 * Delete a zone (finds the managed session and deletes it)
 */
async function deleteZoneBySessionId(zoneId: string): Promise<void> {
  // Find the managed session for this zone
  const managedSession = state.managedSessions.find(
    s => s.claudeSessionId === zoneId
  )

  if (!managedSession) {
    console.warn('No managed session found for zone:', zoneId)
    return
  }

  // Use existing delete function
  await deleteManagedSession(managedSession.id)
}

function setupContextMenu(): void {
  contextMenu = new ContextMenu({
    onAction: handleContextMenuAction,
  })
}

// ============================================================================
// Keyboard Shortcuts & Camera Modes
// ============================================================================

/**
 * Setup click handler to focus session when clicking on Claude
 */
function setupClickToPrompt(): void {
  if (!state.scene) return

  const raycaster = new THREE.Raycaster()
  const mouse = new THREE.Vector2()

  // Track mousedown position to distinguish clicks from drags
  let mouseDownPos: { x: number; y: number } | null = null
  const CLICK_THRESHOLD = 5  // pixels - if moved more than this, it's a drag

  // Draw mode drag painting state
  let isDrawModeDragging = false
  const paintedThisDrag = new Set<string>()  // Track hexes painted during current drag

  // Debounced save for hex art persistence (includes zone elevations)
  let hexArtSaveTimer: ReturnType<typeof setTimeout> | null = null
  const saveHexArt = () => {
    if (hexArtSaveTimer) clearTimeout(hexArtSaveTimer)
    hexArtSaveTimer = setTimeout(() => {
      if (!state.scene) return
      const hexes = state.scene.getPaintedHexes()
      const zoneElevations = state.scene.getZoneElevations()
      localStorage.setItem('vibecraft-hexart', JSON.stringify(hexes))
      localStorage.setItem('vibecraft-zone-elevations', JSON.stringify(zoneElevations))
      const elevCount = Object.keys(zoneElevations).length
      console.log(`Saved ${hexes.length} painted hexes and ${elevCount} zone elevations to localStorage`)
    }, 500)  // Debounce 500ms
  }

  // Helper to paint with brush size
  const paintWithBrush = (centerHex: { q: number; r: number }, playSound: boolean) => {
    if (!state.scene) return

    const brushSize = drawMode.getBrushSize()
    const color = drawMode.getSelectedColor()
    const hexesToPaint = state.scene.hexGrid.getHexesInRadius(centerHex, brushSize)

    let anyPainted = false
    for (const hex of hexesToPaint) {
      const hexKey = `${hex.q},${hex.r}`
      if (!paintedThisDrag.has(hexKey)) {
        paintedThisDrag.add(hexKey)
        if (color === null) {
          state.scene.clearPaintedHex(hex)
        } else {
          state.scene.paintHex(hex, color)
        }
        anyPainted = true
      }
    }

    if (anyPainted && playSound && state.soundEnabled) {
      soundManager.play('click')
    }

    // Save to localStorage (debounced)
    if (anyPainted) {
      saveHexArt()
    }
  }

  // Helper to convert pointer event to normalized coordinates and raycast
  const raycastFromPointer = (event: PointerEvent | MouseEvent) => {
    const rect = state.scene!.renderer.domElement.getBoundingClientRect()
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
    raycaster.setFromCamera(mouse, state.scene!.camera)
  }

  // Long-press support for touch context menu
  let longPressTimer: ReturnType<typeof setTimeout> | null = null
  let longPressTriggered = false
  const LONG_PRESS_DURATION = 500 // ms

  const clearLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  // Disable touch scrolling/zooming on canvas for proper touch handling
  state.scene.renderer.domElement.style.touchAction = 'none'

  // Helper to find which zone was clicked (returns sessionId or null)
  const findClickedZone = (): string | null => {
    for (const [sessionId, zone] of state.scene!.zones) {
      const intersects = raycaster.intersectObject(zone.group, true)
      if (intersects.length > 0) return sessionId
    }
    // Also check Claude meshes
    for (const [sessionId, session] of state.sessions) {
      const intersects = raycaster.intersectObject(session.claude.mesh, true)
      if (intersects.length > 0) return sessionId
    }
    return null
  }

  state.scene.renderer.domElement.addEventListener('pointerdown', (event) => {
    mouseDownPos = { x: event.clientX, y: event.clientY }
    longPressTriggered = false

    // Start long-press timer for touch context menu
    if (event.pointerType === 'touch') {
      clearLongPress()
      longPressTimer = setTimeout(() => {
        longPressTriggered = true
        // Trigger context menu on long press
        raycastFromPointer(event)
        const sessionId = findClickedZone()

        if (sessionId) {
          const managed = state.managedSessions.find(s => s.claudeSessionId === sessionId)
          const zoneName = managed?.name || sessionId.slice(0, 8)
          contextMenu?.show(
            event.clientX,
            event.clientY,
            [
              { key: 'C', label: `Command`, action: 'command' },
              { key: 'I', label: `Info`, action: 'info' },
              { key: 'D', label: `Dismiss "${zoneName}"`, action: 'delete', danger: true },
            ],
            { zoneId: sessionId }
          )
        }
      }, LONG_PRESS_DURATION)
    }

    // Start draw mode drag painting
    if (drawMode.isEnabled() && event.button === 0) {
      isDrawModeDragging = true
      paintedThisDrag.clear()

      // Paint the initial hex(es) with brush
      raycastFromPointer(event)
      if (state.scene!.worldFloor) {
        const floorIntersects = raycaster.intersectObject(state.scene!.worldFloor)
        if (floorIntersects.length > 0) {
          const point = floorIntersects[0].point
          const hex = state.scene!.hexGrid.cartesianToHex(point.x, point.z)
          paintWithBrush(hex, true)
          // Spawn click pulse at zone elevation if clicking on a zone
          const zone = state.scene!.getZoneAtHex(hex)
          const pulseY = zone ? zone.elevation + 0.03 : 0.03
          state.scene!.spawnClickPulse(point.x, point.z, 0x4ac8e8, pulseY)
        }
      }
    }
  })

  // Stop draw mode dragging if pointer released anywhere (safety net)
  window.addEventListener('pointerup', () => {
    clearLongPress()
    if (isDrawModeDragging) {
      isDrawModeDragging = false
      paintedThisDrag.clear()
    }
  })

  // Cancel long press if pointer moves
  window.addEventListener('pointermove', () => {
    if (longPressTimer) {
      clearLongPress()
    }
  })

  // Draw mode drag painting on pointermove
  state.scene.renderer.domElement.addEventListener('pointermove', (event) => {
    if (!state.scene || !isDrawModeDragging || !drawMode.isEnabled()) return

    raycastFromPointer(event)
    if (state.scene.worldFloor) {
      // Check both floor and painted hexes (for painting on top of existing)
      const floorIntersects = raycaster.intersectObject(state.scene.worldFloor)
      const paintedHexMeshes = state.scene.getPaintedHexMeshes()
      const paintedIntersects = paintedHexMeshes.length > 0
        ? raycaster.intersectObjects(paintedHexMeshes)
        : []

      const allIntersects = [...floorIntersects, ...paintedIntersects]
        .sort((a, b) => a.distance - b.distance)

      if (allIntersects.length > 0) {
        const point = allIntersects[0].point
        const hex = state.scene.hexGrid.cartesianToHex(point.x, point.z)
        paintWithBrush(hex, true)
      }
    }
  })

  // Left-click/tap handler
  state.scene.renderer.domElement.addEventListener('pointerup', (event) => {
    clearLongPress()

    // Stop draw mode dragging
    if (isDrawModeDragging) {
      isDrawModeDragging = false
      paintedThisDrag.clear()
    }

    if (!state.scene || !mouseDownPos) return

    // Skip if long press was triggered (context menu already shown)
    if (longPressTriggered) {
      mouseDownPos = null
      return
    }

    // Check if this was a drag (pointer moved too much)
    const dx = event.clientX - mouseDownPos.x
    const dy = event.clientY - mouseDownPos.y
    const distance = Math.sqrt(dx * dx + dy * dy)
    mouseDownPos = null

    if (distance > CLICK_THRESHOLD) {
      // This was a drag/pan, not a click - ignore
      return
    }

    raycastFromPointer(event)

    // In draw mode, skip zone/Claude focus - painting is handled in mousedown/mousemove
    if (drawMode.isEnabled()) {
      return
    }

    // Check entire zone groups (platform, ring, stations, everything)
    // This makes clicking anywhere in a zone select it
    for (const [sessionId, zone] of state.scene.zones) {
      const intersects = raycaster.intersectObject(zone.group, true)
      if (intersects.length > 0) {
        state.userChangedCamera = true  // User clicked to select
        state.scene!.focusZone(sessionId)
        focusSession(sessionId)

        // Play focus sound for zone click
        if (state.soundEnabled) {
          soundManager.play('focus')
        }

        // Select the managed session if linked
        const managed = state.managedSessions.find(s => s.claudeSessionId === sessionId)
        if (managed) {
          selectManagedSession(managed.id)
          state.attentionSystem?.remove(managed.id)
        }
        return
      }
    }

    // Also check Claude meshes (they're not in the zone group)
    for (const [sessionId, session] of state.sessions) {
      const intersects = raycaster.intersectObject(session.claude.mesh, true)
      if (intersects.length > 0) {
        state.userChangedCamera = true  // User clicked to select
        state.scene!.focusZone(sessionId)
        focusSession(sessionId)

        // Play focus sound for Claude click
        if (state.soundEnabled) {
          soundManager.play('focus')
        }

        const managed = state.managedSessions.find(s => s.claudeSessionId === sessionId)
        if (managed) {
          selectManagedSession(managed.id)
          state.attentionSystem?.remove(managed.id)
        }
        return
      }
    }

    // Nothing was clicked - check if we hit the world floor or painted hexes
    // If so, show the context menu with create/text tile options
    if (state.scene.worldFloor) {
      // Check both floor and painted hexes (painted hexes block floor raycast)
      const floorIntersects = raycaster.intersectObject(state.scene.worldFloor)
      const paintedHexMeshes = state.scene.getPaintedHexMeshes()
      const paintedIntersects = paintedHexMeshes.length > 0
        ? raycaster.intersectObjects(paintedHexMeshes)
        : []

      // Use whichever hit is closest (painted hex is usually on top of floor)
      const allIntersects = [...floorIntersects, ...paintedIntersects]
        .sort((a, b) => a.distance - b.distance)

      if (allIntersects.length > 0) {
        const point = allIntersects[0].point

        // Get hex position
        const hex = state.scene.hexGrid.cartesianToHex(point.x, point.z)

        // Normal mode: context menu (draw mode returns early above)
        // Spawn visual pulse feedback at click location
        state.scene.spawnClickPulse(point.x, point.z)
        // Play click sound
        soundManager.play('click')

        // Check if there's already a text tile at this position
        const existingTile = state.scene.getTextTileAtHex(hex)

        if (existingTile) {
          // Show edit/delete menu for existing text tile
          contextMenu?.show(
            event.clientX,
            event.clientY,
            [
              { key: 'E', label: `Edit "${existingTile.text}"`, action: 'edit_text_tile' },
              { key: 'D', label: 'Delete label', action: 'delete_text_tile', danger: true },
            ],
            { textTileId: existingTile.id }
          )
        } else {
          // Show create menu for empty space
          contextMenu?.show(
            event.clientX,
            event.clientY,
            [
              { key: 'C', label: 'Create zone', action: 'create' },
              { key: 'T', label: 'Add text label', action: 'create_text_tile' },
            ],
            { worldPosition: { x: point.x, z: point.z }, hexPosition: hex }
          )
        }
      }
    }
  })

  // Right-click handler for zones (delete menu) - desktop only, touch uses long-press
  state.scene.renderer.domElement.addEventListener('contextmenu', (event) => {
    if (!state.scene) return
    event.preventDefault()  // Prevent browser context menu

    raycastFromPointer(event as PointerEvent)
    const sessionId = findClickedZone()

    if (sessionId) {
      // Find the managed session name for display
      const managed = state.managedSessions.find(s => s.claudeSessionId === sessionId)
      const zoneName = managed?.name || sessionId.slice(0, 8)

      // Show context menu with command, info, and delete options
      contextMenu?.show(
        event.clientX,
        event.clientY,
        [
          { key: 'C', label: `Command`, action: 'command' },
          { key: 'I', label: `Info`, action: 'info' },
          { key: 'D', label: `Dismiss "${zoneName}"`, action: 'delete', danger: true },
        ],
        { zoneId: sessionId }
      )
    }
  })
}

/**
 * Update the keybind helper UI based on current camera mode
 */
function updateKeybindHelper(mode: CameraMode): void {
  const helper = document.getElementById('keybind-helper')
  if (!helper) return

  const modeLabel = document.getElementById('camera-mode-label')
  const modeDesc = document.getElementById('camera-mode-desc')

  if (modeLabel && modeDesc) {
    switch (mode) {
      case 'focused':
        modeLabel.textContent = 'Focused'
        modeDesc.textContent = state.focusedSessionId?.slice(0, 8) || 'none'
        break
      case 'overview':
        modeLabel.textContent = 'Overview'
        modeDesc.textContent = 'all sessions'
        break
      case 'follow-active':
        modeLabel.textContent = 'Follow'
        modeDesc.textContent = 'auto-tracking'
        break
    }
  }
}

/**
 * Setup the dev panel for testing animations
 * Toggle with Alt+D
 */
function setupDevPanel(): void {
  const devPanel = document.getElementById('dev-panel')
  const animationsContainer = document.getElementById('dev-animations')
  if (!devPanel || !animationsContainer) return

  // Helper to get target Claude
  const getTargetClaude = (): InstanceType<typeof Claude> | null => {
    if (state.focusedSessionId) {
      const claude = state.sessions.get(state.focusedSessionId)?.claude
      if (claude) return claude
    }
    for (const session of state.sessions.values()) {
      return session.claude
    }
    return null
  }

  // We need to wait for a session to exist to get the behavior names
  const checkForSession = () => {
    let claude: InstanceType<typeof Claude> | null = null
    for (const session of state.sessions.values()) {
      claude = session.claude
      break
    }

    if (!claude) {
      setTimeout(checkForSession, 1000)
      return
    }

    animationsContainer.innerHTML = ''

    // --- Idle Behaviors Section ---
    const idleHeader = document.createElement('div')
    idleHeader.className = 'dev-section-header'
    idleHeader.textContent = 'Idle'
    animationsContainer.appendChild(idleHeader)

    const behaviors = claude.getIdleBehaviorNames()
    for (const name of behaviors) {
      const btn = document.createElement('button')
      btn.className = 'dev-anim-btn'
      btn.textContent = name
      btn.addEventListener('click', () => {
        const target = getTargetClaude()
        if (target) {
          target.playIdleBehavior(name)
          document.querySelectorAll('.dev-anim-btn').forEach(b => b.classList.remove('playing'))
          btn.classList.add('playing')
          setTimeout(() => btn.classList.remove('playing'), 2000)
        }
      })
      animationsContainer.appendChild(btn)
    }

    // --- Working Behaviors Section ---
    const workingHeader = document.createElement('div')
    workingHeader.className = 'dev-section-header'
    workingHeader.textContent = 'Working (by station)'
    animationsContainer.appendChild(workingHeader)

    const stations = claude.getWorkingBehaviorStations()
    for (const station of stations) {
      const btn = document.createElement('button')
      btn.className = 'dev-anim-btn dev-anim-btn-working'
      btn.textContent = station
      btn.addEventListener('click', () => {
        const target = getTargetClaude()
        if (target) {
          target.playWorkingBehavior(station)
          document.querySelectorAll('.dev-anim-btn').forEach(b => b.classList.remove('playing'))
          btn.classList.add('playing')
          // Working behaviors loop, so keep playing indicator longer
          setTimeout(() => btn.classList.remove('playing'), 4000)
        }
      })
      animationsContainer.appendChild(btn)
    }

    // --- Stop Button ---
    const stopBtn = document.createElement('button')
    stopBtn.className = 'dev-anim-btn dev-anim-btn-stop'
    stopBtn.textContent = '⏹ Stop → Idle'
    stopBtn.addEventListener('click', () => {
      const target = getTargetClaude()
      if (target) {
        target.setState('idle')
        document.querySelectorAll('.dev-anim-btn').forEach(b => b.classList.remove('playing'))
      }
    })
    animationsContainer.appendChild(stopBtn)
  }

  checkForSession()
}

// ============================================================================
// Session Management
// ============================================================================

/**
 * Get or create a session for a given sessionId
 * Returns null if the session can't be linked to a managed session
 */
/** Map Claude sessionIds to managed session IDs */
const claudeToManagedLink = new Map<string, string>()

function getOrCreateSession(sessionId: string): SessionState | null {
  let session = state.sessions.get(sessionId)
  if (session) return session

  if (!state.scene) {
    throw new Error('Scene not initialized')
  }

  // Check if this session can be linked to a managed session
  // Only create zones for sessions that are linked or can be linked
  const canLink = canLinkToManagedSession(sessionId)
  if (!canLink) {
    // Unlinked session - don't create a zone for it
    console.log(`Ignoring unlinked session ${sessionId.slice(0, 8)} (no matching managed session)`)
    return null
  }

  // Try to link to a recently-created managed session FIRST
  // (so we can get the hint position from it)
  const linkedManagedSession = tryLinkToManagedSession(sessionId)

  // Look up hint position: first check saved zone position, then pending hints
  let hintPosition: { x: number; z: number } | undefined
  if (linkedManagedSession) {
    // Check for saved zone position from server
    if (linkedManagedSession.zonePosition) {
      // Convert hex coords back to cartesian for hint
      const cartesian = state.scene.hexGrid.axialToCartesian(linkedManagedSession.zonePosition)
      hintPosition = { x: cartesian.x, z: cartesian.z }
      console.log(`Restoring zone position for "${linkedManagedSession.name}" at hex`, linkedManagedSession.zonePosition)
    } else {
      // Fall back to pending hints (from modal click)
      hintPosition = pendingZoneHints.get(linkedManagedSession.name)
      if (hintPosition) {
        pendingZoneHints.delete(linkedManagedSession.name)
      }
    }
  }

  // Create zone in the 3D scene with direction-aware placement
  const zone = state.scene.createZone(sessionId, { hintPosition })

  // Clean up pending zone now that real zone exists
  if (linkedManagedSession) {
    const pendingZoneId = pendingZonesToCleanup.get(linkedManagedSession.name)
    if (pendingZoneId && state.scene) {
      state.scene.removePendingZone(pendingZoneId)
      pendingZonesToCleanup.delete(linkedManagedSession.name)
      // Clear the timeout since zone was created successfully
      const timeoutId = pendingZoneTimeouts.get(pendingZoneId)
      if (timeoutId) {
        clearTimeout(timeoutId)
        pendingZoneTimeouts.delete(pendingZoneId)
      }
    }
  }

  // Play zone creation sound
  if (state.soundEnabled) {
    soundManager.play('zone_create', { zoneId: sessionId })
  }

  if (linkedManagedSession) {
    // Update the zone label with the managed session name and keybind
    const keybindIndex = state.managedSessions.indexOf(linkedManagedSession)
    const keybind = keybindIndex >= 0 ? getSessionKeybind(keybindIndex) : undefined
    state.scene.updateZoneLabel(sessionId, linkedManagedSession.name, keybind)
    console.log(`Linked Claude session ${sessionId.slice(0, 8)} to "${linkedManagedSession.name}"`)

    // Save zone position to server if not already saved
    if (!linkedManagedSession.zonePosition) {
      const hexPos = state.scene.getZoneHexPosition(sessionId)
      if (hexPos) {
        saveZonePosition(linkedManagedSession.id, hexPos)
      }
    }
  }

  // Create Claude with matching color, positioned at zone center
  const claude = new Claude(state.scene, {
    color: zone.color,
    startStation: 'center',
  })

  // Position Claude at the zone's center station
  const centerStation = zone.stations.get('center')
  if (centerStation) {
    claude.mesh.position.copy(centerStation.position)
  }

  // Create subagent manager
  const subagents = new SubagentManager(state.scene)

  session = {
    claude,
    subagents,
    zone,
    color: zone.color,
    stats: {
      toolsUsed: 0,
      filesTouched: new Set(),
      activeSubagents: 0,
    },
  }

  state.sessions.set(sessionId, session)
  console.log(`Created session ${sessionId.slice(0, 8)} (color: #${zone.color.toString(16)}, position: ${zone.position.x}, ${zone.position.z})`)

  // Focus on first session
  if (state.sessions.size === 1) {
    focusSession(sessionId)
  }

  updateSessionList()
  return session
}

/**
 * Check if a Claude session can be linked to a managed session
 * Returns true if already linked or if there's a recently-created unlinked managed session
 */
function canLinkToManagedSession(claudeSessionId: string): boolean {
  // Already linked?
  if (claudeToManagedLink.has(claudeSessionId)) {
    return true
  }

  // Is this session already known to a managed session?
  for (const managed of state.managedSessions) {
    if (managed.claudeSessionId === claudeSessionId) {
      return true
    }
  }

  // Is there a recently-created unlinked managed session we can link to?
  const now = Date.now()
  const LINK_WINDOW_MS = 30_000 // 30 seconds
  for (const managed of state.managedSessions) {
    if (!managed.claudeSessionId) {
      const age = now - managed.createdAt
      if (age < LINK_WINDOW_MS) {
        return true
      }
    }
  }

  return false
}

/**
 * Try to link a Claude session to a managed session
 * Uses timing: looks for unlinked managed sessions created in the last 30 seconds
 */
function tryLinkToManagedSession(claudeSessionId: string): ManagedSession | null {
  const now = Date.now()
  const LINK_WINDOW_MS = 30_000 // 30 seconds

  // Check if already linked
  if (claudeToManagedLink.has(claudeSessionId)) {
    const managedId = claudeToManagedLink.get(claudeSessionId)!
    return state.managedSessions.find(s => s.id === managedId) || null
  }

  // Find unlinked managed sessions created recently
  for (const managed of state.managedSessions) {
    // Skip if already linked
    if (managed.claudeSessionId) continue

    // Check if created recently
    const age = now - managed.createdAt
    if (age < LINK_WINDOW_MS) {
      // Link them!
      claudeToManagedLink.set(claudeSessionId, managed.id)
      managed.claudeSessionId = claudeSessionId

      // Notify server about the link
      linkSessionOnServer(managed.id, claudeSessionId)

      return managed
    }
  }

  return null
}

/**
 * Notify server about session linking
 */
async function linkSessionOnServer(managedId: string, claudeSessionId: string): Promise<void> {
  await sessionAPI.linkSession(managedId, claudeSessionId)
}

/**
 * Sync zone labels with managed session names
 * Uses explicit links first, then falls back to index matching
 */
function syncZoneLabels(): void {
  if (!state.scene) return

  const zones = Array.from(state.scene.zones.entries())
  const managedSessions = state.managedSessions

  // First pass: update zones that have explicit claudeSessionId links
  for (let i = 0; i < managedSessions.length; i++) {
    const managed = managedSessions[i]
    if (managed.claudeSessionId) {
      const keybind = getSessionKeybind(i)
      state.scene.updateZoneLabel(managed.claudeSessionId, managed.name, keybind)
    }
  }

  // Second pass: for unlinked zones, try to match by index
  // Get zones that aren't linked to any managed session
  const linkedClaudeIds = new Set(
    managedSessions.filter(m => m.claudeSessionId).map(m => m.claudeSessionId)
  )
  const unlinkedZones = zones.filter(([id]) => !linkedClaudeIds.has(id))

  // Get managed sessions that don't have a claudeSessionId link
  const unlinkedManaged = managedSessions.filter(m => !m.claudeSessionId)

  // Match by index (first unlinked zone → first unlinked managed, etc.)
  for (let i = 0; i < Math.min(unlinkedZones.length, unlinkedManaged.length); i++) {
    const [zoneId] = unlinkedZones[i]
    const managed = unlinkedManaged[i]

    // Update the zone label with keybind
    const managedIndex = managedSessions.indexOf(managed)
    const keybind = managedIndex >= 0 ? getSessionKeybind(managedIndex) : undefined
    state.scene.updateZoneLabel(zoneId, managed.name, keybind)

    // Also create the link for future use
    claudeToManagedLink.set(zoneId, managed.id)
    managed.claudeSessionId = zoneId

    // Notify server about the link
    linkSessionOnServer(managed.id, zoneId)

    console.log(`Auto-linked zone ${zoneId.slice(0, 8)} to managed session "${managed.name}"`)
  }
}

/**
 * Focus camera and UI on a specific session
 */
function focusSession(sessionId: string): void {
  const session = state.sessions.get(sessionId)
  if (!session || !state.scene) return

  state.focusedSessionId = sessionId
  state.scene.focusZone(sessionId)

  // Play focus sound
  if (state.soundEnabled) {
    soundManager.play('focus')
  }

  // Play a random idle animation when zone becomes active (if Claude is idle)
  if (session.claude.state === 'idle' && 'playRandomIdleBehavior' in session.claude) {
    (session.claude as { playRandomIdleBehavior: () => void }).playRandomIdleBehavior()
  }

  // Update HUD
  const sessionEl = document.getElementById('session-id')
  if (sessionEl) {
    const shortId = sessionId.slice(0, 8)
    sessionEl.textContent = shortId
    sessionEl.title = `Session: ${sessionId}`
    sessionEl.style.color = `#${session.color.toString(16).padStart(6, '0')}`
  }

  // Update prompt target indicator
  updatePromptTarget(sessionId, session.color)

  updateStats()
}

/**
 * Update the prompt target indicator to show which session will receive prompts
 */
function updatePromptTarget(sessionId: string, color: number): void {
  const targetEl = document.getElementById('prompt-target')
  if (!targetEl) return

  // Look up managed session to get name and index
  const managed = state.managedSessions.find(s => s.claudeSessionId === sessionId)
  const colorHex = `#${color.toString(16).padStart(6, '0')}`

  if (managed) {
    const index = state.managedSessions.indexOf(managed) + 1
    targetEl.innerHTML = `
      <span class="target-badge" style="background: ${colorHex}">${index}</span>
      <span class="target-name" style="color: ${colorHex}" data-tmux="${escapeHtml(managed.tmuxSession)}" data-session-id="${escapeHtml(managed.id)}">${escapeHtml(managed.name)}</span>
      <button class="target-terminal-btn" title="Open in iTerm2">⌨️</button>
    `
    targetEl.title = `Click name to copy tmux session: ${managed.tmuxSession}`

    // Add click handler to copy tmux session name
    const nameEl = targetEl.querySelector('.target-name') as HTMLElement
    if (nameEl) {
      nameEl.style.cursor = 'pointer'
      nameEl.onclick = async (e) => {
        e.stopPropagation()
        const tmuxName = nameEl.dataset.tmux
        if (!tmuxName) return

        try {
          await navigator.clipboard.writeText(tmuxName)
          // Show brief feedback
          const originalText = nameEl.textContent
          nameEl.textContent = 'Copied!'
          setTimeout(() => {
            nameEl.textContent = originalText
          }, 1500)
        } catch (err) {
          console.error('Failed to copy tmux session:', err)
        }
      }
    }

    // Add click handler for terminal button
    const terminalBtn = targetEl.querySelector('.target-terminal-btn') as HTMLButtonElement
    if (terminalBtn) {
      terminalBtn.onclick = async (e) => {
        e.stopPropagation()
        const sessionId = nameEl?.dataset.sessionId
        if (!sessionId) return

        terminalBtn.textContent = '...'
        const result = await sessionAPI.openTerminal(sessionId)
        if (result.ok) {
          terminalBtn.textContent = '✓'
          setTimeout(() => {
            terminalBtn.textContent = '⌨️'
          }, 1500)
        } else {
          terminalBtn.textContent = '✗'
          console.error('Failed to open terminal:', result.error)
          setTimeout(() => {
            terminalBtn.textContent = '⌨️'
          }, 2000)
        }
      }
    }
  } else {
    targetEl.innerHTML = `
      <span class="target-dot" style="background: ${colorHex}"></span>
      <span>→ ${sessionId.slice(0, 8)}</span>
    `
    targetEl.title = `Prompts will be sent to session ${sessionId}`
  }
}

/**
 * Update session list in UI (for multi-session)
 */
function updateSessionList(): void {
  // Could add a session picker dropdown here later
  const count = state.sessions.size
  const sessionEl = document.getElementById('session-id')
  if (sessionEl && count > 1) {
    sessionEl.title += ` (${count} sessions)`
  }
}

// ============================================================================
// UI Updates
// ============================================================================

function updateStatus(connected: boolean, text?: string) {
  const dot = document.getElementById('status-dot')
  const textEl = document.getElementById('status-text')

  if (dot) {
    // Add 'working' class when actively working, 'connected' when idle, nothing when disconnected
    if (connected && text === 'Working') {
      dot.className = 'working'
    } else if (connected) {
      dot.className = 'connected'
    } else {
      dot.className = ''
    }
  }

  if (textEl) {
    // Only show text when disconnected or connecting
    if (!connected || text === 'Connecting...') {
      textEl.textContent = ` · ${text || 'Disconnected'}`
    } else {
      textEl.textContent = ''
    }
  }
}

function updateActivity(activity: string) {
  const el = document.getElementById('current-activity')
  if (el) {
    el.textContent = activity
  }
}

function updateAttentionBadge() {
  const badge = document.getElementById('attention-badge')
  if (!badge || !state.scene) return

  const needsAttention = state.scene.getZonesNeedingAttention()
  const count = needsAttention.length

  if (count > 0) {
    badge.textContent = String(count)
    badge.classList.remove('hidden')
  } else {
    badge.classList.add('hidden')
  }
}

function updateStats() {
  const toolsEl = document.getElementById('stat-tools')
  const filesEl = document.getElementById('stat-files')
  const subagentsEl = document.getElementById('stat-subagents')

  // Aggregate stats from all sessions
  let totalTools = 0
  let totalSubagents = 0
  const allFiles = new Set<string>()

  for (const session of state.sessions.values()) {
    totalTools += session.stats.toolsUsed
    totalSubagents += session.stats.activeSubagents
    for (const file of session.stats.filesTouched) {
      allFiles.add(file)
    }
  }

  if (toolsEl) {
    toolsEl.textContent = totalTools.toString()
  }

  if (filesEl) {
    filesEl.textContent = allFiles.size.toString()
  }

  if (subagentsEl) {
    subagentsEl.textContent = totalSubagents.toString()
  }
}

// ============================================================================
// Event Handling
// ============================================================================

function handleEvent(event: ClaudeEvent) {
  // Get or create session for this event
  // Returns null if the session isn't linked to a managed session
  const session = getOrCreateSession(event.sessionId)

  state.eventHistory.push(event)

  // Dispatch to EventBus (new decoupled handlers)
  // This runs in parallel with the old switch statement during migration
  const eventContext: EventContext = {
    scene: state.scene,
    timelineManager: state.timelineManager,
    soundEnabled: state.soundEnabled,
    session: session ? {
      id: event.sessionId,
      color: session.color,
      claude: session.claude,
      subagents: session.subagents,
      zone: session.zone,
      stats: session.stats,
    } : null,
  }
  eventBus.emit(event.type as EventType, event as any, eventContext)

  // If no session (unlinked), still add to timeline with default color but skip 3D updates
  const eventColor = session?.color ?? 0x888888
  state.timelineManager?.add(event, eventColor)

  // Skip 3D scene updates for unlinked sessions
  if (!session) {
    return
  }

  // Pulse the zone to indicate activity
  if (state.scene && (event.type === 'pre_tool_use' || event.type === 'user_prompt_submit')) {
    state.scene.pulseZone(event.sessionId)
    // Set working status when tools start (except for AskUserQuestion which sets attention)
    if (event.type === 'pre_tool_use') {
      const toolEvent = event as PreToolUseEvent
      if (toolEvent.tool !== 'AskUserQuestion') {
        state.scene.setZoneStatus(event.sessionId, 'working')
      }
    }
  }

  switch (event.type) {
    case 'pre_tool_use': {
      const e = event as PreToolUseEvent

      // [Sound, character movement, context text handled by EventBus]
      // [Thinking indicator handled by EventBus: feedHandlers.ts]

      // Update stats after subagent spawn (EventBus handles spawn itself)
      if (e.tool === 'Task') {
        updateStats()
      }

      // AskUserQuestion needs attention and shows modal
      // (zone attention and AttentionSystem queue are handled by showQuestionModal)
      if (e.tool === 'AskUserQuestion') {
        const toolInput = e.toolInput as { questions?: QuestionData['questions'] }
        if (toolInput.questions && toolInput.questions.length > 0) {
          // Find the managed session for this Claude session
          const managedSession = state.managedSessions.find(
            s => s.claudeSessionId === event.sessionId
          )
          showQuestionModal({
            sessionId: event.sessionId,
            managedSessionId: managedSession?.id || null,
            questions: toolInput.questions,
          })
          updateAttentionBadge()
        }
      }

      updateActivity(`Using ${e.tool}...`)
      updateStatus(true, 'Working')

      // Track file access
      const filePath = (e.toolInput as { file_path?: string }).file_path
      if (filePath) {
        session.stats.filesTouched.add(filePath)
      }
      break
    }

    case 'post_tool_use': {
      const e = event as PostToolUseEvent
      session.stats.toolsUsed++

      // [Sound, notifications, character state handled by EventBus]
      // [Subagent removal handled by EventBus: subagentHandlers.ts]

      // Hide question modal when AskUserQuestion completes
      if (e.tool === 'AskUserQuestion') {
        hideQuestionModal()
      }

      updateStats()
      updateActivity(e.success ? `${e.tool} complete` : `${e.tool} failed`)
      break
    }

    case 'stop': {
      // [Sound, character, context, zone status handled by EventBus]
      // [Thinking indicator handled by EventBus: feedHandlers.ts]

      // Update UI badge (zone attention set by zoneHandlers)
      updateAttentionBadge()
      updateActivity('Idle')
      updateStatus(true, 'Ready')
      break
    }

    case 'user_prompt_submit': {
      const e = event as import('../shared/types').UserPromptSubmitEvent
      // Store last prompt for this session
      state.lastPrompts.set(event.sessionId, e.prompt)
      renderManagedSessions()

      // [Sound, zone status, character state handled by EventBus]

      // Update UI badge (zone attention cleared by zoneHandlers)
      updateAttentionBadge()
      updateActivity('Processing prompt...')
      updateStatus(true, 'Thinking')
      break
    }

    case 'session_start':
      // Reset stats for this session
      session.stats.toolsUsed = 0
      session.stats.filesTouched.clear()
      updateStats()
      updateActivity('Session started')
      break

    case 'notification':
      // [Sound handled by EventBus: soundHandlers.ts]
      // Could trigger visual notification in 3D scene
      break
  }
}

// ============================================================================
// Prompt Submission
// ============================================================================

const PROMPT_URL = `${API_URL}/prompt`
const CANCEL_URL = `${API_URL}/cancel`
const CONFIG_URL = `${API_URL}/config`

async function fetchConfig() {
  try {
    const response = await fetch(CONFIG_URL)
    const data = await response.json()
    const usernameEl = document.getElementById('username')
    if (usernameEl && data.username) {
      usernameEl.textContent = data.username
    }
  } catch (e) {
    console.log('Could not fetch config:', e)
  }
}

/**
 * Interrupt (Ctrl+C) the currently selected session
 * Called from keyboard shortcut handler
 */
async function interruptSession(sessionName: string): Promise<void> {
  // Show toast immediately
  toast.info(`Interrupt sent to ${sessionName}`, {
    icon: '⛔',
    duration: 2500,
    html: true,
  })

  try {
    const response = await fetch(CANCEL_URL, { method: 'POST' })
    const data = await response.json()

    if (!data.ok) {
      toast.error(data.error || 'Interrupt failed', {
        icon: '❌',
        duration: 3000,
      })
    }
  } catch (error) {
    toast.error('Connection error', {
      icon: '❌',
      duration: 3000,
    })
  }
}

// Removed: setupPromptForm - Terminal is now the primary interface for input
// Prompts are sent directly through the PTY terminal

function _unusedPromptFormPlaceholder() {
  // This function is intentionally empty - the prompt form has been removed
  // in favor of terminal-first UI. All input goes through the PTY terminal.
}

// ============================================================================
// Terminal Output Panel (PTY via xterm.js)
// ============================================================================

function setupTerminalPanel() {
  const panel = document.getElementById('terminal-panel')
  const output = document.getElementById('terminal-output')
  const expandBtn = document.getElementById('terminal-expand')
  const sessionName = document.getElementById('terminal-session-name')

  if (!panel || !output) return

  // Initialize terminal manager
  state.terminalManager = new TerminalManager(output)

  // Connect terminal manager to EventClient
  if (state.client) {
    state.terminalManager.setSendFunction((msg) => state.client?.sendRaw(msg))
  }

  // Expand/collapse button
  expandBtn?.addEventListener('click', () => {
    panel.classList.toggle('expanded')
    state.terminalManager?.getActiveSessionId() &&
      state.terminalManager.getOrCreate(state.terminalManager.getActiveSessionId()!).fit()
  })
}

/**
 * Show terminal for a session (PTY is now the only mode)
 */
function showTerminalForSession(sessionId: string) {
  const panel = document.getElementById('terminal-panel')
  const sessionName = document.getElementById('terminal-session-name')
  const indicator = panel?.querySelector('.terminal-indicator')

  const session = state.managedSessions.find(s => s.id === sessionId)
  if (!session || !state.terminalManager) return

  // Create/get terminal and show it
  const terminal = state.terminalManager.getOrCreate(sessionId)
  state.terminalManager.show(sessionId)

  // Update header
  if (sessionName) sessionName.textContent = session.name
  if (indicator) {
    indicator.classList.toggle('offline', session.status === 'offline')
  }

  // Show panel
  panel?.classList.remove('hidden')

  // Fit after a short delay to ensure container is visible
  requestAnimationFrame(() => terminal.fit())
}

/**
 * Hide terminal panel (when no session selected)
 */
function hideTerminal() {
  const panel = document.getElementById('terminal-panel')
  panel?.classList.add('hidden')
  state.terminalManager?.hideAll()
}

// ============================================================================
// Standalone Shell Terminal (Multi-shell support)
// ============================================================================

/**
 * Generate a unique shell ID
 */
function generateShellId(): string {
  state.shellCounter++
  return `shell-${state.shellCounter}`
}

/**
 * Create a new shell terminal
 */
function createShell(shellId?: string): string {
  const id = shellId || generateShellId()
  const container = document.getElementById('shell-terminals')
  if (!container) return id

  // Create shell container
  const shellDiv = document.createElement('div')
  shellDiv.className = 'shell-terminal'
  shellDiv.dataset.shellId = id

  // Create terminal wrapper
  const wrapper = document.createElement('div')
  wrapper.className = 'terminal-wrapper'
  shellDiv.appendChild(wrapper)

  // Add loading overlay
  const loading = document.createElement('div')
  loading.className = 'terminal-loading'
  loading.innerHTML = `
    <div class="terminal-loading-spinner"></div>
    <div class="terminal-loading-text">Starting shell...</div>
  `
  wrapper.appendChild(loading)

  container.appendChild(shellDiv)

  // Create terminal UI
  const terminal = new TerminalUI({
    container: wrapper,
    onData: (data) => {
      if (state.client) {
        state.client.sendRaw({
          type: 'pty:input',
          sessionId: id,
          data,
        })
      }
    },
    onResize: (cols, rows) => {
      if (state.client) {
        state.client.sendRaw({
          type: 'pty:resize',
          sessionId: id,
          cols,
          rows,
        })
      }
    },
  })

  state.shells.set(id, terminal)

  // Create tab
  addShellTab(id)

  // Subscribe to server
  if (state.client) {
    state.client.sendRaw({
      type: 'shell:subscribe',
      sessionId: id,
      cwd: state.serverCwd !== '~' ? state.serverCwd : undefined,
    })
  }

  // Switch to the new shell
  switchToShell(id)

  return id
}

/**
 * Add a tab for a shell
 */
function addShellTab(shellId: string) {
  const tabsContainer = document.getElementById('shell-tabs')
  if (!tabsContainer) return

  // Check if tab already exists
  if (tabsContainer.querySelector(`[data-shell-id="${shellId}"]`)) return

  const tab = document.createElement('div')
  tab.className = 'shell-tab'
  tab.dataset.shellId = shellId

  const num = shellId.replace('shell-', '')
  tab.innerHTML = `
    <span class="shell-name">Shell ${num}</span>
    <button class="close-btn" title="Close shell">×</button>
  `

  // Click to switch
  tab.addEventListener('click', (e) => {
    if ((e.target as HTMLElement).classList.contains('close-btn')) return
    switchToShell(shellId)
  })

  // Close button
  const closeBtn = tab.querySelector('.close-btn')
  closeBtn?.addEventListener('click', (e) => {
    e.stopPropagation()
    closeShell(shellId)
  })

  tabsContainer.appendChild(tab)
}

/**
 * Switch to a specific shell
 */
function switchToShell(shellId: string) {
  state.activeShellId = shellId

  // Update tab states
  const tabs = document.querySelectorAll('.shell-tab')
  tabs.forEach(tab => {
    tab.classList.toggle('active', (tab as HTMLElement).dataset.shellId === shellId)
  })

  // Update terminal visibility
  const terminals = document.querySelectorAll('.shell-terminal')
  terminals.forEach(term => {
    term.classList.toggle('active', (term as HTMLElement).dataset.shellId === shellId)
  })

  // Fit and focus
  const terminal = state.shells.get(shellId)
  setTimeout(() => {
    terminal?.fit()
    terminal?.focus()
  }, 50)
}

/**
 * Close a shell
 */
function closeShell(shellId: string) {
  // Send close to server
  if (state.client) {
    state.client.sendRaw({
      type: 'shell:close',
      sessionId: shellId,
    })
  }

  // Remove terminal
  const terminal = state.shells.get(shellId)
  terminal?.dispose()
  state.shells.delete(shellId)

  // Remove UI elements
  const tab = document.querySelector(`.shell-tab[data-shell-id="${shellId}"]`)
  tab?.remove()

  const terminalDiv = document.querySelector(`.shell-terminal[data-shell-id="${shellId}"]`)
  terminalDiv?.remove()

  // Switch to another shell if this was active
  if (state.activeShellId === shellId) {
    state.activeShellId = null
    // Switch to first available shell, or create new one
    const firstShell = state.shells.keys().next().value
    if (firstShell) {
      switchToShell(firstShell)
    }
  }
}

/**
 * Setup standalone shell terminal panel
 */
function setupShellPanel() {
  // Setup new shell buttons (there may be multiple - one in feed panel, one in mobile shell panel)
  const newShellBtns = document.querySelectorAll('#new-shell-btn')
  newShellBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      createShell()
    })
  })

  // Setup desktop tab switching
  setupSessionsTabs()
}

/**
 * Setup sessions panel tab switching (Sessions / Shell / Todos)
 */
function setupSessionsTabs() {
  const tabs = document.querySelectorAll('.sessions-tab')
  const sessionsList = document.getElementById('sessions-list')
  const shellContent = document.getElementById('shell-tab-content')
  const todosContent = document.getElementById('todos-tab-content')

  // Initialize todos manager
  const todosManager = initTodosManager()
  if (todosContent) {
    todosManager.init(todosContent)
  }

  // Update todos badge
  todosManager.setOnUpdate(() => {
    updateTodosBadge()
  })
  updateTodosBadge()

  // Expose function for TodosManager to get sessions
  ;(window as any).vibecraftGetSessions = () => {
    return Array.from(state.managedSessions.values()).map(s => ({
      id: s.id,
      name: s.name,
    }))
  }

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = (tab as HTMLElement).dataset.tab

      // Update active tab
      tabs.forEach(t => t.classList.remove('active'))
      tab.classList.add('active')

      // Show/hide content
      sessionsList?.classList.remove('active')
      shellContent?.classList.remove('active')
      todosContent?.classList.remove('active')

      if (targetTab === 'sessions') {
        sessionsList?.classList.add('active')
      } else if (targetTab === 'shell') {
        shellContent?.classList.add('active')

        // Create first shell if none exist
        if (state.shells.size === 0) {
          createShell()
        } else if (state.activeShellId) {
          // Fit active terminal
          setTimeout(() => {
            const terminal = state.shells.get(state.activeShellId!)
            terminal?.fit()
            terminal?.focus()
          }, 50)
        }
      } else if (targetTab === 'todos') {
        todosContent?.classList.add('active')
        // Re-render in case sessions changed
        todosManager.render()
      }
    })
  })
}

/**
 * Update the todos badge with incomplete count
 */
function updateTodosBadge() {
  const todosManager = getTodosManager()
  if (!todosManager) return

  const count = todosManager.getTotalIncompleteCount()
  const badge = document.getElementById('todos-badge')
  if (badge) {
    badge.textContent = count.toString()
    badge.classList.toggle('hidden', count === 0)
  }
}

/**
 * Show shell panel (mobile)
 */
function showShellPanel() {
  const panel = document.getElementById('shell-panel')
  panel?.classList.remove('hidden')

  // Create first shell if none exist
  if (state.shells.size === 0) {
    createShell()
  } else if (state.activeShellId) {
    const terminal = state.shells.get(state.activeShellId)
    setTimeout(() => {
      terminal?.fit()
      terminal?.focus()
    }, 50)
  }
}

/**
 * Hide shell panel
 */
function hideShellPanel() {
  const panel = document.getElementById('shell-panel')
  panel?.classList.add('hidden')
}

// ============================================================================
// Audio Initialization
// ============================================================================

let audioInitialized = false

/**
 * Initialize audio on first user interaction (required by Web Audio API)
 */
async function initAudioOnInteraction(): Promise<void> {
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

/**
 * Setup settings modal
 */
function setupSettingsModal(): void {
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
    if (portInput) portInput.value = String(AGENT_PORT)
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
    if (newPort && newPort > 0 && newPort <= 65535 && newPort !== AGENT_PORT) {
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

// Question Modal and Permission Modal moved to src/ui/QuestionModal.ts and src/ui/PermissionModal.ts

// ============================================================================
// About Modal
// ============================================================================

function setupAboutModal(): void {
  const aboutBtn = document.getElementById('about-btn')
  const modal = document.getElementById('about-modal')
  const closeBtn = document.getElementById('about-close')

  if (!modal) return

  // Open modal
  aboutBtn?.addEventListener('click', () => {
    // Fetch and display version
    const versionEl = document.getElementById('about-version')
    if (versionEl) {
      fetch('/health')
        .then(res => res.json())
        .then(health => {
          versionEl.textContent = `v${health.version || 'unknown'}`
        })
        .catch(() => {
          versionEl.textContent = 'v?'
        })
    }
    modal.classList.add('visible')
  })

  // Close modal
  const closeModal = () => modal.classList.remove('visible')
  closeBtn?.addEventListener('click', closeModal)
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal()
  })
}

// ============================================================================
// Connection Overlay
// ============================================================================

function setupNotConnectedOverlay(): void {
  const overlay = document.getElementById('not-connected-overlay')
  const retryBtn = document.getElementById('retry-connection')
  const exploreBtn = document.getElementById('explore-offline')
  const offlineBanner = document.getElementById('offline-banner')
  const bannerDismiss = document.getElementById('offline-banner-dismiss')

  if (!overlay) return

  retryBtn?.addEventListener('click', () => {
    window.location.reload()
  })

  // Explore button: dismiss overlay, show offline banner
  exploreBtn?.addEventListener('click', () => {
    overlay.classList.remove('visible')
    offlineBanner?.classList.remove('hidden')
  })

  // Dismiss offline banner
  bannerDismiss?.addEventListener('click', () => {
    offlineBanner?.classList.add('hidden')
  })
}

function showOfflineBanner(): void {
  const banner = document.getElementById('offline-banner')
  banner?.classList.remove('hidden')
}

function setupZoneTimeoutModal(): void {
  const modal = document.getElementById('zone-timeout-modal')
  const closeBtn = document.getElementById('zone-timeout-close')

  if (!modal) return

  closeBtn?.addEventListener('click', () => {
    modal.classList.remove('visible')
  })

  // Close on clicking backdrop
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.classList.remove('visible')
    }
  })

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('visible')) {
      modal.classList.remove('visible')
    }
  })
}

function showZoneTimeoutModal(): void {
  const modal = document.getElementById('zone-timeout-modal')
  modal?.classList.add('visible')
}

function showNotConnectedOverlay(): void {
  const overlay = document.getElementById('not-connected-overlay')
  overlay?.classList.add('visible')
}

function hideNotConnectedOverlay(): void {
  const overlay = document.getElementById('not-connected-overlay')
  overlay?.classList.remove('visible')
}

// ============================================================================
// Initialization
// ============================================================================

function init() {
  // Initialize layout manager FIRST - this renders the HTML template
  // Must happen before any DOM queries for elements inside the layout
  const layoutManager = initLayoutManager({
    onViewChange: (view) => {
      console.log('Mobile view changed to:', view)
      // Trigger resize when switching to scene view to ensure canvas is sized correctly
      if (view === 'scene' && state.scene) {
        window.dispatchEvent(new Event('resize'))
      }
      // Handle shell view - create shell if needed, fit terminal
      if (view === 'shell') {
        if (state.shells.size === 0) {
          createShell()
        } else if (state.activeShellId) {
          requestAnimationFrame(() => {
            const terminal = state.shells.get(state.activeShellId!)
            terminal?.fit()
            terminal?.focus()
          })
        }
      }
    },
    onLayoutChange: (layout, previousLayout) => {
      console.log('Layout changed:', previousLayout, '->', layout)
      // Re-initialize components that depend on DOM structure after layout swap
      if (state.scene) {
        window.dispatchEvent(new Event('resize'))
      }
    },
  })

  // Initialize the layout (renders the appropriate template into the DOM)
  layoutManager.init()

  const container = document.getElementById('canvas-container')
  if (!container) {
    console.error('Canvas container not found')
    return
  }

  // Create scene (zones and Claudes created dynamically per session)
  state.scene = new WorkshopScene(container)

  // Set up spatial audio resolvers
  soundManager.setZonePositionResolver((zoneId: string) => {
    return state.scene?.getZoneWorldPosition(zoneId) ?? null
  })
  soundManager.setFocusedZoneResolver(() => {
    return state.scene?.focusedZoneId ?? null
  })

  // Update spatial audio listener position periodically (every 100ms)
  setInterval(() => {
    if (state.scene) {
      const camera = state.scene.camera
      soundManager.updateListener(camera.position.x, camera.position.z, camera.rotation.y)
    }
  }, 100)

  // Load saved hex art from localStorage
  const savedHexArt = localStorage.getItem('vibecraft-hexart')
  if (savedHexArt) {
    try {
      const hexes = JSON.parse(savedHexArt)
      state.scene.loadPaintedHexes(hexes)
      console.log(`Loaded ${hexes.length} painted hexes from localStorage`)
    } catch (e) {
      console.warn('Failed to load hex art from localStorage:', e)
    }
  }

  // Load saved zone elevations from localStorage
  const savedZoneElevations = localStorage.getItem('vibecraft-zone-elevations')
  if (savedZoneElevations) {
    try {
      const elevations = JSON.parse(savedZoneElevations)
      state.scene.loadZoneElevations(elevations)
      console.log(`Loaded ${Object.keys(elevations).length} zone elevations from localStorage`)
    } catch (e) {
      console.warn('Failed to load zone elevations from localStorage:', e)
    }
  }

  // Make canvas focusable for Tab switching
  state.scene.renderer.domElement.tabIndex = 0
  state.scene.renderer.domElement.style.outline = 'none'

  // Start rendering
  state.scene.start()

  // Initialize attention system
  state.attentionSystem = new AttentionSystem({
    onQueueChange: () => renderManagedSessions(),
  })

  // Initialize timeline manager
  state.timelineManager = new TimelineManager()

  // Register EventBus handlers (decoupled event handling)
  registerAllHandlers()

  // Connect to event server
  state.client = new EventClient({
    url: WS_URL,
    debug: true,
  })

  // Track if we've ever connected
  let hasConnected = false

  state.client.onConnection((connected) => {
    updateStatus(connected, connected ? 'Connected' : 'Disconnected')
    console.log('Connection status:', connected)

    if (connected) {
      hasConnected = true
      hideNotConnectedOverlay()

      // Update terminal manager's send function and resubscribe to PTY sessions
      if (state.terminalManager) {
        state.terminalManager.setSendFunction((msg) => state.client?.sendRaw(msg))
        // Resubscribe all terminals after reconnection
        state.terminalManager.resubscribeAll()
      }
    }
  })

  // Click on status dot to force reconnect
  const statusDot = document.getElementById('status-dot')
  if (statusDot) {
    statusDot.style.cursor = 'pointer'
    statusDot.title = 'Click to reconnect'
    statusDot.addEventListener('click', () => {
      console.log('Manual reconnect triggered')
      updateStatus(false, 'Reconnecting...')
      state.client?.forceReconnect()
    })
  }

  // Show not-connected overlay after timeout if never connected (production only)
  if (!import.meta.env.DEV) {
    setTimeout(() => {
      if (!hasConnected) {
        console.log('Connection timeout - showing overlay')
        showNotConnectedOverlay()
      }
    }, 3000)  // 3 seconds to connect before showing overlay
  }

  state.client.onEvent(handleEvent)

  // Handle history batch - pre-scan for completions before rendering
  state.client.onHistory((events) => {
    // First pass: collect all completed tool use IDs (across all sessions)
    for (const event of events) {
      if (event.type === 'post_tool_use') {
        const e = event as PostToolUseEvent
        state.timelineManager?.markCompleted(e.toolUseId)
      }
    }
    // Second pass: process all events (sessions created dynamically)
    for (const event of events) {
      handleEvent(event)
    }
  })

  // Handle token updates
  state.client.onTokens((data) => {
    // Update feed panel stat
    const tokensEl = document.getElementById('stat-tokens')
    if (tokensEl) {
      tokensEl.textContent = data.cumulative.toLocaleString()
    }
    // Update top-left HUD with formatted display
    const tokenCounter = document.getElementById('token-counter')
    if (tokenCounter) {
      tokenCounter.textContent = `⚡ ${formatTokens(data.cumulative)}`
      tokenCounter.title = `${data.cumulative.toLocaleString()} tokens used`
    }
  })

  // Handle managed sessions updates
  state.client.onSessions((sessions) => {
    // Reconcile local link map with server's authoritative data
    // Server is the source of truth for session linking
    claudeToManagedLink.clear()
    for (const session of sessions) {
      if (session.claudeSessionId) {
        claudeToManagedLink.set(session.claudeSessionId, session.id)

        // Proactively create zone if it doesn't exist yet
        // This handles sessions that have no recent events in history
        if (state.scene && !state.scene.zones.has(session.claudeSessionId)) {
          // Use saved position if available
          let hintPosition: { x: number; z: number } | undefined
          if (session.zonePosition) {
            const cartesian = state.scene.hexGrid.axialToCartesian(session.zonePosition)
            hintPosition = { x: cartesian.x, z: cartesian.z }
            console.log(`Restoring zone for "${session.name}" at saved position`, session.zonePosition)
          } else {
            console.log(`Creating zone for session "${session.name}" (no recent events in history)`)
          }
          const zone = state.scene.createZone(session.claudeSessionId, { hintPosition })

          // Play zone creation sound
          if (state.soundEnabled) {
            soundManager.play('zone_create', { zoneId: session.claudeSessionId })
          }

          // Create Claude entity for this zone
          const claude = new Claude(state.scene, {
            color: zone.color,
            startStation: 'center',
          })
          const centerStation = zone.stations.get('center')
          if (centerStation) {
            claude.mesh.position.copy(centerStation.position)
          }

          const subagents = new SubagentManager(state.scene)

          const sessionState: SessionState = {
            claude,
            subagents,
            zone,
            color: zone.color,
            stats: {
              toolsUsed: 0,
              filesTouched: new Set(),
              activeSubagents: 0,
            },
          }
          state.sessions.set(session.claudeSessionId, sessionState)

          // Update zone label with session name
          const keybindIndex = sessions.indexOf(session)
          const keybind = keybindIndex >= 0 ? getSessionKeybind(keybindIndex) : undefined
          state.scene.updateZoneLabel(session.claudeSessionId, session.name, keybind)
        }

        // Update zone floor status based on session status
        if (state.scene) {
          // Map managed session status to zone status
          const zoneStatus = session.status === 'working' ? 'working'
            : session.status === 'waiting' ? 'waiting'
            : session.status === 'offline' ? 'offline'
            : session.status === 'dismissed' ? 'dismissed'
            : 'idle'
          state.scene.setZoneStatus(session.claudeSessionId, zoneStatus)
        }
      }
    }

    // Clean up orphaned zones (zones not linked to any managed session)
    if (state.scene) {
      const activeClaudeIds = new Set(
        sessions.map(s => s.claudeSessionId).filter(Boolean)
      )
      const zonesToDelete: string[] = []
      for (const [zoneId] of state.scene.zones) {
        if (!activeClaudeIds.has(zoneId)) {
          zonesToDelete.push(zoneId)
        }
      }
      for (const zoneId of zonesToDelete) {
        // Clean up session state (Claude entity, subagents)
        const sessionState = state.sessions.get(zoneId)
        if (sessionState) {
          sessionState.claude.dispose()
          state.sessions.delete(zoneId)
        }
        // Play zone deletion sound BEFORE deleting (so position is still available)
        if (state.soundEnabled) {
          soundManager.play('zone_delete', { zoneId })
        }

        // Delete the 3D zone
        state.scene.deleteZone(zoneId)

        console.log(`Cleaned up orphaned zone: ${zoneId.slice(0, 8)}`)
      }
    }

    // Detect status changes (working → idle) and notify
    if (state.attentionSystem) {
      const newlyIdle = state.attentionSystem.processStatusChanges(sessions)

      // Auto-focus first newly idle session if user hasn't overridden camera
      if (newlyIdle.length > 0 && !state.userChangedCamera) {
        const workingSessions = sessions.filter(s => s.status === 'working')
        if (workingSessions.length === 0) {
          const session = newlyIdle[0]
          if (session.claudeSessionId && state.scene) {
            state.scene.focusZone(session.claudeSessionId)
            selectManagedSession(session.id)
          }
        }
      }
    }

    state.managedSessions = sessions
    renderManagedSessions()

    // Sync zone labels with managed session names
    syncZoneLabels()

    // Update git status displays on zones
    if (state.scene) {
      for (const session of sessions) {
        if (session.claudeSessionId && session.gitStatus) {
          state.scene.updateZoneGitStatus(session.claudeSessionId, session.gitStatus)
        }
      }
    }

    // Restore or auto-select session
    if (!state.selectedManagedSession && sessions.length > 0) {
      // Try to restore from localStorage
      const savedSessionId = localStorage.getItem('vibecraft-selected-session')
      const savedSession = savedSessionId ? sessions.find(s => s.id === savedSessionId) : null

      if (savedSession) {
        selectManagedSession(savedSession.id)
      } else {
        // Fall back to first session
        selectManagedSession(sessions[0].id)
      }
    }

    // Auto-overview once when first reaching 2+ sessions (but respect user's manual changes)
    if (sessions.length >= 2 && state.scene && !state.hasAutoOverviewed && !state.userChangedCamera) {
      state.hasAutoOverviewed = true
      state.scene.setOverviewMode()
    }
  })

  // Handle permission prompts, text tiles, and PTY messages
  state.client.onRawMessage((message) => {
    if (message.type === 'permission_prompt') {
      const { sessionId, tool, context, options } = message.payload as {
        sessionId: string
        tool: string
        context: string
        options: Array<{ number: string; label: string }>
      }
      showPermissionModal(sessionId, tool, context, options)
    } else if (message.type === 'permission_resolved') {
      hidePermissionModal()
    } else if (message.type === 'text_tiles') {
      // Update text tiles in scene
      const tiles = message.payload as import('../shared/types').TextTile[]
      if (state.scene) {
        state.scene.setTextTiles(tiles)
      }
    } else if (message.type.startsWith('pty:')) {
      // Handle PTY terminal messages
      const ptyMessage = message as {
        type: string
        sessionId: string
        data?: string
        exitCode?: number
      }

      // Check if this is for a standalone shell terminal
      const shellTerminal = state.shells.get(ptyMessage.sessionId)
      if (shellTerminal) {
        if (ptyMessage.type === 'pty:output' || ptyMessage.type === 'pty:buffer') {
          if (ptyMessage.data) {
            // Hide loading overlay on first output
            const shellDiv = document.querySelector(`.shell-terminal[data-shell-id="${ptyMessage.sessionId}"]`)
            const loading = shellDiv?.querySelector('.terminal-loading')
            if (loading) {
              loading.remove()
            }
            shellTerminal.write(ptyMessage.data)
          }
        } else if (ptyMessage.type === 'pty:exit') {
          shellTerminal.write(`\r\n\x1b[90m[Shell exited with code ${ptyMessage.exitCode}]\x1b[0m\r\n`)
          // Remove the shell after a short delay so user can see the message
          setTimeout(() => closeShell(ptyMessage.sessionId), 2000)
        }
      } else {
        // Regular session terminal
        if (state.terminalManager) {
          state.terminalManager.handleMessage(ptyMessage)
        }
      }
    }
  })

  // Setup terminal panel BEFORE connect (so it's ready when sessions arrive)
  setupTerminalPanel()

  // Setup standalone shell panel
  setupShellPanel()

  state.client.connect()

  // Setup managed sessions (orchestration)
  setupManagedSessions()

  // Fetch server info (cwd, etc.)
  fetchServerInfo()

  // Setup keyboard shortcuts
  setupKeyboardShortcuts({
    getScene: () => state.scene,
    getManagedSessions: () => state.managedSessions,
    getFocusedSessionId: () => state.focusedSessionId,
    getSelectedManagedSession: () =>
      state.selectedManagedSession
        ? state.managedSessions.find(s => s.id === state.selectedManagedSession) ?? null
        : null,
    onSelectManagedSession: selectManagedSession,
    onFocusSession: focusSession,
    onGoToNextAttention: goToNextAttention,
    onUpdateAttentionBadge: updateAttentionBadge,
    onSetUserChangedCamera: (value) => { state.userChangedCamera = value },
    onInterruptSession: interruptSession,
  })

  // Setup click-to-prompt and context menu
  setupContextMenu()
  setupClickToPrompt()

  // Register camera mode change callback
  state.scene.onCameraMode(updateKeybindHelper)

  // Register zone elevation change callback (to move Claude with zone)
  state.scene.onZoneElevation((sessionId, elevation) => {
    const session = state.sessions.get(sessionId)
    if (session) {
      // Update Claude's Y position to match zone elevation
      // The base station Y is 0.3 (from createZoneStations), so add that offset
      const stationYOffset = 0.3
      session.claude.mesh.position.y = elevation + stationYOffset
    }
  })

  // Fetch config (username, etc.)
  fetchConfig()

  // Setup settings modal
  setupSettingsModal()

  // Setup about modal
  setupAboutModal()

  // Setup dev panel (animation testing, Alt+D to toggle)
  setupDevPanel()

  // Setup question modal (for AskUserQuestion)
  setupQuestionModal({
    scene: state.scene,
    soundEnabled: state.soundEnabled,
    apiUrl: API_URL,
    attentionSystem: state.attentionSystem,
  })

  // Setup permission modal (for tool permissions)
  setupPermissionModal({
    scene: state.scene,
    soundEnabled: state.soundEnabled,
    apiUrl: API_URL,
    attentionSystem: state.attentionSystem,
    getManagedSessions: () => state.managedSessions,
  })

  // Setup zone info modal (for session details)
  setupZoneInfoModal({
    soundEnabled: state.soundEnabled,
  })

  // Setup text label modal (for hex text labels)
  setupTextLabelModal()

  // Setup zone command modal (quick command input near zone)
  setupZoneCommandModal()

  // Setup zone timeout modal (shown when zone creation takes too long)
  setupZoneTimeoutModal()

  // Setup not-connected overlay
  setupNotConnectedOverlay()

  // Setup voice input
  // On vibecraft.sh: voice is always available via cloud proxy, set up immediately
  // On localhost: needs client connected and voice enabled on server
  const isHostedSite = window.location.hostname === 'vibecraft.sh'
  const voiceControl = document.getElementById('voice-control')

  if (isHostedSite) {
    // Hosted mode - voice always available via cloud proxy
    if (voiceControl) voiceControl.classList.remove('disabled')
    state.voice = setupVoiceControl({
      client: state.client,
      soundEnabled: () => state.soundEnabled,
    })
  } else {
    // Local mode - check server health for voice availability
    state.client.onConnection(async (connected) => {
      if (connected && state.client) {
        try {
          const res = await fetch('/health')
          const health = await res.json()
          if (!health.voiceEnabled) {
            if (voiceControl) {
              voiceControl.classList.add('disabled')
              voiceControl.title = 'Voice disabled - set DEEPGRAM_API_KEY in .env'
            }
            return
          }
        } catch {
          if (voiceControl) {
            voiceControl.classList.add('disabled')
            voiceControl.title = 'Voice unavailable - server connection failed'
          }
          return
        }
        // Voice is enabled, set it up
        if (voiceControl) voiceControl.classList.remove('disabled')
        state.voice = setupVoiceControl({
          client: state.client,
          soundEnabled: () => state.soundEnabled,
        })
      }
    })
  }

  // Initialize audio on first user interaction
  const initAudioOnce = () => {
    initAudioOnInteraction()
    document.removeEventListener('click', initAudioOnce)
    document.removeEventListener('keydown', initAudioOnce)
  }
  document.addEventListener('click', initAudioOnce)
  document.addEventListener('keydown', initAudioOnce)

  // Initial UI state
  updateStatus(false, 'Connecting...')
  updateActivity('Waiting for connection...')
  updateStats()

  // Check for updates (non-blocking)
  checkForUpdates()

  // Refit terminals when page becomes visible (handles device switching)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      // Refit active Claude terminal
      state.terminalManager?.refitActive()
      // Refit active shell terminal
      if (state.activeShellId) {
        state.shells.get(state.activeShellId)?.fit()
      }
    }
  })

  // Also refit on window focus (handles returning from other apps)
  window.addEventListener('focus', () => {
    state.terminalManager?.refitActive()
    if (state.activeShellId) {
      state.shells.get(state.activeShellId)?.fit()
    }
  })

  // Handle mobile virtual keyboard - adjust layout when keyboard appears
  if (window.visualViewport) {
    const updateKeyboardHeight = () => {
      const keyboardHeight = window.innerHeight - window.visualViewport!.height
      document.documentElement.style.setProperty('--keyboard-height', `${keyboardHeight}px`)

      // Refit terminals when keyboard changes
      if (keyboardHeight > 0 || keyboardHeight === 0) {
        state.terminalManager?.refitActive()
        if (state.activeShellId) {
          state.shells.get(state.activeShellId)?.fit()
        }
      }
    }

    window.visualViewport.addEventListener('resize', updateKeyboardHeight)
    window.visualViewport.addEventListener('scroll', updateKeyboardHeight)
    updateKeyboardHeight()
  }

  console.log('Vibecraft initialized (multi-session enabled)')
}

// ============================================================================
// Cleanup
// ============================================================================

function cleanup() {
  state.client?.disconnect()
  // Dispose all sessions
  for (const session of state.sessions.values()) {
    session.claude.dispose()
  }
  state.sessions.clear()
  state.scene?.dispose()
}

// ============================================================================
// Start
// ============================================================================

window.addEventListener('load', init)
window.addEventListener('beforeunload', cleanup)

// Export for debugging
;(window as unknown as { vibecraft: AppState }).vibecraft = state
