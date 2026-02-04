/**
 * ContextTracker - Tracks which context files Claude has read
 *
 * Monitors Read tool events and categorizes CLAUDE.md and related context files.
 * This helps users understand what context Claude has loaded for their session.
 */

import { basename, dirname, relative, sep } from 'path'
import type {
  SessionContext,
  ContextFileRead,
  ContextFileCategory,
  PreToolUseEvent,
  ReadToolInput,
} from '../shared/types.js'

/** Context file patterns to track */
const CONTEXT_PATTERNS = {
  /** CLAUDE.md files - project instructions */
  claudeMd: /CLAUDE\.md$/i,
  /** Files in .claude/ directory */
  claudeDir: /[/\\]\.claude[/\\]/,
  /** Documentation files */
  docs: /[/\\]docs?[/\\].*\.md$/i,
  /** README files */
  readme: /README\.md$/i,
}

/**
 * Determine the category of a context file based on its path
 */
function categorizeFile(filePath: string, cwd: string): ContextFileCategory | null {
  const normalizedPath = filePath.replace(/\\/g, '/')
  const normalizedCwd = cwd.replace(/\\/g, '/')

  // Check for CLAUDE.md
  if (CONTEXT_PATTERNS.claudeMd.test(normalizedPath)) {
    const fileDir = dirname(normalizedPath)

    // Is it in the project root?
    if (fileDir === normalizedCwd || fileDir === normalizedCwd + '/') {
      return 'project'
    }

    // Is it in a parent directory?
    if (normalizedCwd.startsWith(fileDir + '/')) {
      return 'parent'
    }

    // Is it in a subdirectory?
    if (fileDir.startsWith(normalizedCwd + '/')) {
      return 'local'
    }

    // Default to local if relative
    return 'local'
  }

  // Check for .claude/ directory files
  if (CONTEXT_PATTERNS.claudeDir.test(normalizedPath)) {
    return 'rules'
  }

  // Check for docs/
  if (CONTEXT_PATTERNS.docs.test(normalizedPath)) {
    return 'docs'
  }

  // Not a context file
  return null
}

/**
 * Check if a file path is a context file we should track
 */
export function isContextFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/')
  return (
    CONTEXT_PATTERNS.claudeMd.test(normalizedPath) ||
    CONTEXT_PATTERNS.claudeDir.test(normalizedPath) ||
    CONTEXT_PATTERNS.docs.test(normalizedPath)
  )
}

/**
 * ContextTracker manages context file tracking for all sessions
 */
export class ContextTracker {
  /** Context state per session (keyed by managed session ID) */
  private contexts = new Map<string, SessionContext>()

  /** Callback when context changes */
  private onContextChange?: (sessionId: string, context: SessionContext) => void

  constructor(options?: {
    onContextChange?: (sessionId: string, context: SessionContext) => void
  }) {
    this.onContextChange = options?.onContextChange
  }

  /**
   * Initialize tracking for a session
   */
  initSession(sessionId: string, cwd: string): void {
    if (!this.contexts.has(sessionId)) {
      this.contexts.set(sessionId, {
        contextFiles: [],
        projectContextLoaded: false,
        cwd,
      })
    } else {
      // Update cwd if session exists
      const context = this.contexts.get(sessionId)!
      context.cwd = cwd
    }
  }

  /**
   * Track a file read event
   */
  trackFileRead(sessionId: string, filePath: string, cwd: string): void {
    // Initialize if needed
    if (!this.contexts.has(sessionId)) {
      this.initSession(sessionId, cwd)
    }

    const context = this.contexts.get(sessionId)!

    // Update cwd if it changed
    if (cwd && cwd !== context.cwd) {
      context.cwd = cwd
    }

    // Categorize the file
    const category = categorizeFile(filePath, context.cwd)
    if (!category) {
      // Not a context file
      return
    }

    // Find existing entry or create new one
    const existing = context.contextFiles.find((f) => f.path === filePath)
    if (existing) {
      existing.readCount++
    } else {
      context.contextFiles.push({
        path: filePath,
        category,
        firstReadAt: Date.now(),
        readCount: 1,
      })
    }

    // Check if this confirms project context loaded
    if (category === 'project' && !context.projectContextLoaded) {
      context.projectContextLoaded = true
    }

    // Notify listeners
    this.onContextChange?.(sessionId, context)
  }

  /**
   * Process a pre_tool_use event (filters for Read tool)
   */
  processEvent(event: PreToolUseEvent, managedSessionId: string): void {
    if (event.tool !== 'Read') {
      return
    }

    const input = event.toolInput as unknown as ReadToolInput
    if (!input.file_path) {
      return
    }

    this.trackFileRead(managedSessionId, input.file_path, event.cwd)
  }

  /**
   * Get context for a session
   */
  getContext(sessionId: string): SessionContext | undefined {
    return this.contexts.get(sessionId)
  }

  /**
   * Get context status indicator for UI
   * Returns: 'none' | 'partial' | 'loaded'
   */
  getContextStatus(sessionId: string): 'none' | 'partial' | 'loaded' {
    const context = this.contexts.get(sessionId)
    if (!context) {
      return 'none'
    }

    if (context.projectContextLoaded) {
      return 'loaded'
    }

    if (context.contextFiles.length > 0) {
      return 'partial'
    }

    return 'none'
  }

  /**
   * Clear context for a session (e.g., on session restart)
   */
  clearSession(sessionId: string): void {
    this.contexts.delete(sessionId)
  }

  /**
   * Get all sessions with context tracking
   */
  getAllSessions(): Map<string, SessionContext> {
    return new Map(this.contexts)
  }

  /**
   * Serialize context for persistence
   */
  serialize(): Record<string, SessionContext> {
    const result: Record<string, SessionContext> = {}
    for (const [id, context] of this.contexts) {
      result[id] = context
    }
    return result
  }

  /**
   * Load context from serialized data
   */
  load(data: Record<string, SessionContext>): void {
    this.contexts.clear()
    for (const [id, context] of Object.entries(data)) {
      this.contexts.set(id, context)
    }
  }
}

/**
 * Create a singleton context tracker instance
 */
export const contextTracker = new ContextTracker()
