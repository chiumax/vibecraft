/**
 * Terminal UI component using xterm.js
 *
 * Displays a PTY terminal session in the browser, streaming
 * output from and input to the server via WebSocket.
 */

import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

export interface TerminalOptions {
  container: HTMLElement
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
}

export class TerminalUI {
  private terminal: Terminal
  private fitAddon: FitAddon
  private container: HTMLElement
  private resizeObserver: ResizeObserver | null = null

  constructor(options: TerminalOptions) {
    this.container = options.container

    // Detect mobile for adjusted settings
    const isMobile = window.matchMedia('(max-width: 1023px)').matches

    // Create terminal with dark theme and mobile-optimized settings
    this.terminal = new Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#60a5fa',
        cursorAccent: '#0f172a',
        selectionBackground: '#334155',
        black: '#1e293b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f1f5f9',
        brightBlack: '#475569',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#facc15',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      // Use system monospace on mobile for better rendering
      fontFamily: isMobile
        ? 'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Mono", monospace'
        : '"JetBrains Mono", "Fira Code", "SF Mono", Menlo, monospace',
      fontSize: isMobile ? 14 : 13,  // Slightly larger on mobile
      lineHeight: 1.2,
      letterSpacing: 0,  // Prevent letter spacing issues
      cursorBlink: true,
      cursorStyle: 'block',
      scrollback: 5000,
      allowProposedApi: true,
      // Mobile-specific optimizations
      smoothScrollDuration: isMobile ? 0 : 125,  // Disable smooth scroll on mobile
      macOptionIsMeta: true,
      convertEol: true,  // Handle line endings consistently
    })

    // Load fit addon for auto-resizing
    this.fitAddon = new FitAddon()
    this.terminal.loadAddon(this.fitAddon)

    // Open terminal in container
    this.terminal.open(this.container)
    this.fitAddon.fit()

    // Handle user input
    if (options.onData) {
      this.terminal.onData(options.onData)
    }

    // Handle resize
    if (options.onResize) {
      this.terminal.onResize(({ cols, rows }) => {
        options.onResize!(cols, rows)
      })
    }

    // Auto-resize when container changes
    this.resizeObserver = new ResizeObserver(() => {
      this.fit()
    })
    this.resizeObserver.observe(this.container)
  }

  /**
   * Write data to the terminal (from server)
   */
  write(data: string): void {
    this.terminal.write(data)
  }

  /**
   * Clear the terminal
   */
  clear(): void {
    this.terminal.clear()
  }

  /**
   * Fit terminal to container size
   * Uses multiple attempts to handle timing issues when container is being resized
   */
  fit(): void {
    // Immediate fit
    this.doFit()

    // Delayed fits to catch container size settling
    requestAnimationFrame(() => this.doFit())
    setTimeout(() => this.doFit(), 50)
    setTimeout(() => this.doFit(), 150)
  }

  /**
   * Internal fit method
   */
  private doFit(): void {
    try {
      this.fitAddon.fit()
    } catch {
      // Ignore errors during resize
    }
  }

  /**
   * Get current terminal dimensions
   */
  getDimensions(): { cols: number; rows: number } {
    return {
      cols: this.terminal.cols,
      rows: this.terminal.rows,
    }
  }

  /**
   * Focus the terminal
   */
  focus(): void {
    this.terminal.focus()
  }

  /**
   * Dispose of the terminal
   */
  dispose(): void {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }
    this.terminal.dispose()
  }
}

interface SendFunction {
  (message: Record<string, unknown>): void
}

/**
 * Manager for session terminals
 */
export class TerminalManager {
  private terminals: Map<string, TerminalUI> = new Map()
  private activeSessionId: string | null = null
  private sendFn: SendFunction | null = null
  private container: HTMLElement

  constructor(container: HTMLElement) {
    this.container = container
  }

  /**
   * Set the send function for terminal I/O (from EventClient.sendRaw)
   */
  setSendFunction(fn: SendFunction): void {
    this.sendFn = fn
  }

  /**
   * Create or get terminal for a session
   */
  getOrCreate(sessionId: string): TerminalUI {
    let terminal = this.terminals.get(sessionId)
    if (!terminal) {
      // Create terminal wrapper
      const wrapper = document.createElement('div')
      wrapper.className = 'terminal-wrapper'
      wrapper.dataset.sessionId = sessionId
      wrapper.style.display = 'none'
      this.container.appendChild(wrapper)

      // Add loading overlay
      const loading = document.createElement('div')
      loading.className = 'terminal-loading'
      loading.innerHTML = `
        <div class="terminal-loading-spinner"></div>
        <div class="terminal-loading-text">Connecting to terminal...</div>
      `
      wrapper.appendChild(loading)

      terminal = new TerminalUI({
        container: wrapper,
        onData: (data) => {
          // Send input to server
          if (this.sendFn) {
            this.sendFn({
              type: 'pty:input',
              sessionId,
              data,
            })
          }
        },
        onResize: (cols, rows) => {
          // Notify server of resize
          if (this.sendFn) {
            this.sendFn({
              type: 'pty:resize',
              sessionId,
              cols,
              rows,
            })
          }
        },
      })

      this.terminals.set(sessionId, terminal)

      // Subscribe to PTY output
      if (this.sendFn) {
        this.sendFn({
          type: 'pty:subscribe',
          sessionId,
        })
      }
    }
    return terminal
  }

  /**
   * Show terminal for a specific session
   */
  show(sessionId: string): void {
    // Hide all terminals
    for (const [id, terminal] of this.terminals) {
      const wrapper = this.container.querySelector(`[data-session-id="${id}"]`) as HTMLElement
      if (wrapper) {
        wrapper.style.display = id === sessionId ? 'block' : 'none'
      }
      if (id === sessionId) {
        terminal.fit()
        terminal.focus()
      }
    }
    this.activeSessionId = sessionId
  }

  /**
   * Hide all terminals
   */
  hideAll(): void {
    for (const [id] of this.terminals) {
      const wrapper = this.container.querySelector(`[data-session-id="${id}"]`) as HTMLElement
      if (wrapper) {
        wrapper.style.display = 'none'
      }
    }
    this.activeSessionId = null
  }

  /**
   * Refit the currently active terminal
   * Call this when visibility changes or when returning from another device
   */
  refitActive(): void {
    if (this.activeSessionId) {
      const terminal = this.terminals.get(this.activeSessionId)
      if (terminal) {
        terminal.fit()
      }
    }
  }

  /**
   * Handle incoming PTY message
   */
  handleMessage(message: { type: string; sessionId: string; data?: string; exitCode?: number }): void {
    if (message.type === 'pty:output' || message.type === 'pty:buffer') {
      const terminal = this.terminals.get(message.sessionId)
      if (terminal) {
        // Hide loading overlay on first message (even if empty - confirms subscription succeeded)
        const wrapper = this.container.querySelector(`[data-session-id="${message.sessionId}"]`)
        const loading = wrapper?.querySelector('.terminal-loading')
        if (loading) {
          loading.remove()
        }
        // Write data if present
        if (message.data) {
          terminal.write(message.data)
        }
      }
    } else if (message.type === 'pty:detached') {
      // PTY detached but tmux session still alive - can reattach
      const terminal = this.terminals.get(message.sessionId)
      if (terminal) {
        terminal.write(`\r\n\x1b[93m[Detached from tmux - tmux session still running]\x1b[0m\r\n`)
        terminal.write(`\x1b[90m[Press any key to reattach...]\x1b[0m\r\n`)
      }
    } else if (message.type === 'pty:exit') {
      // tmux session ended entirely
      const terminal = this.terminals.get(message.sessionId)
      if (terminal) {
        terminal.write(`\r\n\x1b[90m[Session ended with code ${message.exitCode}]\x1b[0m\r\n`)
      }
    }
  }

  /**
   * Remove terminal for a session
   */
  remove(sessionId: string): void {
    const terminal = this.terminals.get(sessionId)
    if (terminal) {
      terminal.dispose()
      this.terminals.delete(sessionId)

      const wrapper = this.container.querySelector(`[data-session-id="${sessionId}"]`)
      if (wrapper) {
        wrapper.remove()
      }

      // Unsubscribe from PTY
      if (this.sendFn) {
        this.sendFn({
          type: 'pty:unsubscribe',
          sessionId,
        })
      }
    }
  }

  /**
   * Get active session ID
   */
  getActiveSessionId(): string | null {
    return this.activeSessionId
  }

  /**
   * Resubscribe all terminals to PTY sessions after WebSocket reconnection
   */
  resubscribeAll(): void {
    if (!this.sendFn) return

    for (const sessionId of this.terminals.keys()) {
      this.sendFn({
        type: 'pty:subscribe',
        sessionId,
      })
    }
  }

  /**
   * Dispose of all terminals
   */
  dispose(): void {
    for (const terminal of this.terminals.values()) {
      terminal.dispose()
    }
    this.terminals.clear()
    this.activeSessionId = null
  }
}
