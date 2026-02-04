/**
 * Vibecraft Event Types
 *
 * These types define the contract between:
 * - Hook scripts (produce events)
 * - WebSocket server (relay events)
 * - Three.js client (consume events)
 */

// ============================================================================
// Core Event Types
// ============================================================================

export type HookEventType =
  | 'pre_tool_use'
  | 'post_tool_use'
  | 'stop'
  | 'subagent_stop'
  | 'session_start'
  | 'session_end'
  | 'user_prompt_submit'
  | 'notification'
  | 'pre_compact'

export type ToolName =
  | 'Read'
  | 'Write'
  | 'Edit'
  | 'Bash'
  | 'Grep'
  | 'Glob'
  | 'WebFetch'
  | 'WebSearch'
  | 'Task'
  | 'TodoWrite'
  | 'AskUserQuestion'
  | 'NotebookEdit'
  | string // MCP tools and future tools

// ============================================================================
// Base Event
// ============================================================================

export interface BaseEvent {
  /** Unique event ID */
  id: string
  /** Unix timestamp in milliseconds */
  timestamp: number
  /** Event type */
  type: HookEventType
  /** Claude Code session ID */
  sessionId: string
  /** Current working directory */
  cwd: string
  /** Path to transcript JSONL file (for TranscriptWatcher) */
  transcriptPath?: string
}

// ============================================================================
// Tool Events
// ============================================================================

export interface PreToolUseEvent extends BaseEvent {
  type: 'pre_tool_use'
  tool: ToolName
  toolInput: Record<string, unknown>
  toolUseId: string
  /** Assistant text that came before this tool call */
  assistantText?: string
}

export interface PostToolUseEvent extends BaseEvent {
  type: 'post_tool_use'
  tool: ToolName
  toolInput: Record<string, unknown>
  toolResponse: Record<string, unknown>
  toolUseId: string
  success: boolean
  /** Duration in milliseconds (calculated from matching pre_tool_use) */
  duration?: number
}

// ============================================================================
// Lifecycle Events
// ============================================================================

export interface StopEvent extends BaseEvent {
  type: 'stop'
  stopHookActive: boolean
  /** Claude's text response (extracted from transcript) */
  response?: string
}

export interface SubagentStopEvent extends BaseEvent {
  type: 'subagent_stop'
  stopHookActive: boolean
}

export interface SessionStartEvent extends BaseEvent {
  type: 'session_start'
  source: 'startup' | 'resume' | 'clear' | 'compact'
}

export interface SessionEndEvent extends BaseEvent {
  type: 'session_end'
  reason: 'clear' | 'logout' | 'prompt_input_exit' | 'other'
}

// ============================================================================
// User Interaction Events
// ============================================================================

export interface UserPromptSubmitEvent extends BaseEvent {
  type: 'user_prompt_submit'
  prompt: string
}

export interface NotificationEvent extends BaseEvent {
  type: 'notification'
  message: string
  notificationType: 'permission_prompt' | 'idle_prompt' | 'auth_success' | 'elicitation_dialog' | string
}

// ============================================================================
// Other Events
// ============================================================================

export interface PreCompactEvent extends BaseEvent {
  type: 'pre_compact'
  trigger: 'manual' | 'auto'
  customInstructions?: string
}

// ============================================================================
// Union Type
// ============================================================================

export type ClaudeEvent =
  | PreToolUseEvent
  | PostToolUseEvent
  | StopEvent
  | SubagentStopEvent
  | SessionStartEvent
  | SessionEndEvent
  | UserPromptSubmitEvent
  | NotificationEvent
  | PreCompactEvent

// ============================================================================
// WebSocket Messages
// ============================================================================

/** Permission option (number + label) */
export interface PermissionOption {
  number: string   // "1", "2", "3"
  label: string    // "Yes", "Yes, and always allow...", "No"
}

/** Transcript content block */
export interface TranscriptContent {
  sessionId: string
  type: 'text' | 'tool_use' | 'tool_result' | 'thinking'
  content: string
  metadata?: Record<string, unknown>
  timestamp: number
}

/** Server -> Client messages */
export type ServerMessage =
  | { type: 'event'; payload: ClaudeEvent }
  | { type: 'history'; payload: ClaudeEvent[] }
  | { type: 'connected'; payload: { sessionId: string } }
  | { type: 'error'; payload: { message: string } }
  | { type: 'tokens'; payload: { session: string; current: number; cumulative: number } }
  | { type: 'sessions'; payload: ManagedSession[] }
  | { type: 'session_update'; payload: ManagedSession }
  | { type: 'permission_prompt'; payload: { sessionId: string; tool: string; context: string; options: PermissionOption[] } }
  | { type: 'permission_resolved'; payload: { sessionId: string } }
  | { type: 'text_tiles'; payload: TextTile[] }
  | { type: 'pong'; payload: { timestamp: number } }
  // PTY terminal messages
  | { type: 'pty:output'; sessionId: string; data: string }
  | { type: 'pty:buffer'; sessionId: string; data: string }
  | { type: 'pty:exit'; sessionId: string; exitCode: number }
  // Shell management
  | { type: 'shell:list'; payload: { id: string; cwd: string }[] }
  // Transcript watcher
  | { type: 'transcript'; payload: TranscriptContent }

/** Client -> Server messages */
export type ClientMessage =
  | { type: 'subscribe'; payload?: { sessionId?: string } }
  | { type: 'get_history'; payload?: { limit?: number } }
  | { type: 'ping' }
  | { type: 'voice_start' }
  | { type: 'voice_stop' }
  | { type: 'permission_response'; payload: { sessionId: string; response: string } }
  // PTY terminal messages
  | { type: 'pty:subscribe'; sessionId: string }
  | { type: 'pty:unsubscribe'; sessionId: string }
  | { type: 'pty:input'; sessionId: string; data: string }
  | { type: 'pty:resize'; sessionId: string; cols: number; rows: number }
  // Standalone shell terminal
  | { type: 'shell:subscribe'; sessionId: string; cwd?: string }
  | { type: 'shell:list' }
  | { type: 'shell:close'; sessionId: string }

// ============================================================================
// Visualization State
// ============================================================================

/** Represents Claude's current activity state */
export type ClaudeState =
  | 'idle'           // Waiting for user input
  | 'thinking'       // Processing (between tools)
  | 'working'        // Using a tool
  | 'finished'       // Completed response

/** Station/location in the 3D workshop */
export type StationType =
  | 'center'         // Default idle position
  | 'bookshelf'      // Read
  | 'desk'           // Write
  | 'workbench'      // Edit
  | 'terminal'       // Bash
  | 'scanner'        // Grep/Glob
  | 'antenna'        // WebFetch/WebSearch
  | 'portal'         // Task (spawning subagents)
  | 'taskboard'      // TodoWrite

/** Map tools to stations */
export const TOOL_STATION_MAP: Record<ToolName, StationType> = {
  Read: 'bookshelf',
  Write: 'desk',
  Edit: 'workbench',
  Bash: 'terminal',
  Grep: 'scanner',
  Glob: 'scanner',
  WebFetch: 'antenna',
  WebSearch: 'antenna',
  Task: 'portal',
  TodoWrite: 'taskboard',
  AskUserQuestion: 'center',
  NotebookEdit: 'desk',
}

/** Get station for a tool (handles unknown/MCP tools) */
export function getStationForTool(tool: string): StationType {
  return TOOL_STATION_MAP[tool as ToolName] ?? 'center'
}

// ============================================================================
// Utility Types
// ============================================================================

/** Extract specific tool input types */
export interface BashToolInput {
  command: string
  description?: string
  timeout?: number
  run_in_background?: boolean
}

export interface WriteToolInput {
  file_path: string
  content: string
}

export interface EditToolInput {
  file_path: string
  old_string: string
  new_string: string
  replace_all?: boolean
}

export interface ReadToolInput {
  file_path: string
  offset?: number
  limit?: number
}

export interface TaskToolInput {
  description: string
  prompt: string
  subagent_type: string
}

// ============================================================================
// Session Management (Orchestration)
// ============================================================================

/** Status of a managed Claude session */
export type SessionStatus = 'idle' | 'working' | 'waiting' | 'offline' | 'dismissed'

/** A managed Claude session */
export interface ManagedSession {
  /** Our internal ID (UUID) */
  id: string
  /** User-friendly name ("Frontend", "Tests") */
  name: string
  /** Actual tmux session name (also used as PTY session ID) */
  tmuxSession: string
  /** Current status */
  status: SessionStatus
  /** Claude Code session ID (from events, may differ from our ID) */
  claudeSessionId?: string
  /** Creation timestamp */
  createdAt: number
  /** Last activity timestamp */
  lastActivity: number
  /** Working directory */
  cwd?: string
  /** Current tool being used (if working) */
  currentTool?: string
  /** Token count for this session */
  tokens?: {
    current: number
    cumulative: number
  }
  /** Git status for this session's working directory */
  gitStatus?: GitStatus
  /** Zone position in hex grid (for layout persistence) */
  zonePosition?: {
    q: number
    r: number
  }
  /** Context files read by Claude (Phase 1: Context Visibility) */
  context?: SessionContext
  // Note: usePty field removed - PTY is now the only mode
}

/** Git repository status */
export interface GitStatus {
  /** Current branch name */
  branch: string
  /** Commits ahead of upstream */
  ahead: number
  /** Commits behind upstream */
  behind: number
  /** Staged file counts */
  staged: {
    added: number
    modified: number
    deleted: number
  }
  /** Unstaged file counts */
  unstaged: {
    added: number
    modified: number
    deleted: number
  }
  /** Untracked file count */
  untracked: number
  /** Total changed files (staged + unstaged + untracked) */
  totalFiles: number
  /** Lines added (staged + unstaged) */
  linesAdded: number
  /** Lines removed (staged + unstaged) */
  linesRemoved: number
  /** Last commit timestamp (unix seconds) */
  lastCommitTime: number | null
  /** Last commit message (first line) */
  lastCommitMessage: string | null
  /** Whether directory is a git repo */
  isRepo: boolean
  /** Last time we checked (unix ms) */
  lastChecked: number
}

/** Known project directory for autocomplete */
export interface KnownProject {
  /** Absolute path to the directory */
  path: string
  /** Display name (defaults to directory basename) */
  name: string
  /** Last time this project was used (unix ms) */
  lastUsed: number
  /** Number of times this project has been opened */
  useCount: number
}

/** Request to create a new session */
export interface CreateSessionRequest {
  name?: string
  cwd?: string
  /** Claude command flags */
  flags?: {
    continue?: boolean        // -c (continue last conversation)
    skipPermissions?: boolean  // --dangerously-skip-permissions
    chrome?: boolean        // --chrome
  }
  // Note: usePty field removed - PTY is now the only mode
}

/** Request to update a session */
export interface UpdateSessionRequest {
  name?: string
  zonePosition?: {
    q: number
    r: number
  }
}

/** Request to send a prompt to a session */
export interface SessionPromptRequest {
  prompt: string
  send?: boolean
}

/** Response for session operations */
export interface SessionResponse {
  ok: boolean
  session?: ManagedSession
  error?: string
}

/** Response for listing sessions */
export interface SessionListResponse {
  ok: boolean
  sessions: ManagedSession[]
}

// ============================================================================
// Text Tiles (Grid Labels)
// ============================================================================

/** A text label tile on the hex grid */
export interface TextTile {
  /** Unique ID (UUID) */
  id: string
  /** The label text */
  text: string
  /** Hex grid position */
  position: {
    q: number
    r: number
  }
  /** Optional color (hex string, default white) */
  color?: string
  /** Creation timestamp */
  createdAt: number
}

/** Request to create a text tile */
export interface CreateTextTileRequest {
  text: string
  position: {
    q: number
    r: number
  }
  color?: string
}

/** Request to update a text tile */
export interface UpdateTextTileRequest {
  text?: string
  position?: {
    q: number
    r: number
  }
  color?: string
}

// ============================================================================
// Session Stats & Achievements
// ============================================================================

/** Tool usage statistics */
export interface ToolStats {
  /** Number of times tool was used */
  count: number
  /** Number of successful uses */
  successes: number
  /** Number of failed uses */
  failures: number
  /** Total duration in ms */
  totalDuration: number
}

/** A single prompt record */
export interface PromptRecord {
  /** Unique ID */
  id: string
  /** The prompt text */
  text: string
  /** Timestamp when sent */
  timestamp: number
  /** Session ID this prompt was sent to */
  sessionId: string
  /** Whether this prompt led to a successful outcome */
  outcome?: 'success' | 'error' | 'pending'
  /** Number of tool uses triggered by this prompt */
  toolUses?: number
  /** Number of errors during this prompt's execution */
  errors?: number
  /** Whether a git commit was made */
  committedCode?: boolean
  /** Duration until stop event (ms) */
  duration?: number
}

/** Per-session statistics */
export interface SessionStats {
  /** Session ID (matches ManagedSession.id) */
  sessionId: string
  /** Session name (for display) */
  sessionName: string
  /** First activity timestamp */
  firstSeen: number
  /** Last activity timestamp */
  lastSeen: number
  /** Total prompts sent */
  totalPrompts: number
  /** Tool usage breakdown */
  toolUsage: Record<string, ToolStats>
  /** Total tokens consumed */
  totalTokens: number
  /** Files touched (unique paths) */
  filesTouched: string[]
  /** Git commits made (count) */
  gitCommits: number
  /** Total time in "working" state (ms) */
  workingTime: number
  /** Total errors encountered */
  totalErrors: number
  /** Total successful tool uses */
  totalSuccesses: number
  /** Achievement IDs earned */
  achievements: string[]
  /** Current streak (consecutive successful prompts) */
  currentStreak: number
  /** Best streak ever */
  bestStreak: number
}

/** Achievement definition */
export interface Achievement {
  /** Unique achievement ID */
  id: string
  /** Display name */
  name: string
  /** Description of how to earn */
  description: string
  /** Icon/emoji */
  icon: string
  /** Category */
  category: 'tools' | 'prompts' | 'git' | 'efficiency' | 'milestones'
  /** Condition to check (threshold value) */
  threshold?: number
  /** Whether this is a hidden achievement */
  hidden?: boolean
}

/** Global stats file structure */
export interface SessionStatsFile {
  /** Version for migrations */
  version: number
  /** Stats per session */
  sessions: Record<string, SessionStats>
  /** All prompts (for analysis) */
  prompts: PromptRecord[]
  /** Global totals */
  totals: {
    totalPrompts: number
    totalToolUses: number
    totalTokens: number
    totalCommits: number
    totalSessions: number
  }
  /** Achievements unlocked globally */
  unlockedAchievements: string[]
}

// ============================================================================
// Configuration
// ============================================================================

export interface VibecraftConfig {
  /** WebSocket server port */
  serverPort: number
  /** Path to events JSONL file */
  eventsFile: string
  /** Maximum events to keep in memory */
  maxEventsInMemory: number
  /** Enable debug logging */
  debug: boolean
}

export const DEFAULT_CONFIG: VibecraftConfig = {
  serverPort: 4003,
  eventsFile: './data/events.jsonl',
  maxEventsInMemory: 1000,
  debug: false,
}

// ============================================================================
// Todos / Kanban
// ============================================================================

/** Status for kanban board columns */
export type TodoStatus = 'todo' | 'in-progress' | 'done' | 'blocked' | 'icebox'

/** A single todo item */
export interface Todo {
  id: string
  text: string
  completed: boolean  // Keep for backwards compatibility
  status: TodoStatus  // Kanban column status
  createdAt: number
  /** Session ID running this todo (Phase 2: Todo-to-Agent) */
  executingSessionId?: string
  /** When execution was started */
  executionStartedAt?: number
  /** Additional context prepended to the todo when executed */
  contextPrefix?: string
}

/** Request to execute a todo as a prompt */
export interface ExecuteTodoRequest {
  /** Target session ID (null = create new session) */
  sessionId: string | null
  /** Additional context to prepend */
  contextPrefix?: string
}

/** Todos grouped by session */
export interface SessionTodos {
  sessionId: string
  sessionName: string
  todos: Todo[]
}

// ============================================================================
// Context Tracking (Phase 1: Context Visibility)
// ============================================================================

/** Category of a context file */
export type ContextFileCategory =
  | 'project'   // Main CLAUDE.md in project root
  | 'parent'    // CLAUDE.md in parent directory
  | 'local'     // CLAUDE.md in subdirectory
  | 'rules'     // Files in .claude/ directory
  | 'docs'      // Documentation files

/** A tracked context file read by Claude */
export interface ContextFileRead {
  /** Absolute file path */
  path: string
  /** Category of the context file */
  category: ContextFileCategory
  /** When first read (unix ms) */
  firstReadAt: number
  /** Number of times read */
  readCount: number
}

/** Context state for a session */
export interface SessionContext {
  /** Context files read by Claude */
  contextFiles: ContextFileRead[]
  /** Whether the main project CLAUDE.md has been confirmed read */
  projectContextLoaded: boolean
  /** Working directory of the session */
  cwd: string
}

// ============================================================================
// Planner Agent (Phase 3)
// ============================================================================

/** Request to create a plan from a goal */
export interface PlanRequest {
  /** The high-level goal to break down */
  goal: string
  /** Associate todos with this session */
  sessionId?: string
  /** Project context (CLAUDE.md content) to inform the plan */
  projectContext?: string
  /** Automatically execute todos after creation */
  autoExecute?: boolean
}

/** A single task in the AI-generated plan */
export interface PlanTask {
  /** Task text */
  text: string
  /** Optional description */
  description?: string
  /** Indices of tasks this depends on (0-indexed) */
  dependencies?: number[]
}

/** Result of planning a goal */
export interface PlanResult {
  /** Summary of the plan */
  summary: string
  /** Tasks to accomplish the goal */
  todos: PlanTask[]
}

/** Status of the planner */
export type PlannerStatus =
  | 'idle'       // No active plan
  | 'planning'   // AI is generating a plan
  | 'executing'  // Auto-executing todos
  | 'paused'     // Execution paused
  | 'complete'   // All todos complete

/** Current planner state */
export interface PlannerState {
  /** Current status */
  status: PlannerStatus
  /** The goal being worked on */
  currentGoal: string | null
  /** Todo currently being executed */
  executingTodoId: string | null
  /** Number of todos completed */
  completedCount: number
  /** Total number of todos in the plan */
  totalCount: number
}
