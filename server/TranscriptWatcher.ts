/**
 * TranscriptWatcher - Watches Claude Code transcript files for real-time content
 *
 * Claude Code writes a transcript JSONL file with all conversation turns.
 * This watcher monitors those files and broadcasts new content over WebSocket.
 */

import { watch, type FSWatcher } from 'chokidar'
import { readFileSync, statSync, existsSync } from 'fs'
import { EventEmitter } from 'events'
import type { TranscriptContent } from '../shared/types'

// ============================================================================
// Types
// ============================================================================

interface TranscriptEntry {
  type: 'user' | 'assistant' | 'system'
  message: {
    content: Array<{
      type: 'text' | 'tool_use' | 'tool_result' | 'thinking'
      text?: string
      thinking?: string
      name?: string
      id?: string
      input?: Record<string, unknown>
      content?: string
    }>
  }
  timestamp?: string
}

interface WatcherState {
  watcher: FSWatcher
  path: string
  lastLineCount: number
  sessionId: string
}

// ============================================================================
// TranscriptWatcher
// ============================================================================

export class TranscriptWatcher extends EventEmitter {
  private watchers = new Map<string, WatcherState>()
  private debug: boolean

  constructor(options: { debug?: boolean } = {}) {
    super()
    this.debug = options.debug ?? false
  }

  /**
   * Start watching a transcript file for a session
   */
  watch(sessionId: string, transcriptPath: string): void {
    // Validate path
    if (!transcriptPath || !existsSync(transcriptPath)) {
      if (this.debug) {
        console.log(`[TranscriptWatcher] Path doesn't exist: ${transcriptPath}`)
      }
      return
    }

    // Don't double-watch
    if (this.watchers.has(sessionId)) {
      const existing = this.watchers.get(sessionId)!
      if (existing.path === transcriptPath) {
        if (this.debug) {
          console.log(`[TranscriptWatcher] Already watching ${sessionId}`)
        }
        return
      }
      this.unwatch(sessionId)
    }

    if (this.debug) {
      console.log(`[TranscriptWatcher] Watching ${transcriptPath} for session ${sessionId}`)
    }

    // Count existing lines to only process new ones
    const lastLineCount = this.countLines(transcriptPath)

    const watcher = watch(transcriptPath, {
      persistent: true,
      usePolling: true,  // More reliable for files being actively written
      interval: 200,     // Check every 200ms
      binaryInterval: 200,
    })

    const state: WatcherState = {
      watcher,
      path: transcriptPath,
      lastLineCount,
      sessionId,
    }

    this.watchers.set(sessionId, state)

    watcher.on('change', () => {
      this.onFileChange(sessionId)
    })

    watcher.on('error', (error) => {
      console.error(`[TranscriptWatcher] Error watching ${transcriptPath}:`, error)
    })
  }

  /**
   * Stop watching a session's transcript
   */
  unwatch(sessionId: string): void {
    const state = this.watchers.get(sessionId)
    if (state) {
      state.watcher.close()
      this.watchers.delete(sessionId)
      if (this.debug) {
        console.log(`[TranscriptWatcher] Stopped watching session ${sessionId}`)
      }
    }
  }

  /**
   * Check if a session is being watched
   */
  isWatching(sessionId: string): boolean {
    return this.watchers.has(sessionId)
  }

  /**
   * Get all watched session IDs
   */
  getWatchedSessions(): string[] {
    return Array.from(this.watchers.keys())
  }

  /**
   * Stop all watchers
   */
  close(): void {
    for (const sessionId of this.watchers.keys()) {
      this.unwatch(sessionId)
    }
  }

  // ===========================================================================
  // Private Methods
  // ===========================================================================

  private countLines(path: string): number {
    try {
      const content = readFileSync(path, 'utf-8')
      return content.split('\n').filter(line => line.trim()).length
    } catch {
      return 0
    }
  }

  private readLines(path: string): string[] {
    try {
      const content = readFileSync(path, 'utf-8')
      return content.split('\n').filter(line => line.trim())
    } catch {
      return []
    }
  }

  private onFileChange(sessionId: string): void {
    const state = this.watchers.get(sessionId)
    if (!state) return

    const lines = this.readLines(state.path)
    const newLines = lines.slice(state.lastLineCount)
    state.lastLineCount = lines.length

    if (this.debug && newLines.length > 0) {
      console.log(`[TranscriptWatcher] ${newLines.length} new lines for ${sessionId}`)
    }

    for (const line of newLines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry
        this.processEntry(sessionId, entry)
      } catch (e) {
        // Partial line or invalid JSON - skip
        if (this.debug) {
          console.log(`[TranscriptWatcher] Skipping invalid line: ${line.slice(0, 50)}...`)
        }
      }
    }
  }

  private processEntry(sessionId: string, entry: TranscriptEntry): void {
    // Only process assistant messages (that's Claude's output)
    if (entry.type !== 'assistant') return

    const timestamp = entry.timestamp
      ? new Date(entry.timestamp).getTime()
      : Date.now()

    for (const block of entry.message.content) {
      let parsed: TranscriptContent | null = null

      switch (block.type) {
        case 'text':
          if (block.text) {
            parsed = {
              sessionId,
              type: 'text',
              content: block.text,
              timestamp,
            }
          }
          break

        case 'tool_use':
          parsed = {
            sessionId,
            type: 'tool_use',
            content: block.name || 'unknown',
            metadata: {
              id: block.id,
              input: block.input,
            },
            timestamp,
          }
          break

        case 'tool_result':
          parsed = {
            sessionId,
            type: 'tool_result',
            content: block.content || '',
            metadata: {
              id: block.id,
            },
            timestamp,
          }
          break

        case 'thinking':
          if (block.thinking) {
            parsed = {
              sessionId,
              type: 'thinking',
              content: block.thinking,
              timestamp,
            }
          }
          break
      }

      if (parsed) {
        this.emit('content', parsed)
      }
    }
  }
}
