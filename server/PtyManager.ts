/**
 * PTY Manager - manages pseudo-terminal sessions for Claude Code
 *
 * Runs Claude inside tmux for persistence, with a PTY attached to tmux
 * for streaming the terminal output to the browser via WebSocket.
 *
 * Architecture:
 *   Browser <-> WebSocket <-> PTY <-> tmux attach <-> tmux session <-> Claude
 *
 * Benefits:
 * - Claude survives server restart (tmux persistence)
 * - Browser gets real terminal rendering (via PTY)
 * - Can reconnect to existing session
 * - Can also attach from native terminal
 */

import * as pty from 'node-pty'
import type { IPty } from 'node-pty'
import type { WebSocket } from 'ws'
import { execSync } from 'child_process'

export interface PtySession {
  id: string
  tmuxSession: string  // The tmux session name
  pty: IPty | null     // PTY attached to tmux (null if not attached)
  clients: Set<WebSocket>
  buffer: string[]     // Store recent output for new clients
}

const MAX_BUFFER_LINES = 1000

export class PtyManager {
  private sessions: Map<string, PtySession> = new Map()

  /**
   * Create a new tmux session running Claude Code
   * Returns the session but doesn't attach PTY yet - call attach() to stream
   */
  create(
    sessionId: string,
    cwd: string,
    claudeArgs: string[] = [],
    tmuxSessionName?: string
  ): PtySession {
    const tmuxSession = tmuxSessionName || `vc-${sessionId.slice(0, 8)}`

    // Build the claude command
    const claudeCmd = claudeArgs.length > 0
      ? `claude ${claudeArgs.join(' ')}`
      : 'claude'

    // Extended PATH for finding claude
    const extPath = `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`

    // Create tmux session with Claude (detached)
    try {
      execSync(
        `tmux new-session -d -s "${tmuxSession}" -c "${cwd}" "PATH=${extPath} ${claudeCmd}"`,
        { stdio: 'pipe' }
      )
    } catch (e) {
      throw new Error(`Failed to create tmux session: ${(e as Error).message}`)
    }

    const session: PtySession = {
      id: sessionId,
      tmuxSession,
      pty: null,
      clients: new Set(),
      buffer: [],
    }

    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * Attach a PTY to an existing tmux session for browser streaming
   */
  attach(sessionId: string): PtySession | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    // Already attached
    if (session.pty) return session

    // Build environment
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    }

    // Spawn PTY that attaches to the tmux session
    const shell = process.env.SHELL || '/bin/zsh'
    const ptyProcess = pty.spawn(shell, ['-l', '-c', `tmux attach -t "${session.tmuxSession}"`], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: process.env.HOME || '/',
      env,
    })

    session.pty = ptyProcess

    // Buffer output for replay to new clients
    ptyProcess.onData((data) => {
      session.buffer.push(data)
      if (session.buffer.length > MAX_BUFFER_LINES) {
        session.buffer.shift()
      }

      // Broadcast to all connected clients
      for (const client of session.clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify({
            type: 'pty:output',
            sessionId,
            data,
          }))
        }
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      // PTY detached (user detached or tmux session ended)
      session.pty = null

      // Notify clients
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'pty:detached',
            sessionId,
            exitCode,
          }))
        }
      }

      // Check if tmux session still exists
      try {
        execSync(`tmux has-session -t "${session.tmuxSession}"`, { stdio: 'pipe' })
        // Session still exists, can re-attach
      } catch {
        // tmux session is gone, clean up
        this.sessions.delete(sessionId)
        for (const client of session.clients) {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'pty:exit',
              sessionId,
              exitCode,
            }))
          }
        }
      }
    })

    return session
  }

  /**
   * Detach PTY from tmux session (keeps tmux running)
   */
  detach(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (!session?.pty) return

    // Send tmux detach command
    session.pty.write('\x02d') // Ctrl+B, d (tmux detach)
  }

  /**
   * Get a PTY session by ID
   */
  get(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId)
  }

  /**
   * Subscribe a WebSocket client to a PTY session's output
   * Automatically attaches to tmux if not already attached
   */
  subscribe(sessionId: string, ws: WebSocket): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    // Auto-attach if not attached
    if (!session.pty) {
      const attached = this.attach(sessionId)
      if (!attached) return false
    }

    session.clients.add(ws)

    // Send buffered output so client sees history
    if (session.buffer.length > 0) {
      ws.send(JSON.stringify({
        type: 'pty:buffer',
        sessionId,
        data: session.buffer.join(''),
      }))
    }

    return true
  }

  /**
   * Unsubscribe a WebSocket client from a PTY session
   */
  unsubscribe(sessionId: string, ws: WebSocket): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.clients.delete(ws)

      // Auto-detach if no clients left (optional - keeps resources free)
      // Uncomment if you want to auto-detach when browser closes:
      // if (session.clients.size === 0 && session.pty) {
      //   this.detach(sessionId)
      // }
    }
  }

  /**
   * Unsubscribe a WebSocket client from ALL sessions
   */
  unsubscribeAll(ws: WebSocket): void {
    for (const session of this.sessions.values()) {
      session.clients.delete(ws)
    }
  }

  /**
   * Write input to a PTY session
   */
  write(sessionId: string, data: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session?.pty) return false

    session.pty.write(data)
    return true
  }

  /**
   * Resize a PTY session
   */
  resize(sessionId: string, cols: number, rows: number): boolean {
    const session = this.sessions.get(sessionId)
    if (!session?.pty) return false

    session.pty.resize(cols, rows)
    return true
  }

  /**
   * Kill the tmux session entirely
   */
  kill(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    try {
      execSync(`tmux kill-session -t "${session.tmuxSession}"`, { stdio: 'pipe' })
    } catch {
      // Session might already be gone
    }

    if (session.pty) {
      session.pty.kill()
    }

    this.sessions.delete(sessionId)
    return true
  }

  /**
   * Check if a session exists and tmux is alive
   */
  isAlive(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    try {
      execSync(`tmux has-session -t "${session.tmuxSession}"`, { stdio: 'pipe' })
      return true
    } catch {
      return false
    }
  }

  /**
   * Register an existing tmux session (for reconnecting after server restart)
   */
  register(sessionId: string, tmuxSession: string): PtySession {
    const session: PtySession = {
      id: sessionId,
      tmuxSession,
      pty: null,
      clients: new Set(),
      buffer: [],
    }
    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * Get all active session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys())
  }

  /**
   * Get tmux session name for a managed session
   */
  getTmuxSession(sessionId: string): string | undefined {
    return this.sessions.get(sessionId)?.tmuxSession
  }

  /**
   * Create a standalone shell session (not attached to tmux/Claude)
   * Useful for general terminal access
   */
  createShell(sessionId: string, cwd?: string): PtySession {
    // If session already exists, return it
    const existing = this.sessions.get(sessionId)
    if (existing) return existing

    // Build environment
    const env = {
      ...process.env,
      PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    }

    // Spawn a regular shell PTY (not through tmux)
    const shell = process.env.SHELL || '/bin/zsh'
    const ptyProcess = pty.spawn(shell, ['-l'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: cwd || process.env.HOME || '/',
      env,
    })

    const session: PtySession = {
      id: sessionId,
      tmuxSession: '__shell__', // Special marker for standalone shells
      pty: ptyProcess,
      clients: new Set(),
      buffer: [],
    }

    // Buffer output for replay to new clients
    ptyProcess.onData((data) => {
      session.buffer.push(data)
      if (session.buffer.length > MAX_BUFFER_LINES) {
        session.buffer.shift()
      }

      // Broadcast to all connected clients
      for (const client of session.clients) {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify({
            type: 'pty:output',
            sessionId,
            data,
          }))
        }
      }
    })

    ptyProcess.onExit(({ exitCode }) => {
      session.pty = null
      this.sessions.delete(sessionId)

      // Notify clients
      for (const client of session.clients) {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            type: 'pty:exit',
            sessionId,
            exitCode,
          }))
        }
      }
    })

    this.sessions.set(sessionId, session)
    return session
  }

  /**
   * Subscribe to a shell session (creates if not exists)
   */
  subscribeShell(sessionId: string, ws: WebSocket, cwd?: string): boolean {
    let session = this.sessions.get(sessionId)

    // Create shell session if it doesn't exist
    if (!session) {
      session = this.createShell(sessionId, cwd)
    }

    session.clients.add(ws)

    // Send buffered output so client sees history
    if (session.buffer.length > 0) {
      ws.send(JSON.stringify({
        type: 'pty:buffer',
        sessionId,
        data: session.buffer.join(''),
      }))
    }

    return true
  }

  /**
   * List all standalone shell sessions
   */
  listShells(): { id: string; cwd: string }[] {
    const shells: { id: string; cwd: string }[] = []
    for (const [id, session] of this.sessions) {
      // Only include standalone shells (not Claude sessions)
      if (session.tmuxSession === '__shell__') {
        shells.push({
          id,
          cwd: process.env.HOME || '/', // Could track actual cwd if needed
        })
      }
    }
    return shells
  }

  /**
   * Close a shell session
   */
  closeShell(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || session.tmuxSession !== '__shell__') {
      return false
    }

    // Kill the PTY process
    if (session.pty) {
      session.pty.kill()
    }

    // Notify clients
    for (const client of session.clients) {
      if (client.readyState === 1) {
        client.send(JSON.stringify({
          type: 'pty:exit',
          sessionId,
          exitCode: 0,
        }))
      }
    }

    this.sessions.delete(sessionId)
    return true
  }
}

// Singleton instance
export const ptyManager = new PtyManager()
