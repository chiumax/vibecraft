/**
 * TodosManager - Manages per-session todos
 *
 * Stores todos in localStorage, organized by session/workspace.
 */

export interface Todo {
  id: string
  text: string
  completed: boolean
  createdAt: number
}

export interface SessionTodos {
  sessionId: string
  sessionName: string
  todos: Todo[]
}

const STORAGE_KEY = 'vibecraft-todos'

export class TodosManager {
  private todos: Map<string, SessionTodos> = new Map()
  private container: HTMLElement | null = null
  private onUpdate: (() => void) | null = null

  constructor() {
    this.load()
  }

  /**
   * Initialize the UI in the given container
   */
  init(container: HTMLElement) {
    this.container = container
    this.render()
  }

  /**
   * Set callback for when todos change
   */
  setOnUpdate(callback: () => void) {
    this.onUpdate = callback
  }

  /**
   * Load todos from localStorage
   */
  private load() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data = JSON.parse(stored) as SessionTodos[]
        this.todos = new Map(data.map(st => [st.sessionId, st]))
      }
    } catch (e) {
      console.warn('Failed to load todos:', e)
    }
  }

  /**
   * Save todos to localStorage
   */
  private save() {
    try {
      const data = Array.from(this.todos.values())
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
      this.onUpdate?.()
    } catch (e) {
      console.warn('Failed to save todos:', e)
    }
  }

  /**
   * Add a todo to a session
   */
  addTodo(sessionId: string, sessionName: string, text: string): Todo {
    let sessionTodos = this.todos.get(sessionId)
    if (!sessionTodos) {
      sessionTodos = { sessionId, sessionName, todos: [] }
      this.todos.set(sessionId, sessionTodos)
    }

    const todo: Todo = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      text,
      completed: false,
      createdAt: Date.now(),
    }

    sessionTodos.todos.push(todo)
    sessionTodos.sessionName = sessionName // Update name in case it changed
    this.save()
    this.render()
    return todo
  }

  /**
   * Toggle todo completion
   */
  toggleTodo(sessionId: string, todoId: string) {
    const sessionTodos = this.todos.get(sessionId)
    if (!sessionTodos) return

    const todo = sessionTodos.todos.find(t => t.id === todoId)
    if (todo) {
      todo.completed = !todo.completed
      this.save()
      this.render()
    }
  }

  /**
   * Delete a todo
   */
  deleteTodo(sessionId: string, todoId: string) {
    const sessionTodos = this.todos.get(sessionId)
    if (!sessionTodos) return

    sessionTodos.todos = sessionTodos.todos.filter(t => t.id !== todoId)

    // Remove session entry if no todos left
    if (sessionTodos.todos.length === 0) {
      this.todos.delete(sessionId)
    }

    this.save()
    this.render()
  }

  /**
   * Update session name (called when session is renamed)
   */
  updateSessionName(sessionId: string, newName: string) {
    const sessionTodos = this.todos.get(sessionId)
    if (sessionTodos) {
      sessionTodos.sessionName = newName
      this.save()
      this.render()
    }
  }

  /**
   * Get todos for a session
   */
  getTodos(sessionId: string): Todo[] {
    return this.todos.get(sessionId)?.todos ?? []
  }

  /**
   * Get count of incomplete todos for a session
   */
  getIncompleteCount(sessionId: string): number {
    const todos = this.getTodos(sessionId)
    return todos.filter(t => !t.completed).length
  }

  /**
   * Get total incomplete todos count
   */
  getTotalIncompleteCount(): number {
    let count = 0
    for (const session of this.todos.values()) {
      count += session.todos.filter(t => !t.completed).length
    }
    return count
  }

  /**
   * Render the todos UI
   */
  render() {
    if (!this.container) return

    const sessions = Array.from(this.todos.values())
      .filter(s => s.todos.length > 0)
      .sort((a, b) => a.sessionName.localeCompare(b.sessionName))

    this.container.innerHTML = `
      <div class="todos-content">
        <div class="todos-header">
          <h3>Todos</h3>
          <button class="add-todo-global-btn" title="Add todo to current session">+ Add</button>
        </div>
        ${sessions.length === 0 ? `
          <div class="todos-empty">
            <span class="todos-empty-icon">📝</span>
            <p>No todos yet</p>
            <p class="todos-empty-hint">Click "+ Add" to create a todo for the current workspace</p>
          </div>
        ` : `
          <div class="todos-sessions">
            ${sessions.map(session => this.renderSessionTodos(session)).join('')}
          </div>
        `}
      </div>
    `

    this.attachEventListeners()
  }

  /**
   * Render todos for a single session
   */
  private renderSessionTodos(session: SessionTodos): string {
    const incompleteTodos = session.todos.filter(t => !t.completed)
    const completedTodos = session.todos.filter(t => t.completed)

    return `
      <div class="todos-session" data-session-id="${session.sessionId}">
        <div class="todos-session-header">
          <span class="todos-session-name">${this.escapeHtml(session.sessionName)}</span>
          <span class="todos-session-count">${incompleteTodos.length}/${session.todos.length}</span>
          <button class="add-todo-btn" data-session-id="${session.sessionId}" title="Add todo">+</button>
        </div>
        <div class="todos-list">
          ${incompleteTodos.map(todo => this.renderTodo(session.sessionId, todo)).join('')}
          ${completedTodos.length > 0 ? `
            <div class="todos-completed-section">
              <details>
                <summary>Completed (${completedTodos.length})</summary>
                ${completedTodos.map(todo => this.renderTodo(session.sessionId, todo)).join('')}
              </details>
            </div>
          ` : ''}
        </div>
      </div>
    `
  }

  /**
   * Render a single todo item
   */
  private renderTodo(sessionId: string, todo: Todo): string {
    return `
      <div class="todo-item ${todo.completed ? 'completed' : ''}" data-todo-id="${todo.id}" data-session-id="${sessionId}">
        <button class="todo-checkbox" title="${todo.completed ? 'Mark incomplete' : 'Mark complete'}">
          ${todo.completed ? '✓' : ''}
        </button>
        <span class="todo-text">${this.escapeHtml(todo.text)}</span>
        <button class="todo-delete" title="Delete todo">×</button>
      </div>
    `
  }

  /**
   * Attach event listeners to rendered elements
   */
  private attachEventListeners() {
    if (!this.container) return

    // Add global todo button
    const addGlobalBtn = this.container.querySelector('.add-todo-global-btn')
    addGlobalBtn?.addEventListener('click', () => {
      this.showAddTodoModal()
    })

    // Add session todo buttons
    const addBtns = this.container.querySelectorAll('.add-todo-btn')
    addBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const sessionId = (btn as HTMLElement).dataset.sessionId
        if (sessionId) {
          this.showAddTodoModal(sessionId)
        }
        e.stopPropagation()
      })
    })

    // Checkbox clicks (toggle completion)
    const checkboxes = this.container.querySelectorAll('.todo-checkbox')
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('click', (e) => {
        const item = (checkbox as HTMLElement).closest('.todo-item')
        const todoId = (item as HTMLElement)?.dataset.todoId
        const sessionId = (item as HTMLElement)?.dataset.sessionId
        if (todoId && sessionId) {
          this.toggleTodo(sessionId, todoId)
        }
        e.stopPropagation()
      })
    })

    // Delete buttons
    const deleteBtns = this.container.querySelectorAll('.todo-delete')
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        const item = (btn as HTMLElement).closest('.todo-item')
        const todoId = (item as HTMLElement)?.dataset.todoId
        const sessionId = (item as HTMLElement)?.dataset.sessionId
        if (todoId && sessionId) {
          this.deleteTodo(sessionId, todoId)
        }
        e.stopPropagation()
      })
    })
  }

  /**
   * Show the add todo modal
   */
  private showAddTodoModal(preselectedSessionId?: string) {
    // Get current sessions from the window
    const sessions = (window as any).vibecraftGetSessions?.() ?? []

    if (sessions.length === 0) {
      alert('No sessions available. Create a session first.')
      return
    }

    const sessionId = preselectedSessionId || sessions[0]?.id
    const sessionName = sessions.find((s: any) => s.id === sessionId)?.name || 'Unknown'

    // Create modal
    const modal = document.createElement('div')
    modal.className = 'todo-modal-overlay'
    modal.innerHTML = `
      <div class="todo-modal">
        <div class="todo-modal-header">
          <h3>Add Todo</h3>
          <button class="todo-modal-close">×</button>
        </div>
        <div class="todo-modal-body">
          <div class="todo-modal-field">
            <label>Workspace</label>
            <select class="todo-session-select">
              ${sessions.map((s: any) => `
                <option value="${s.id}" ${s.id === sessionId ? 'selected' : ''}>${this.escapeHtml(s.name)}</option>
              `).join('')}
            </select>
          </div>
          <div class="todo-modal-field">
            <label>Todo</label>
            <input type="text" class="todo-input" placeholder="What needs to be done?" autofocus />
          </div>
        </div>
        <div class="todo-modal-actions">
          <button class="todo-modal-cancel">Cancel</button>
          <button class="todo-modal-add">Add Todo</button>
        </div>
      </div>
    `

    document.body.appendChild(modal)

    // Focus input
    const input = modal.querySelector('.todo-input') as HTMLInputElement
    setTimeout(() => input?.focus(), 50)

    // Event handlers
    const close = () => modal.remove()

    modal.querySelector('.todo-modal-close')?.addEventListener('click', close)
    modal.querySelector('.todo-modal-cancel')?.addEventListener('click', close)
    modal.querySelector('.todo-modal-overlay')?.addEventListener('click', (e) => {
      if (e.target === modal) close()
    })

    const addTodo = () => {
      const select = modal.querySelector('.todo-session-select') as HTMLSelectElement
      const selectedSessionId = select.value
      const selectedOption = select.options[select.selectedIndex]
      const selectedSessionName = selectedOption?.text || 'Unknown'
      const text = input.value.trim()

      if (text) {
        this.addTodo(selectedSessionId, selectedSessionName, text)
        close()
      }
    }

    modal.querySelector('.todo-modal-add')?.addEventListener('click', addTodo)
    input?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addTodo()
      } else if (e.key === 'Escape') {
        close()
      }
    })
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
  }
}

// Singleton instance
let todosManager: TodosManager | null = null

export function initTodosManager(): TodosManager {
  if (!todosManager) {
    todosManager = new TodosManager()
  }
  return todosManager
}

export function getTodosManager(): TodosManager | null {
  return todosManager
}
