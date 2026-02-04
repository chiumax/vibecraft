/**
 * SessionStatsManager - Tracks session statistics and achievements
 *
 * Persists data to ~/.vibecraft/data/session-stats.json
 * Tracks tool usage, prompts, outcomes, and unlocks achievements.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname } from 'path'
import type {
  SessionStats,
  SessionStatsFile,
  PromptRecord,
  ToolStats,
  Achievement,
  PreToolUseEvent,
  PostToolUseEvent,
} from '../shared/types.js'

// ============================================================================
// Achievement Definitions
// ============================================================================

export const ACHIEVEMENTS: Achievement[] = [
  // Tool achievements
  { id: 'first_tool', name: 'First Steps', description: 'Use your first tool', icon: '🔧', category: 'tools' },
  { id: 'tool_10', name: 'Getting Handy', description: 'Use 10 tools', icon: '🛠️', category: 'tools', threshold: 10 },
  { id: 'tool_100', name: 'Tool Time', description: 'Use 100 tools', icon: '⚙️', category: 'tools', threshold: 100 },
  { id: 'tool_1000', name: 'Master Craftsman', description: 'Use 1,000 tools', icon: '🏆', category: 'tools', threshold: 1000 },
  { id: 'all_tools', name: 'Swiss Army Knife', description: 'Use all tool types', icon: '🔪', category: 'tools' },
  { id: 'bash_master', name: 'Shell Wizard', description: 'Run 50 Bash commands', icon: '🐚', category: 'tools', threshold: 50 },
  { id: 'reader', name: 'Bookworm', description: 'Read 100 files', icon: '📚', category: 'tools', threshold: 100 },
  { id: 'editor', name: 'Code Surgeon', description: 'Make 50 edits', icon: '✂️', category: 'tools', threshold: 50 },

  // Prompt achievements
  { id: 'first_prompt', name: 'Hello Claude', description: 'Send your first prompt', icon: '👋', category: 'prompts' },
  { id: 'prompt_10', name: 'Conversationalist', description: 'Send 10 prompts', icon: '💬', category: 'prompts', threshold: 10 },
  { id: 'prompt_100', name: 'Prompt Engineer', description: 'Send 100 prompts', icon: '🎯', category: 'prompts', threshold: 100 },
  { id: 'streak_5', name: 'On a Roll', description: '5 successful prompts in a row', icon: '🔥', category: 'prompts', threshold: 5 },
  { id: 'streak_10', name: 'Unstoppable', description: '10 successful prompts in a row', icon: '⚡', category: 'prompts', threshold: 10 },
  { id: 'streak_25', name: 'Prompt Whisperer', description: '25 successful prompts in a row', icon: '🧙', category: 'prompts', threshold: 25 },

  // Git achievements
  { id: 'first_commit', name: 'First Blood', description: 'Make your first git commit', icon: '🩸', category: 'git' },
  { id: 'commit_10', name: 'Committer', description: 'Make 10 git commits', icon: '📝', category: 'git', threshold: 10 },
  { id: 'commit_50', name: 'Commit Champion', description: 'Make 50 git commits', icon: '🏅', category: 'git', threshold: 50 },
  { id: 'commit_100', name: 'Version Control Master', description: 'Make 100 git commits', icon: '👑', category: 'git', threshold: 100 },

  // Efficiency achievements
  { id: 'efficient_90', name: 'Efficient', description: '90% tool success rate (min 20 uses)', icon: '✅', category: 'efficiency' },
  { id: 'efficient_95', name: 'Highly Efficient', description: '95% tool success rate (min 50 uses)', icon: '💎', category: 'efficiency' },
  { id: 'no_errors', name: 'Flawless', description: 'Complete a session with no errors', icon: '✨', category: 'efficiency' },
  { id: 'speed_demon', name: 'Speed Demon', description: 'Average tool time under 500ms', icon: '⚡', category: 'efficiency' },

  // Milestone achievements
  { id: 'tokens_10k', name: 'Chatty', description: 'Use 10,000 tokens', icon: '🗣️', category: 'milestones', threshold: 10000 },
  { id: 'tokens_100k', name: 'Power User', description: 'Use 100,000 tokens', icon: '💪', category: 'milestones', threshold: 100000 },
  { id: 'tokens_1m', name: 'Token Titan', description: 'Use 1,000,000 tokens', icon: '🦾', category: 'milestones', threshold: 1000000 },
  { id: 'files_100', name: 'Explorer', description: 'Touch 100 unique files', icon: '🗺️', category: 'milestones', threshold: 100 },
  { id: 'sessions_5', name: 'Multi-tasker', description: 'Create 5 sessions', icon: '🎭', category: 'milestones', threshold: 5 },
  { id: 'sessions_10', name: 'Session Master', description: 'Create 10 sessions', icon: '🎪', category: 'milestones', threshold: 10 },
]

// ============================================================================
// SessionStatsManager Class
// ============================================================================

export class SessionStatsManager {
  private statsFile: string
  private data: SessionStatsFile
  private saveTimeout: NodeJS.Timeout | null = null
  private dirty = false

  // Track pending prompts (prompt -> stop matching)
  private pendingPrompts: Map<string, { promptId: string; startTime: number; toolUses: number; errors: number }> = new Map()

  constructor(statsFile: string) {
    this.statsFile = statsFile
    this.data = this.load()
  }

  // ============================================================================
  // Persistence
  // ============================================================================

  private load(): SessionStatsFile {
    if (!existsSync(this.statsFile)) {
      return this.createEmpty()
    }

    try {
      const content = readFileSync(this.statsFile, 'utf-8')
      const data = JSON.parse(content) as SessionStatsFile
      // Migration could go here if version changes
      return data
    } catch (e) {
      console.error('[SessionStats] Failed to load stats file:', e)
      return this.createEmpty()
    }
  }

  private createEmpty(): SessionStatsFile {
    return {
      version: 1,
      sessions: {},
      prompts: [],
      totals: {
        totalPrompts: 0,
        totalToolUses: 0,
        totalTokens: 0,
        totalCommits: 0,
        totalSessions: 0,
      },
      unlockedAchievements: [],
    }
  }

  private save(): void {
    try {
      // Ensure directory exists
      const dir = dirname(this.statsFile)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }

      writeFileSync(this.statsFile, JSON.stringify(this.data, null, 2))
      this.dirty = false
    } catch (e) {
      console.error('[SessionStats] Failed to save stats file:', e)
    }
  }

  /** Debounced save - prevents excessive writes */
  private scheduleSave(): void {
    this.dirty = true
    if (this.saveTimeout) return

    this.saveTimeout = setTimeout(() => {
      this.saveTimeout = null
      if (this.dirty) {
        this.save()
      }
    }, 5000) // Save at most every 5 seconds
  }

  /** Force save immediately */
  flush(): void {
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout)
      this.saveTimeout = null
    }
    if (this.dirty) {
      this.save()
    }
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  private getOrCreateSession(sessionId: string, sessionName?: string): SessionStats {
    if (!this.data.sessions[sessionId]) {
      this.data.sessions[sessionId] = {
        sessionId,
        sessionName: sessionName || sessionId,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        totalPrompts: 0,
        toolUsage: {},
        totalTokens: 0,
        filesTouched: [],
        gitCommits: 0,
        workingTime: 0,
        totalErrors: 0,
        totalSuccesses: 0,
        achievements: [],
        currentStreak: 0,
        bestStreak: 0,
      }
      this.data.totals.totalSessions++
      this.checkAchievements()
    }
    return this.data.sessions[sessionId]
  }

  updateSessionName(sessionId: string, name: string): void {
    const session = this.data.sessions[sessionId]
    if (session) {
      session.sessionName = name
      this.scheduleSave()
    }
  }

  // ============================================================================
  // Event Tracking
  // ============================================================================

  /** Track a user prompt */
  trackPrompt(sessionId: string, promptText: string, sessionName?: string): string {
    const session = this.getOrCreateSession(sessionId, sessionName)
    const promptId = `prompt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    const prompt: PromptRecord = {
      id: promptId,
      text: promptText.slice(0, 1000), // Limit stored text
      timestamp: Date.now(),
      sessionId,
      outcome: 'pending',
      toolUses: 0,
      errors: 0,
    }

    this.data.prompts.push(prompt)
    session.totalPrompts++
    session.lastSeen = Date.now()
    this.data.totals.totalPrompts++

    // Track pending prompt for outcome matching
    this.pendingPrompts.set(sessionId, {
      promptId,
      startTime: Date.now(),
      toolUses: 0,
      errors: 0,
    })

    this.checkAchievements()
    this.scheduleSave()

    return promptId
  }

  /** Track tool use start */
  trackToolStart(event: PreToolUseEvent, sessionName?: string): void {
    const session = this.getOrCreateSession(event.sessionId, sessionName)
    session.lastSeen = Date.now()

    // Initialize tool stats if needed
    if (!session.toolUsage[event.tool]) {
      session.toolUsage[event.tool] = {
        count: 0,
        successes: 0,
        failures: 0,
        totalDuration: 0,
      }
    }

    session.toolUsage[event.tool].count++
    this.data.totals.totalToolUses++

    // Track file if it's a file operation
    const filePath = this.extractFilePath(event)
    if (filePath && !session.filesTouched.includes(filePath)) {
      session.filesTouched.push(filePath)
    }

    // Update pending prompt
    const pending = this.pendingPrompts.get(event.sessionId)
    if (pending) {
      pending.toolUses++
    }

    this.scheduleSave()
  }

  /** Track tool use completion */
  trackToolEnd(event: PostToolUseEvent, sessionName?: string): void {
    const session = this.getOrCreateSession(event.sessionId, sessionName)
    session.lastSeen = Date.now()

    const toolStats = session.toolUsage[event.tool]
    if (toolStats) {
      if (event.success) {
        toolStats.successes++
        session.totalSuccesses++
      } else {
        toolStats.failures++
        session.totalErrors++

        // Update pending prompt errors
        const pending = this.pendingPrompts.get(event.sessionId)
        if (pending) {
          pending.errors++
        }
      }

      if (event.duration) {
        toolStats.totalDuration += event.duration
      }
    }

    // Check for git commit
    if (event.tool === 'Bash' && event.success) {
      const command = (event.toolInput as any)?.command || ''
      if (command.includes('git commit')) {
        session.gitCommits++
        this.data.totals.totalCommits++

        // Mark pending prompt as having committed
        const pending = this.pendingPrompts.get(event.sessionId)
        if (pending) {
          const prompt = this.data.prompts.find(p => p.id === pending.promptId)
          if (prompt) {
            prompt.committedCode = true
          }
        }
      }
    }

    this.checkAchievements()
    this.scheduleSave()
  }

  /** Track session stop (Claude finished) */
  trackStop(sessionId: string, success: boolean): void {
    const session = this.data.sessions[sessionId]
    if (!session) return

    const pending = this.pendingPrompts.get(sessionId)
    if (pending) {
      const prompt = this.data.prompts.find(p => p.id === pending.promptId)
      if (prompt) {
        prompt.duration = Date.now() - pending.startTime
        prompt.toolUses = pending.toolUses
        prompt.errors = pending.errors
        prompt.outcome = pending.errors === 0 ? 'success' : 'error'
      }

      // Update streak
      if (pending.errors === 0) {
        session.currentStreak++
        if (session.currentStreak > session.bestStreak) {
          session.bestStreak = session.currentStreak
        }
      } else {
        session.currentStreak = 0
      }

      this.pendingPrompts.delete(sessionId)
    }

    this.checkAchievements()
    this.scheduleSave()
  }

  /** Track token usage */
  trackTokens(sessionId: string, tokens: number): void {
    const session = this.data.sessions[sessionId]
    if (session) {
      session.totalTokens = tokens
      this.data.totals.totalTokens = Object.values(this.data.sessions)
        .reduce((sum, s) => sum + s.totalTokens, 0)
      this.scheduleSave()
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private extractFilePath(event: PreToolUseEvent): string | null {
    const input = event.toolInput as any
    if (input?.file_path) return input.file_path
    if (input?.path) return input.path
    if (input?.filePath) return input.filePath
    return null
  }

  // ============================================================================
  // Achievements
  // ============================================================================

  private checkAchievements(): string[] {
    const newAchievements: string[] = []
    const totals = this.data.totals
    const sessions = Object.values(this.data.sessions)

    // Helper to unlock
    const unlock = (id: string) => {
      if (!this.data.unlockedAchievements.includes(id)) {
        this.data.unlockedAchievements.push(id)
        newAchievements.push(id)
        console.log(`[Achievement] Unlocked: ${ACHIEVEMENTS.find(a => a.id === id)?.name}`)
      }
    }

    // Tool achievements
    if (totals.totalToolUses >= 1) unlock('first_tool')
    if (totals.totalToolUses >= 10) unlock('tool_10')
    if (totals.totalToolUses >= 100) unlock('tool_100')
    if (totals.totalToolUses >= 1000) unlock('tool_1000')

    // Check for all tools used
    const allToolTypes = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'WebFetch', 'Task']
    const usedTools = new Set<string>()
    sessions.forEach(s => Object.keys(s.toolUsage).forEach(t => usedTools.add(t)))
    if (allToolTypes.every(t => usedTools.has(t))) unlock('all_tools')

    // Specific tool achievements
    const totalBash = sessions.reduce((sum, s) => sum + (s.toolUsage['Bash']?.count || 0), 0)
    const totalRead = sessions.reduce((sum, s) => sum + (s.toolUsage['Read']?.count || 0), 0)
    const totalEdit = sessions.reduce((sum, s) => sum + (s.toolUsage['Edit']?.count || 0), 0)
    if (totalBash >= 50) unlock('bash_master')
    if (totalRead >= 100) unlock('reader')
    if (totalEdit >= 50) unlock('editor')

    // Prompt achievements
    if (totals.totalPrompts >= 1) unlock('first_prompt')
    if (totals.totalPrompts >= 10) unlock('prompt_10')
    if (totals.totalPrompts >= 100) unlock('prompt_100')

    // Streak achievements
    const bestStreak = Math.max(...sessions.map(s => s.bestStreak), 0)
    if (bestStreak >= 5) unlock('streak_5')
    if (bestStreak >= 10) unlock('streak_10')
    if (bestStreak >= 25) unlock('streak_25')

    // Git achievements
    if (totals.totalCommits >= 1) unlock('first_commit')
    if (totals.totalCommits >= 10) unlock('commit_10')
    if (totals.totalCommits >= 50) unlock('commit_50')
    if (totals.totalCommits >= 100) unlock('commit_100')

    // Efficiency achievements
    const totalSuccesses = sessions.reduce((sum, s) => sum + s.totalSuccesses, 0)
    const totalToolUses = totals.totalToolUses
    if (totalToolUses >= 20) {
      const successRate = totalSuccesses / totalToolUses
      if (successRate >= 0.90) unlock('efficient_90')
      if (totalToolUses >= 50 && successRate >= 0.95) unlock('efficient_95')
    }

    // Token achievements
    if (totals.totalTokens >= 10000) unlock('tokens_10k')
    if (totals.totalTokens >= 100000) unlock('tokens_100k')
    if (totals.totalTokens >= 1000000) unlock('tokens_1m')

    // Files achievement
    const totalFiles = new Set(sessions.flatMap(s => s.filesTouched)).size
    if (totalFiles >= 100) unlock('files_100')

    // Session achievements
    if (totals.totalSessions >= 5) unlock('sessions_5')
    if (totals.totalSessions >= 10) unlock('sessions_10')

    return newAchievements
  }

  // ============================================================================
  // Getters
  // ============================================================================

  getSessionStats(sessionId: string): SessionStats | null {
    return this.data.sessions[sessionId] || null
  }

  getAllStats(): SessionStatsFile {
    return this.data
  }

  getAchievements(): { unlocked: Achievement[]; locked: Achievement[] } {
    const unlocked = ACHIEVEMENTS.filter(a => this.data.unlockedAchievements.includes(a.id))
    const locked = ACHIEVEMENTS.filter(a => !this.data.unlockedAchievements.includes(a.id) && !a.hidden)
    return { unlocked, locked }
  }

  getRecentPrompts(limit = 50): PromptRecord[] {
    return this.data.prompts.slice(-limit)
  }

  /** Get prompts that led to good outcomes (for analysis) */
  getGoodPrompts(): PromptRecord[] {
    return this.data.prompts.filter(p =>
      p.outcome === 'success' &&
      p.errors === 0 &&
      (p.toolUses || 0) > 0
    )
  }

  /** Get prompts that led to commits (high value) */
  getCommitPrompts(): PromptRecord[] {
    return this.data.prompts.filter(p => p.committedCode)
  }
}
