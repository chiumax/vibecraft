/**
 * Zustand Planner Store
 *
 * Manages planner state for the goal decomposition UI.
 * Uses Claude Code sessions for planning - no separate API key needed.
 */

import { create } from 'zustand'
import type {
  PlanRequest,
  PlanResult,
  PlannerState,
} from '@shared/types'

// ============================================================================
// Types
// ============================================================================

interface PlannerStoreState {
  /** Current planner state from server */
  state: PlannerState
  /** Whether planner is available */
  available: boolean
  /** Current plan preview (before creating todos) */
  planPreview: PlanResult | null
  /** The generated prompt (to send to Claude Code) */
  generatedPrompt: string | null
  /** Loading states */
  isBuildingPrompt: boolean
  isParsingResponse: boolean
  isCreatingTodos: boolean
  /** Error message */
  error: string | null
  /** API URL for server requests */
  apiUrl: string
}

interface PlannerStoreActions {
  /** Set API URL */
  setApiUrl: (url: string) => void
  /** Fetch planner status from server */
  fetchStatus: () => Promise<void>
  /** Build a planning prompt for a goal */
  buildPrompt: (request: PlanRequest) => Promise<string | null>
  /** Parse Claude's response into a plan */
  parseResponse: (response: string) => Promise<PlanResult | null>
  /** Create todos from the plan preview */
  createTodos: (sessionId: string, autoExecute?: boolean) => Promise<boolean>
  /** Clear the plan preview and prompt */
  clearPreview: () => void
  /** Pause auto-execution */
  pause: () => Promise<void>
  /** Resume auto-execution */
  resume: () => Promise<void>
  /** Reset planner state */
  reset: () => Promise<void>
  /** Clear error */
  clearError: () => void
}

export type PlannerStore = PlannerStoreState & PlannerStoreActions

// ============================================================================
// Initial State
// ============================================================================

const initialState: PlannerStoreState = {
  state: {
    status: 'idle',
    currentGoal: null,
    executingTodoId: null,
    completedCount: 0,
    totalCount: 0,
  },
  available: true, // Always available since we use Claude Code
  planPreview: null,
  generatedPrompt: null,
  isBuildingPrompt: false,
  isParsingResponse: false,
  isCreatingTodos: false,
  error: null,
  apiUrl: '/api',
}

// ============================================================================
// Store Creation
// ============================================================================

export const usePlannerStore = create<PlannerStore>()((set, get) => ({
  ...initialState,

  setApiUrl: (apiUrl) => set({ apiUrl }),

  fetchStatus: async () => {
    const { apiUrl } = get()
    try {
      const response = await fetch(`${apiUrl}/planner/status`)
      if (response.ok) {
        const data = await response.json()
        if (data.ok) {
          set({
            available: data.available,
            state: data.state,
          })
        }
      }
    } catch (e) {
      console.warn('Failed to fetch planner status:', e)
    }
  },

  buildPrompt: async (request) => {
    const { apiUrl } = get()
    set({ isBuildingPrompt: true, error: null, generatedPrompt: null, planPreview: null })

    try {
      const response = await fetch(`${apiUrl}/planner/build-prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      })

      const data = await response.json()

      if (!data.ok) {
        set({ error: data.error || 'Failed to build prompt', isBuildingPrompt: false })
        return null
      }

      set({
        generatedPrompt: data.prompt,
        isBuildingPrompt: false,
        state: { ...get().state, currentGoal: request.goal, status: 'planning' },
      })

      return data.prompt as string
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error'
      set({ error: msg, isBuildingPrompt: false })
      return null
    }
  },

  parseResponse: async (response) => {
    const { apiUrl } = get()
    set({ isParsingResponse: true, error: null })

    try {
      const res = await fetch(`${apiUrl}/planner/parse`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })

      const data = await res.json()

      if (!data.ok) {
        set({ error: data.error || 'Failed to parse response', isParsingResponse: false })
        return null
      }

      set({
        planPreview: data.plan,
        isParsingResponse: false,
        generatedPrompt: null, // Clear prompt after parsing
        state: { ...get().state, status: 'idle' },
      })

      return data.plan as PlanResult
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error'
      set({ error: msg, isParsingResponse: false })
      return null
    }
  },

  createTodos: async (sessionId, autoExecute = false) => {
    const { apiUrl, planPreview } = get()
    if (!planPreview) return false

    set({ isCreatingTodos: true, error: null })

    try {
      const response = await fetch(`${apiUrl}/planner/create-todos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          todos: planPreview.todos,
          autoExecute,
        }),
      })

      const data = await response.json()

      if (!data.ok) {
        set({ error: data.error || 'Failed to create todos', isCreatingTodos: false })
        return false
      }

      set({
        isCreatingTodos: false,
        planPreview: null,
        state: {
          ...get().state,
          totalCount: data.count,
          completedCount: 0,
          status: autoExecute ? 'executing' : 'idle',
        },
      })

      return true
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Network error'
      set({ error: msg, isCreatingTodos: false })
      return false
    }
  },

  clearPreview: () => set({ planPreview: null, generatedPrompt: null, error: null }),

  pause: async () => {
    const { apiUrl } = get()
    try {
      const response = await fetch(`${apiUrl}/planner/pause`, { method: 'POST' })
      const data = await response.json()
      if (data.ok) {
        set({ state: data.state })
      }
    } catch (e) {
      console.warn('Failed to pause planner:', e)
    }
  },

  resume: async () => {
    const { apiUrl } = get()
    try {
      const response = await fetch(`${apiUrl}/planner/resume`, { method: 'POST' })
      const data = await response.json()
      if (data.ok) {
        set({ state: data.state })
      }
    } catch (e) {
      console.warn('Failed to resume planner:', e)
    }
  },

  reset: async () => {
    const { apiUrl } = get()
    try {
      const response = await fetch(`${apiUrl}/planner/reset`, { method: 'POST' })
      const data = await response.json()
      if (data.ok) {
        set({ state: data.state, planPreview: null, generatedPrompt: null, error: null })
      }
    } catch (e) {
      console.warn('Failed to reset planner:', e)
    }
  },

  clearError: () => set({ error: null }),
}))

// ============================================================================
// Non-React Access
// ============================================================================

export const getPlannerState = () => usePlannerStore.getState()
export const subscribeToPlannerStore = usePlannerStore.subscribe
