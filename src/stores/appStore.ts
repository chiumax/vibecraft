/**
 * Zustand App Store
 *
 * Central state management for Vibecraft React components.
 * This store mirrors the existing AppState and provides reactive state
 * that can be accessed both inside and outside React components.
 *
 * Key features:
 * - Can be accessed outside React (critical for Three.js/EventBus)
 * - Excellent TypeScript support
 * - Built-in localStorage persistence for user preferences
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { ClaudeEvent, ManagedSession } from '@shared/types'
import type { WorkshopScene, Zone } from '../scene/WorkshopScene'
import type { Claude } from '../entities/ClaudeMon'
import type { SubagentManager } from '../entities/SubagentManager'
import type { EventClient } from '../events/EventClient'
import type { AttentionSystem } from '../systems/AttentionSystem'
// TimelineManager removed - now handled by React
import type { TerminalManager, TerminalUI } from '../ui/Terminal'
import type { VoiceState } from '../ui/VoiceControl'

// ============================================================================
// Types
// ============================================================================

/** Per-session state (same as existing SessionState) */
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

/** Layout types for responsive design */
export type LayoutType = 'desktop' | 'tablet' | 'mobile'

/** Current view for mobile/tablet navigation */
export type ViewType = 'feed' | 'scene' | 'terminal' | 'shell'

/** Modal types that can be shown */
export type ModalType =
  | 'about'
  | 'settings'
  | 'newSession'
  | 'question'
  | 'permission'
  | 'zoneInfo'
  | 'zoneCommand'
  | 'textLabel'
  | 'zoneTimeout'
  | null

// ============================================================================
// Non-persisted State (runtime only)
// ============================================================================

interface RuntimeState {
  // Connection
  connected: boolean
  offlineMode: boolean // User chose to explore offline
  client: EventClient | null

  // Scene (Three.js - stored as refs, not reactive)
  scene: WorkshopScene | null

  // Sessions
  sessions: Map<string, SessionState>
  managedSessions: ManagedSession[]
  focusedSessionId: string | null
  selectedManagedSession: string | null

  // Event history
  eventHistory: ClaudeEvent[]

  // Server info
  serverCwd: string

  // Systems (stored as refs, not reactive)
  attentionSystem: AttentionSystem | null
  attentionVersion: number // Incremented when attention changes, triggers React re-renders
  terminalManager: TerminalManager | null

  // Shells
  shells: Map<string, TerminalUI>
  activeShellId: string | null
  shellCounter: number

  // Voice
  voice: VoiceState | null

  // Prompt cache
  lastPrompts: Map<string, string>

  // Camera state
  hasAutoOverviewed: boolean
  userChangedCamera: boolean

  // UI
  activeModal: ModalType
  modalData: Record<string, unknown>
  currentLayout: LayoutType
  currentView: ViewType
}

// ============================================================================
// Persisted State (localStorage)
// ============================================================================

interface PersistedState {
  // Audio settings
  volume: number
  soundEnabled: boolean
  spatialAudioEnabled: boolean
  soundPack: string  // SoundPackId

  // Privacy
  streamingMode: boolean

  // World settings
  gridSize: number

  // Connection settings
  port: number

  // Layout preferences
  stackShellWithSessions: boolean
}

// ============================================================================
// Actions
// ============================================================================

interface Actions {
  // Connection
  setConnected: (connected: boolean) => void
  setOfflineMode: (offlineMode: boolean) => void
  setClient: (client: EventClient | null) => void

  // Scene
  setScene: (scene: WorkshopScene | null) => void

  // Sessions
  addSession: (sessionId: string, session: SessionState) => void
  removeSession: (sessionId: string) => void
  updateSession: (sessionId: string, updates: Partial<SessionState>) => void
  setManagedSessions: (sessions: ManagedSession[]) => void
  setFocusedSessionId: (sessionId: string | null) => void
  setSelectedManagedSession: (sessionId: string | null) => void

  // Events
  addEvent: (event: ClaudeEvent) => void
  setEventHistory: (events: ClaudeEvent[]) => void

  // Server
  setServerCwd: (cwd: string) => void

  // Systems
  setAttentionSystem: (system: AttentionSystem | null) => void
  bumpAttentionVersion: () => void // Call when attention queue changes
  setTerminalManager: (manager: TerminalManager | null) => void

  // Shells
  addShell: (id: string, shell: TerminalUI) => void
  removeShell: (id: string) => void
  setActiveShellId: (id: string | null) => void
  incrementShellCounter: () => number

  // Voice
  setVoice: (voice: VoiceState | null) => void

  // Prompts
  setLastPrompt: (sessionId: string, prompt: string) => void

  // Camera
  setHasAutoOverviewed: (value: boolean) => void
  setUserChangedCamera: (value: boolean) => void

  // UI
  showModal: (modal: ModalType, data?: Record<string, unknown>) => void
  hideModal: () => void
  setCurrentLayout: (layout: LayoutType) => void
  setCurrentView: (view: ViewType) => void

  // Settings (persisted)
  setVolume: (volume: number) => void
  setSoundEnabled: (enabled: boolean) => void
  setSpatialAudioEnabled: (enabled: boolean) => void
  setSoundPack: (pack: string) => void
  setStreamingMode: (enabled: boolean) => void
  setGridSize: (size: number) => void
  setPort: (port: number) => void
  setStackShellWithSessions: (enabled: boolean) => void
}

// ============================================================================
// Store Type
// ============================================================================

export type AppStore = RuntimeState & PersistedState & Actions

// ============================================================================
// Initial State
// ============================================================================

const initialRuntimeState: RuntimeState = {
  connected: false,
  offlineMode: false,
  client: null,
  scene: null,
  sessions: new Map(),
  managedSessions: [],
  focusedSessionId: null,
  selectedManagedSession: null,
  eventHistory: [],
  serverCwd: '~',
  attentionSystem: null,
  attentionVersion: 0,
  terminalManager: null,
  shells: new Map(),
  activeShellId: null,
  shellCounter: 0,
  voice: null,
  lastPrompts: new Map(),
  hasAutoOverviewed: false,
  userChangedCamera: false,
  activeModal: null,
  modalData: {},
  currentLayout: 'desktop',
  currentView: 'feed',
}

const initialPersistedState: PersistedState = {
  volume: 70,
  soundEnabled: true,
  spatialAudioEnabled: true,
  soundPack: 'synth',
  streamingMode: false,
  gridSize: 20,
  port: 4003,
  stackShellWithSessions: false,
}

// ============================================================================
// Store Creation
// ============================================================================

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => ({
      // Initial state
      ...initialRuntimeState,
      ...initialPersistedState,

      // Connection actions
      setConnected: (connected) => set({ connected }),
      setOfflineMode: (offlineMode) => set({ offlineMode }),
      setClient: (client) => set({ client }),

      // Scene actions
      setScene: (scene) => set({ scene }),

      // Session actions
      addSession: (sessionId, session) =>
        set((state) => {
          const sessions = new Map(state.sessions)
          sessions.set(sessionId, session)
          return { sessions }
        }),

      removeSession: (sessionId) =>
        set((state) => {
          const sessions = new Map(state.sessions)
          sessions.delete(sessionId)
          return { sessions }
        }),

      updateSession: (sessionId, updates) =>
        set((state) => {
          const sessions = new Map(state.sessions)
          const existing = sessions.get(sessionId)
          if (existing) {
            sessions.set(sessionId, { ...existing, ...updates })
          }
          return { sessions }
        }),

      setManagedSessions: (managedSessions) => set({ managedSessions }),
      setFocusedSessionId: (focusedSessionId) => set({ focusedSessionId }),
      setSelectedManagedSession: (selectedManagedSession) =>
        set({ selectedManagedSession }),

      // Event actions
      addEvent: (event) =>
        set((state) => ({
          eventHistory: [...state.eventHistory, event],
        })),

      setEventHistory: (eventHistory) => set({ eventHistory }),

      // Server actions
      setServerCwd: (serverCwd) => set({ serverCwd }),

      // System actions
      setAttentionSystem: (attentionSystem) => set({ attentionSystem }),
      bumpAttentionVersion: () =>
        set((state) => ({ attentionVersion: state.attentionVersion + 1 })),
      setTerminalManager: (terminalManager) => set({ terminalManager }),

      // Shell actions
      addShell: (id, shell) =>
        set((state) => {
          const shells = new Map(state.shells)
          shells.set(id, shell)
          return { shells }
        }),

      removeShell: (id) =>
        set((state) => {
          const shells = new Map(state.shells)
          shells.delete(id)
          return { shells }
        }),

      setActiveShellId: (activeShellId) => set({ activeShellId }),

      incrementShellCounter: () => {
        const current = get().shellCounter
        set({ shellCounter: current + 1 })
        return current + 1
      },

      // Voice actions
      setVoice: (voice) => set({ voice }),

      // Prompt actions
      setLastPrompt: (sessionId, prompt) =>
        set((state) => {
          const lastPrompts = new Map(state.lastPrompts)
          lastPrompts.set(sessionId, prompt)
          return { lastPrompts }
        }),

      // Camera actions
      setHasAutoOverviewed: (hasAutoOverviewed) => set({ hasAutoOverviewed }),
      setUserChangedCamera: (userChangedCamera) => set({ userChangedCamera }),

      // UI actions
      showModal: (activeModal, modalData = {}) =>
        set({ activeModal, modalData }),
      hideModal: () => set({ activeModal: null, modalData: {} }),
      setCurrentLayout: (currentLayout) => set({ currentLayout }),
      setCurrentView: (currentView) => set({ currentView }),

      // Settings actions (persisted)
      setVolume: (volume) => set({ volume }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setSpatialAudioEnabled: (spatialAudioEnabled) =>
        set({ spatialAudioEnabled }),
      setSoundPack: (soundPack) => set({ soundPack }),
      setStreamingMode: (streamingMode) => set({ streamingMode }),
      setGridSize: (gridSize) => set({ gridSize }),
      setPort: (port) => set({ port }),
      setStackShellWithSessions: (stackShellWithSessions) =>
        set({ stackShellWithSessions }),
    }),
    {
      name: 'vibecraft-settings',
      storage: createJSONStorage(() => localStorage),
      // Only persist user preferences, not runtime state
      partialize: (state) => ({
        volume: state.volume,
        soundEnabled: state.soundEnabled,
        spatialAudioEnabled: state.spatialAudioEnabled,
        soundPack: state.soundPack,
        streamingMode: state.streamingMode,
        gridSize: state.gridSize,
        port: state.port,
        stackShellWithSessions: state.stackShellWithSessions,
      }),
    }
  )
)

// ============================================================================
// Non-React Access
// ============================================================================

/**
 * Get current state snapshot (for use outside React)
 * Useful for Three.js callbacks, EventBus handlers, etc.
 */
export const getAppState = () => useAppStore.getState()

/**
 * Subscribe to state changes (for use outside React)
 * Returns unsubscribe function
 */
export const subscribeToStore = useAppStore.subscribe

// ============================================================================
// Convenience Selectors
// ============================================================================

/** Get the currently focused session */
export const getFocusedSession = (): SessionState | undefined => {
  const state = getAppState()
  if (!state.focusedSessionId) return undefined
  return state.sessions.get(state.focusedSessionId)
}

/** Get a managed session by its ID */
export const getManagedSession = (
  sessionId: string
): ManagedSession | undefined => {
  return getAppState().managedSessions.find((s) => s.id === sessionId)
}

/** Check if any session needs attention */
export const hasAttentionNeeded = (): boolean => {
  const { attentionSystem, managedSessions } = getAppState()
  if (!attentionSystem) return false
  return managedSessions.some((s) => attentionSystem.needsAttention(s.id))
}

// ============================================================================
// Modal Helpers (for use from vanilla TS code)
// ============================================================================

/**
 * Show a modal with optional data
 * Can be called from anywhere (React or vanilla TS)
 */
export const showAppModal = (
  modal: ModalType,
  data?: Record<string, unknown>
): void => {
  useAppStore.getState().showModal(modal, data)
}

/**
 * Hide the current modal
 * Can be called from anywhere (React or vanilla TS)
 */
export const hideAppModal = (): void => {
  useAppStore.getState().hideModal()
}

// ============================================================================
// Promise-based Modal Helpers (for backward compatibility with vanilla TS)
// ============================================================================

/**
 * Show text label modal and return entered text (or null if cancelled)
 * Wraps React modal with Promise API for backward compatibility
 */
export const showTextLabelModalAsync = (options: {
  title?: string
  placeholder?: string
  initialText?: string
  maxLength?: number
}): Promise<string | null> => {
  return new Promise((resolve) => {
    useAppStore.getState().showModal('textLabel', {
      ...options,
      onSave: (text: string | null) => resolve(text),
    })
  })
}

/**
 * Show question modal for AskUserQuestion tool
 * The modal handles sending the response via API
 */
export const showQuestionModalFromEvent = (data: {
  sessionId: string
  managedSessionId: string | null
  questions: Array<{
    question: string
    header: string
    options: Array<{ label: string; description?: string }>
    multiSelect: boolean
  }>
  apiUrl: string
}): void => {
  useAppStore.getState().showModal('question', data)
}

/**
 * Show permission modal for tool permission prompts
 * The modal handles sending the response via API
 */
export const showPermissionModalFromEvent = (data: {
  sessionId: string
  tool: string
  context: string
  options: Array<{ number: string; label: string }>
  apiUrl: string
  getManagedSessions: () => import('@shared/types').ManagedSession[]
}): void => {
  useAppStore.getState().showModal('permission', data)
}

/**
 * Show zone info modal with session details
 */
export const showZoneInfoModalFromEvent = (data: {
  managedSession: import('@shared/types').ManagedSession
  stats?: {
    toolsUsed: number
    filesTouched: Set<string>
    activeSubagents: number
  }
}): void => {
  useAppStore.getState().showModal('zoneInfo', data)
}

/**
 * Show zone command modal for quick commands to a zone
 */
export const showZoneCommandModalFromEvent = (data: {
  sessionId: string
  sessionName: string
  sessionColor: number
  zonePosition: import('three').Vector3
  camera: import('three').PerspectiveCamera
  renderer: import('three').WebGLRenderer
  onSend: (sessionId: string, prompt: string) => Promise<{ ok: boolean; error?: string }>
}): void => {
  useAppStore.getState().showModal('zoneCommand', data)
}
