/**
 * ShellManager - Manages standalone shell terminals
 *
 * Handles creation, switching, and cleanup of shell terminals
 * in the shell tab of the sessions panel.
 */

import { state } from '../state'
import { TerminalUI } from './Terminal'
import { initTodosManager, getTodosManager } from './TodosManager'

// ============================================================================
// Shell Terminal Functions
// ============================================================================

/**
 * Generate a unique shell ID
 */
export function generateShellId(): string {
  state.shellCounter++
  return `shell-${state.shellCounter}`
}

/**
 * Create a new shell terminal
 */
export function createShell(shellId?: string): string {
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
export function addShellTab(shellId: string): void {
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
export function switchToShell(shellId: string): void {
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
export function closeShell(shellId: string): void {
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

// ============================================================================
// Panel Setup
// ============================================================================

/**
 * Setup standalone shell terminal panel
 * @param apiUrl - The API URL for server communication
 */
export function setupShellPanel(apiUrl: string): void {
  // Setup new shell buttons (there may be multiple - one in feed panel, one in mobile shell panel)
  const newShellBtns = document.querySelectorAll('#new-shell-btn')
  newShellBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      createShell()
    })
  })

  // Setup desktop tab switching
  setupSessionsTabs(apiUrl)
}

/**
 * Setup sessions panel tab switching (Sessions / Shell / Todos)
 * @param apiUrl - The API URL for server communication
 */
export function setupSessionsTabs(apiUrl: string): void {
  const tabs = document.querySelectorAll('.sessions-tab')
  const sessionsList = document.getElementById('sessions-list')
  const shellContent = document.getElementById('shell-tab-content')
  const todosContent = document.getElementById('todos-tab-content')

  // Initialize todos manager with API URL
  const todosManager = initTodosManager()
  todosManager.setApiUrl(apiUrl)
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
export function updateTodosBadge(): void {
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
export function showShellPanel(): void {
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
export function hideShellPanel(): void {
  const panel = document.getElementById('shell-panel')
  panel?.classList.add('hidden')
}

/**
 * Handle shell PTY message from server
 */
export function handleShellMessage(message: { type: string; sessionId: string; data?: string }): void {
  if (message.type === 'shell:output' || message.type === 'shell:buffer') {
    const terminal = state.shells.get(message.sessionId)
    if (terminal && message.data) {
      // Hide loading overlay on first output
      const shellDiv = document.querySelector(`.shell-terminal[data-shell-id="${message.sessionId}"]`)
      const loading = shellDiv?.querySelector('.terminal-loading')
      if (loading) {
        loading.remove()
      }
      terminal.write(message.data)
    }
  }
}

/**
 * Resubscribe all shells after reconnection
 */
export function resubscribeShells(): void {
  if (!state.client) return

  for (const shellId of state.shells.keys()) {
    state.client.sendRaw({
      type: 'shell:subscribe',
      sessionId: shellId,
      cwd: state.serverCwd !== '~' ? state.serverCwd : undefined,
    })
  }
}
