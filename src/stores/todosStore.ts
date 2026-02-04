/**
 * Zustand Todos Store
 *
 * Manages todos state for the Kanban board with server persistence.
 * Migrates old todos (without status) to use the new status field.
 */

import { create } from 'zustand'
import type { Todo, TodoStatus, SessionTodos } from '@shared/types'

// ============================================================================
// Types
// ============================================================================

interface TodosState {
  /** Todos grouped by session */
  sessionTodos: Map<string, SessionTodos>
  /** Whether initial load has completed */
  isLoaded: boolean
  /** Filter to show only specific session's todos (null = all) */
  filterSessionId: string | null
  /** API URL for server requests */
  apiUrl: string
}

interface TodosActions {
  /** Set API URL (call before loadTodos) */
  setApiUrl: (url: string) => void
  /** Load todos from server */
  loadTodos: () => Promise<void>
  /** Add a new todo */
  addTodo: (sessionId: string, sessionName: string, text: string, status?: TodoStatus) => Promise<Todo>
  /** Update a todo's status (for drag-and-drop) */
  updateTodoStatus: (sessionId: string, todoId: string, status: TodoStatus) => Promise<void>
  /** Toggle todo completion (legacy support) */
  toggleTodo: (sessionId: string, todoId: string) => Promise<void>
  /** Delete a todo */
  deleteTodo: (sessionId: string, todoId: string) => Promise<void>
  /** Set session filter */
  setFilter: (sessionId: string | null) => void
  /** Get todos for a session */
  getTodos: (sessionId: string) => Todo[]
  /** Get all todos (respecting filter) */
  getAllTodos: () => { sessionId: string; sessionName: string; todo: Todo }[]
  /** Get count of incomplete todos */
  getIncompleteCount: (sessionId?: string) => number
  /** Update session name */
  updateSessionName: (sessionId: string, newName: string) => void
}

export type TodosStore = TodosState & TodosActions

// ============================================================================
// Migration Helper
// ============================================================================

/**
 * Migrate a todo from old format (completed only) to new format (with status)
 */
function migrateTodo(todo: Partial<Todo> & { id: string; text: string; createdAt: number }): Todo {
  // If status exists, use it
  if (todo.status) {
    return {
      ...todo,
      completed: todo.status === 'done',
      status: todo.status,
    } as Todo
  }

  // Derive status from completed field
  const completed = todo.completed ?? false
  return {
    id: todo.id,
    text: todo.text,
    completed,
    status: completed ? 'done' : 'todo',
    createdAt: todo.createdAt,
  }
}

/**
 * Migrate all todos in a session
 */
function migrateSessionTodos(session: SessionTodos): SessionTodos {
  return {
    ...session,
    todos: session.todos.map(migrateTodo),
  }
}

// ============================================================================
// Store Creation
// ============================================================================

export const useTodosStore = create<TodosStore>()((set, get) => ({
  // Initial state
  sessionTodos: new Map(),
  isLoaded: false,
  filterSessionId: null,
  apiUrl: '/api',

  // Actions
  setApiUrl: (apiUrl) => set({ apiUrl }),

  loadTodos: async () => {
    const { apiUrl } = get()
    try {
      const response = await fetch(`${apiUrl}/todos`)
      if (response.ok) {
        const data = await response.json()
        if (data.ok && Array.isArray(data.todos)) {
          // Migrate todos to new format if needed
          const migrated = data.todos.map(migrateSessionTodos)
          const sessionTodos = new Map<string, SessionTodos>(
            migrated.map((st: SessionTodos) => [st.sessionId, st] as [string, SessionTodos])
          )
          set({ sessionTodos, isLoaded: true })
        }
      }
    } catch (e) {
      console.warn('Failed to load todos from server:', e)
    }
    set({ isLoaded: true })
  },

  addTodo: async (sessionId, sessionName, text, status = 'todo') => {
    const { sessionTodos, apiUrl } = get()

    const todo: Todo = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      completed: status === 'done',
      status,
      createdAt: Date.now(),
    }

    const newSessionTodos = new Map(sessionTodos)
    let session = newSessionTodos.get(sessionId)

    if (!session) {
      session = { sessionId, sessionName, todos: [] }
    } else {
      session = { ...session, sessionName } // Update name in case it changed
    }

    session = { ...session, todos: [...session.todos, todo] }
    newSessionTodos.set(sessionId, session)
    set({ sessionTodos: newSessionTodos })

    // Save to server
    await saveTodos(apiUrl, newSessionTodos)

    return todo
  },

  updateTodoStatus: async (sessionId, todoId, status) => {
    const { sessionTodos, apiUrl } = get()
    const session = sessionTodos.get(sessionId)
    if (!session) return

    const todoIndex = session.todos.findIndex(t => t.id === todoId)
    if (todoIndex === -1) return

    const newTodos = [...session.todos]
    newTodos[todoIndex] = {
      ...newTodos[todoIndex],
      status,
      completed: status === 'done',
    }

    const newSessionTodos = new Map(sessionTodos)
    newSessionTodos.set(sessionId, { ...session, todos: newTodos })
    set({ sessionTodos: newSessionTodos })

    // Save to server
    await saveTodos(apiUrl, newSessionTodos)
  },

  toggleTodo: async (sessionId, todoId) => {
    const { sessionTodos, apiUrl } = get()
    const session = sessionTodos.get(sessionId)
    if (!session) return

    const todoIndex = session.todos.findIndex(t => t.id === todoId)
    if (todoIndex === -1) return

    const todo = session.todos[todoIndex]
    const newCompleted = !todo.completed
    const newStatus: TodoStatus = newCompleted ? 'done' : 'todo'

    const newTodos = [...session.todos]
    newTodos[todoIndex] = {
      ...todo,
      completed: newCompleted,
      status: newStatus,
    }

    const newSessionTodos = new Map(sessionTodos)
    newSessionTodos.set(sessionId, { ...session, todos: newTodos })
    set({ sessionTodos: newSessionTodos })

    // Save to server
    await saveTodos(apiUrl, newSessionTodos)
  },

  deleteTodo: async (sessionId, todoId) => {
    const { sessionTodos, apiUrl } = get()
    const session = sessionTodos.get(sessionId)
    if (!session) return

    const newTodos = session.todos.filter(t => t.id !== todoId)
    const newSessionTodos = new Map(sessionTodos)

    if (newTodos.length === 0) {
      newSessionTodos.delete(sessionId)
    } else {
      newSessionTodos.set(sessionId, { ...session, todos: newTodos })
    }

    set({ sessionTodos: newSessionTodos })

    // Save to server
    await saveTodos(apiUrl, newSessionTodos)
  },

  setFilter: (filterSessionId) => set({ filterSessionId }),

  getTodos: (sessionId) => {
    const { sessionTodos } = get()
    return sessionTodos.get(sessionId)?.todos ?? []
  },

  getAllTodos: () => {
    const { sessionTodos, filterSessionId } = get()
    const result: { sessionId: string; sessionName: string; todo: Todo }[] = []

    for (const [sessionId, session] of sessionTodos) {
      // Apply filter
      if (filterSessionId && sessionId !== filterSessionId) continue

      for (const todo of session.todos) {
        result.push({
          sessionId,
          sessionName: session.sessionName,
          todo,
        })
      }
    }

    return result
  },

  getIncompleteCount: (sessionId) => {
    const { sessionTodos } = get()

    if (sessionId) {
      const session = sessionTodos.get(sessionId)
      return session?.todos.filter(t => !t.completed).length ?? 0
    }

    let count = 0
    for (const session of sessionTodos.values()) {
      count += session.todos.filter(t => !t.completed).length
    }
    return count
  },

  updateSessionName: (sessionId, newName) => {
    const { sessionTodos, apiUrl } = get()
    const session = sessionTodos.get(sessionId)
    if (!session) return

    const newSessionTodos = new Map(sessionTodos)
    newSessionTodos.set(sessionId, { ...session, sessionName: newName })
    set({ sessionTodos: newSessionTodos })

    // Save to server (fire and forget)
    saveTodos(apiUrl, newSessionTodos)
  },
}))

// ============================================================================
// Helper Functions
// ============================================================================

async function saveTodos(apiUrl: string, sessionTodos: Map<string, SessionTodos>): Promise<void> {
  try {
    const data = Array.from(sessionTodos.values())
    const response = await fetch(`${apiUrl}/todos`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      console.warn('Failed to save todos to server')
    }
  } catch (e) {
    console.warn('Failed to save todos:', e)
  }
}

// ============================================================================
// Non-React Access
// ============================================================================

/**
 * Get current state snapshot (for use outside React)
 */
export const getTodosState = () => useTodosStore.getState()

/**
 * Subscribe to state changes (for use outside React)
 */
export const subscribeToTodosStore = useTodosStore.subscribe
