/**
 * AppState - Central application state
 *
 * Contains all shared state for the Vibecraft application.
 * Extracted from main.ts for better organization.
 */

import type { WorkshopScene, Zone } from '../scene/WorkshopScene'
import type { Claude } from '../entities/ClaudeMon'
import type { SubagentManager } from '../entities/SubagentManager'
import type { EventClient } from '../events/EventClient'
import type { ClaudeEvent, ManagedSession } from '../../shared/types'
import type { AttentionSystem } from '../systems/AttentionSystem'
// TimelineManager removed - now handled by React
import type { TerminalManager, TerminalUI } from '../ui/Terminal'
import type { VoiceState } from '../ui/VoiceControl'

// ============================================================================
// State Interfaces
// ============================================================================

/** Per-session state */
export interface SessionState {
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

export interface AppState {
  scene: WorkshopScene | null
  client: EventClient | null
  sessions: Map<string, SessionState>
  focusedSessionId: string | null  // Currently focused session for camera/prompts
  eventHistory: ClaudeEvent[]
  managedSessions: ManagedSession[]  // Managed sessions from server
  selectedManagedSession: string | null  // Selected managed session ID for prompts
  serverCwd: string  // Server's working directory
  attentionSystem: AttentionSystem | null  // Manages attention queue and notifications
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

// ============================================================================
// State Instance
// ============================================================================

export const state: AppState = {
  scene: null,
  client: null,
  sessions: new Map(),
  focusedSessionId: null,
  eventHistory: [],
  serverCwd: '~',
  managedSessions: [],
  selectedManagedSession: null,
  attentionSystem: null,  // Initialized in init()
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

// ============================================================================
// Pending Zone Tracking
// ============================================================================

// Track pending zone hints for direction-aware placement
// Maps managed session name → click position (used when zone is created)
export const pendingZoneHints = new Map<string, { x: number; z: number }>()

// Track pending zones to clean up when real zone appears
// Maps managed session name → pending zone ID
export const pendingZonesToCleanup = new Map<string, string>()

// Track zone creation timeouts (pendingId → timeoutId)
export const pendingZoneTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

// Zone creation timeout in ms
export const ZONE_CREATION_TIMEOUT = 10000
