# Reading Claude Code Output

This document explores different approaches for reading what Claude Code says programmatically, outside of the terminal UI.

## The Problem

Claude Code is a TUI (terminal user interface) application. When you run it, you see:
- Formatted text with colors and styling
- Box-drawing characters for UI chrome
- Spinners and progress indicators
- Tool call visualizations

The actual text Claude writes is mixed with ANSI escape codes and UI elements, making it difficult to extract programmatically.

## Current Data Sources

### 1. PTY Terminal Stream

The raw byte stream from the terminal session.

```
\x1b[38;5;75mClaude's text\x1b[0m\x1b[2K\x1b[1G╭─ Response ─╮
```

Contains everything but requires parsing.

### 2. Hook Events

Discrete events fired at specific moments:
- `pre_tool_use` - includes `assistantText` (text before tool call)
- `stop` - includes `response` (final response, extracted from transcript)

Clean text but not streaming, only at event boundaries.

### 3. Transcript File

Claude Code writes a JSONL file with all messages:
```
~/.claude/projects/<project-hash>/<session-id>.jsonl
```

Structured JSON, clean text, updated as Claude works.

---

## Option 1: Watch the Transcript File Directly

### How It Works

Claude Code maintains a transcript file that logs all conversation turns in structured JSON format. Each line is a complete JSON object:

```json
{"type": "user", "message": {"content": [{"type": "text", "text": "Fix the bug in auth.ts"}]}, "timestamp": "2024-01-15T10:30:00Z"}
{"type": "assistant", "message": {"content": [{"type": "text", "text": "I'll fix that bug. Let me first read the file..."}, {"type": "tool_use", "id": "xyz", "name": "Read", "input": {"file_path": "/src/auth.ts"}}]}, "timestamp": "2024-01-15T10:30:05Z"}
```

### Transcript File Location

The path follows this pattern:
```
~/.claude/projects/<project-hash>/<session-id>.jsonl
```

The `transcript_path` is provided in hook events, so you can capture it from the first event of a session.

### Message Content Structure

Assistant messages have a `content` array with different block types:

```typescript
interface AssistantMessage {
  type: 'assistant'
  message: {
    content: Array<
      | { type: 'text'; text: string }
      | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      | { type: 'thinking'; thinking: string }  // If extended thinking enabled
    >
  }
  timestamp: string
}
```

### Implementation Sketch

```typescript
import { watch } from 'chokidar'
import { createReadStream } from 'fs'
import { createInterface } from 'readline'

class TranscriptWatcher {
  private transcriptPath: string | null = null
  private lastLineCount = 0
  private watcher: FSWatcher | null = null

  setTranscriptPath(path: string) {
    this.transcriptPath = path
    this.lastLineCount = 0

    // Count existing lines
    this.countLines().then(count => {
      this.lastLineCount = count
      this.startWatching()
    })
  }

  private startWatching() {
    if (!this.transcriptPath) return

    this.watcher = watch(this.transcriptPath, {
      persistent: true,
      usePolling: true,  // More reliable for files being written
      interval: 100,
    })

    this.watcher.on('change', () => this.onFileChange())
  }

  private async onFileChange() {
    if (!this.transcriptPath) return

    const lines = await this.readLines()
    const newLines = lines.slice(this.lastLineCount)
    this.lastLineCount = lines.length

    for (const line of newLines) {
      try {
        const entry = JSON.parse(line)
        this.processEntry(entry)
      } catch (e) {
        // Partial line, wait for next change
      }
    }
  }

  private processEntry(entry: any) {
    if (entry.type === 'assistant') {
      for (const block of entry.message.content) {
        if (block.type === 'text') {
          this.emit('text', block.text)
        } else if (block.type === 'tool_use') {
          this.emit('tool_use', block)
        }
      }
    }
  }
}
```

### Pros

- **Clean structured data** - No ANSI codes or UI chrome
- **Complete content** - Gets everything Claude writes
- **Already exists** - No changes to Claude Code needed
- **Includes metadata** - Timestamps, tool calls, thinking blocks

### Cons

- **Need transcript path** - Must capture from hooks or guess from session
- **Not character-level streaming** - File is written in chunks
- **File I/O overhead** - Polling or watching files
- **Path structure may change** - Depends on Claude Code internals

---

## Option 2: Enhance Hooks to Stream More

### How It Works

Currently, hooks only fire at discrete moments. This option would require Anthropic to add new hook types that provide more granular access to Claude's output.

### Potential New Hooks

```typescript
// Hypothetical new hook types
interface AssistantTextChunk {
  hook_event_name: 'AssistantTextChunk'
  session_id: string
  text: string           // The new text chunk
  cumulative: string     // All text so far in this turn
}

interface AssistantThinking {
  hook_event_name: 'AssistantThinking'
  session_id: string
  thinking: string
}

interface TurnStart {
  hook_event_name: 'TurnStart'
  session_id: string
}

interface TurnEnd {
  hook_event_name: 'TurnEnd'
  session_id: string
  full_response: string
}
```

### What We Have Now

| Hook | Text Available | When |
|------|---------------|------|
| `pre_tool_use` | `assistantText` - text before this tool call | Before each tool |
| `stop` | `response` - full response | End of turn |
| `user_prompt_submit` | `prompt` - user's input | User sends message |

### Gaps in Current Hooks

1. **No streaming** - Can't see text as it's generated
2. **No thinking** - Extended thinking content not exposed
3. **Partial coverage** - `assistantText` only captured before tools, not at turn end if no tools used

### Pros

- **Would be cleanest solution** - Direct from source
- **Real-time streaming** - Character or chunk level
- **Official API** - Stable, documented

### Cons

- **Requires Anthropic changes** - Not in our control
- **May never happen** - Depends on product priorities
- **Hook overhead** - More hooks = more IPC/latency

### How to Request

File a feature request at: https://github.com/anthropics/claude-code/issues

---

## Option 3: PTY + ANSI Stripping + Heuristics

### How It Works

Parse the raw PTY terminal stream:
1. Strip ANSI escape codes
2. Identify and remove Claude Code's TUI elements
3. Extract the remaining content

### ANSI Escape Code Reference

Common sequences in Claude Code's output:

```
\x1b[38;5;XXXm     - Set foreground color (256-color)
\x1b[48;5;XXXm     - Set background color (256-color)
\x1b[0m            - Reset all attributes
\x1b[1m            - Bold
\x1b[2m            - Dim
\x1b[3m            - Italic
\x1b[4m            - Underline
\x1b[7m            - Reverse
\x1b[?25h         - Show cursor
\x1b[?25l         - Hide cursor
\x1b[2K           - Clear entire line
\x1b[1G           - Move cursor to column 1
\x1b[H            - Move cursor to home position
\x1b[2J           - Clear entire screen
\x1b[XXA          - Move cursor up XX lines
\x1b[XXB          - Move cursor down XX lines
\x1b[XXC          - Move cursor right XX columns
\x1b[XXD          - Move cursor left XX columns
\x1b[s            - Save cursor position
\x1b[u            - Restore cursor position
```

### Claude Code TUI Elements

Elements to filter out:

```
╭─────────────────╮     Box drawing (top)
│                 │     Box drawing (sides)
╰─────────────────╯     Box drawing (bottom)
├─────────────────┤     Box drawing (separator)
●                       Status indicator
◐ ◓ ◑ ◒                 Spinner characters
▸                       Bullet point (might be content)
[####----]              Progress bar
```

### Implementation Sketch

```typescript
import stripAnsi from 'strip-ansi'

// Box drawing characters used by Claude Code
const BOX_CHARS = /[╭╮╰╯│─├┤┬┴┼]/g

// Spinner and status characters
const SPINNER_CHARS = /[●◐◓◑◒⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/g

// Common TUI patterns
const TUI_PATTERNS = [
  /^╭─.*─╮$/,           // Box top
  /^╰─.*─╯$/,           // Box bottom
  /^│.*│$/,             // Box sides (careful - content is inside)
  /^\s*●\s*$/,          // Lone status dot
  /^\[#+\-*\]\s*\d+%/,  // Progress bar
]

interface ParsedChunk {
  type: 'content' | 'ui' | 'unknown'
  text: string
  raw: string
}

function parsePtyOutput(data: string): ParsedChunk[] {
  // Step 1: Strip ANSI codes
  const stripped = stripAnsi(data)

  // Step 2: Split into lines
  const lines = stripped.split('\n')

  // Step 3: Classify each line
  return lines.map(line => {
    const trimmed = line.trim()

    // Check if it's TUI chrome
    if (TUI_PATTERNS.some(p => p.test(trimmed))) {
      return { type: 'ui', text: trimmed, raw: line }
    }

    // Check if it's mostly box characters
    const boxCharCount = (trimmed.match(BOX_CHARS) || []).length
    if (boxCharCount > trimmed.length * 0.5) {
      return { type: 'ui', text: trimmed, raw: line }
    }

    // Check for spinner
    if (SPINNER_CHARS.test(trimmed) && trimmed.length < 10) {
      return { type: 'ui', text: trimmed, raw: line }
    }

    // Probably content
    return { type: 'content', text: trimmed, raw: line }
  })
}

// Extract just the content
function extractContent(data: string): string {
  return parsePtyOutput(data)
    .filter(chunk => chunk.type === 'content')
    .map(chunk => chunk.text)
    .join('\n')
}
```

### Advanced: State Machine Approach

Track TUI state to better identify content regions:

```typescript
type UIState =
  | 'normal'
  | 'in_response_box'
  | 'in_tool_box'
  | 'in_error_box'
  | 'spinner'

class PtyParser {
  private state: UIState = 'normal'
  private buffer = ''

  process(data: string): { content: string; state: UIState } {
    const stripped = stripAnsi(data)

    // Detect state transitions
    if (stripped.includes('╭─') && stripped.includes('Response')) {
      this.state = 'in_response_box'
    } else if (stripped.includes('╭─') && stripped.includes('Tool')) {
      this.state = 'in_tool_box'
    } else if (stripped.includes('╰─')) {
      this.state = 'normal'
    }

    // Extract content based on state
    let content = ''
    if (this.state === 'in_response_box') {
      // Inside response box - this is Claude's text
      content = this.extractBoxContent(stripped)
    }

    return { content, state: this.state }
  }

  private extractBoxContent(text: string): string {
    // Remove box drawing, keep inner content
    return text
      .split('\n')
      .filter(line => line.includes('│'))
      .map(line => {
        // Extract content between │ characters
        const match = line.match(/│(.*)│/)
        return match ? match[1].trim() : ''
      })
      .filter(Boolean)
      .join('\n')
  }
}
```

### Pros

- **Real-time streaming** - Process data as it arrives
- **No external dependencies** - Just parse the stream we already have
- **Works with any session** - Don't need transcript path

### Cons

- **Fragile** - Breaks if Claude Code changes its TUI
- **Incomplete** - Hard to handle all edge cases
- **Complex** - Need to understand TUI structure deeply
- **Lossy** - Might miss or mangle content
- **No metadata** - Don't know tool names, timestamps, etc.

---

## Option 4: Dual Display

### How It Works

Instead of trying to extract clean text from one source, show both:
1. **PTY Terminal** - Full visual experience, exactly as Claude Code renders
2. **Activity Feed** - Clean text from hooks/transcript

Let users choose which view they prefer, or show both side by side.

### Current Vibecraft Implementation

Vibecraft already has this partially:
- **Terminal panel** - Shows PTY output
- **Activity feed** - Shows events from hooks

But the activity feed is event-focused, not a clean transcript view.

### Enhanced Activity Feed

Could add a "Transcript" tab that shows clean conversation:

```typescript
interface TranscriptEntry {
  type: 'user' | 'assistant' | 'tool_use' | 'tool_result'
  timestamp: number
  content: string
  metadata?: {
    tool?: string
    file?: string
    success?: boolean
  }
}

function TranscriptView({ entries }: { entries: TranscriptEntry[] }) {
  return (
    <div className="transcript">
      {entries.map(entry => (
        <div key={entry.timestamp} className={`entry entry-${entry.type}`}>
          <div className="timestamp">{formatTime(entry.timestamp)}</div>
          <div className="content">
            {entry.type === 'tool_use' && (
              <span className="tool-badge">{entry.metadata?.tool}</span>
            )}
            <Markdown>{entry.content}</Markdown>
          </div>
        </div>
      ))}
    </div>
  )
}
```

### Data Sources for Each View

| View | Data Source | Shows |
|------|-------------|-------|
| Terminal | PTY stream | Exact Claude Code UI |
| Events | Hook events | Tool calls, prompts, status |
| Transcript | Transcript file or hooks | Clean conversation text |

### Layout Options

```
┌─────────────────────────────────────────────────────┐
│  [Terminal] [Transcript] [Events]                   │  ← Tabs
├─────────────────────────────────────────────────────┤
│                                                     │
│  Content based on selected tab                      │
│                                                     │
└─────────────────────────────────────────────────────┘

OR

┌────────────────────┬────────────────────────────────┐
│                    │  Transcript                    │
│  Terminal (PTY)    │  ─────────────────────────    │
│                    │  User: Fix the bug             │
│                    │  Claude: I'll read the file... │
│                    │  [Read] auth.ts                │
│                    │  Claude: Found it, fixing...   │
└────────────────────┴────────────────────────────────┘
```

### Pros

- **Best of both worlds** - Visual fidelity AND clean text
- **User choice** - Let users pick what works for them
- **Incremental** - Can improve each view independently
- **Fallback** - If one breaks, other still works

### Cons

- **More UI complexity** - Multiple views to maintain
- **Sync issues** - Views might show different things at different times
- **More resources** - Processing multiple data streams

---

## Option 5: Transcript File Watcher Service

### How It Works

A dedicated server-side service that:
1. Captures `transcript_path` from hook events
2. Watches the transcript file for changes
3. Parses new entries and broadcasts over WebSocket
4. Provides a clean, structured stream of Claude's output

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Claude Code                                                      │
│   │                                                              │
│   ├──→ Hooks ──→ Vibecraft Server ──→ Browser (events)          │
│   │                    │                                         │
│   └──→ Transcript ─────┘                                         │
│        File            │                                         │
│                        ▼                                         │
│              TranscriptWatcher                                   │
│                        │                                         │
│                        ▼                                         │
│              WebSocket broadcast ──→ Browser (clean text)        │
└─────────────────────────────────────────────────────────────────┘
```

### Server Implementation

```typescript
// server/TranscriptWatcher.ts

import { watch, FSWatcher } from 'chokidar'
import { readFileSync, statSync } from 'fs'
import { EventEmitter } from 'events'

interface TranscriptEntry {
  type: 'user' | 'assistant' | 'system'
  message: {
    content: Array<{
      type: 'text' | 'tool_use' | 'tool_result' | 'thinking'
      text?: string
      thinking?: string
      name?: string
      input?: Record<string, unknown>
    }>
  }
  timestamp?: string
}

interface ParsedContent {
  sessionId: string
  type: 'text' | 'tool_use' | 'thinking'
  content: string
  metadata?: Record<string, unknown>
  timestamp: number
}

export class TranscriptWatcher extends EventEmitter {
  private watchers = new Map<string, {
    watcher: FSWatcher
    path: string
    lastSize: number
    lastLineCount: number
  }>()

  /**
   * Start watching a transcript file for a session
   */
  watch(sessionId: string, transcriptPath: string): void {
    // Don't double-watch
    if (this.watchers.has(sessionId)) {
      const existing = this.watchers.get(sessionId)!
      if (existing.path === transcriptPath) return
      this.unwatch(sessionId)
    }

    console.log(`[TranscriptWatcher] Watching ${transcriptPath} for session ${sessionId}`)

    const watcher = watch(transcriptPath, {
      persistent: true,
      usePolling: true,
      interval: 100,
      binaryInterval: 100,
    })

    const state = {
      watcher,
      path: transcriptPath,
      lastSize: this.getFileSize(transcriptPath),
      lastLineCount: this.countLines(transcriptPath),
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
      console.log(`[TranscriptWatcher] Stopped watching session ${sessionId}`)
    }
  }

  /**
   * Stop all watchers
   */
  close(): void {
    for (const sessionId of this.watchers.keys()) {
      this.unwatch(sessionId)
    }
  }

  private getFileSize(path: string): number {
    try {
      return statSync(path).size
    } catch {
      return 0
    }
  }

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

    for (const line of newLines) {
      try {
        const entry = JSON.parse(line) as TranscriptEntry
        this.processEntry(sessionId, entry)
      } catch (e) {
        // Partial line or invalid JSON, skip
      }
    }
  }

  private processEntry(sessionId: string, entry: TranscriptEntry): void {
    if (entry.type !== 'assistant') return

    const timestamp = entry.timestamp
      ? new Date(entry.timestamp).getTime()
      : Date.now()

    for (const block of entry.message.content) {
      let parsed: ParsedContent | null = null

      switch (block.type) {
        case 'text':
          parsed = {
            sessionId,
            type: 'text',
            content: block.text || '',
            timestamp,
          }
          break

        case 'tool_use':
          parsed = {
            sessionId,
            type: 'tool_use',
            content: block.name || 'unknown',
            metadata: { input: block.input },
            timestamp,
          }
          break

        case 'thinking':
          parsed = {
            sessionId,
            type: 'thinking',
            content: block.thinking || '',
            timestamp,
          }
          break
      }

      if (parsed) {
        this.emit('content', parsed)
      }
    }
  }
}
```

### Integration with Vibecraft Server

```typescript
// In server/index.ts

import { TranscriptWatcher } from './TranscriptWatcher'

const transcriptWatcher = new TranscriptWatcher()

// When we receive a hook event with transcript_path
function handleHookEvent(event: ClaudeEvent & { transcript_path?: string }) {
  // ... existing event handling ...

  // Start watching transcript if we have the path
  if (event.transcript_path && event.sessionId) {
    transcriptWatcher.watch(event.sessionId, event.transcript_path)
  }
}

// Broadcast transcript content to clients
transcriptWatcher.on('content', (content: ParsedContent) => {
  broadcast({
    type: 'transcript_content',
    payload: content,
  })
})

// Clean up when session ends
function handleSessionEnd(sessionId: string) {
  transcriptWatcher.unwatch(sessionId)
}
```

### Client-Side Handling

```typescript
// In browser

interface TranscriptContent {
  sessionId: string
  type: 'text' | 'tool_use' | 'thinking'
  content: string
  metadata?: Record<string, unknown>
  timestamp: number
}

// Add to WebSocket message handler
case 'transcript_content':
  const content = message.payload as TranscriptContent
  handleTranscriptContent(content)
  break

function handleTranscriptContent(content: TranscriptContent) {
  // Add to transcript view
  transcriptStore.addEntry(content)

  // Could also trigger other UI updates
  if (content.type === 'text') {
    showNotification(`Claude: ${content.content.slice(0, 50)}...`)
  }
}
```

### WebSocket Protocol Addition

```typescript
// Add to shared/types.ts

export type ServerMessage =
  | // ... existing types ...
  | {
      type: 'transcript_content'
      payload: {
        sessionId: string
        type: 'text' | 'tool_use' | 'thinking'
        content: string
        metadata?: Record<string, unknown>
        timestamp: number
      }
    }
```

### Getting the Transcript Path

The transcript path comes from hook events. It's passed as `transcript_path` in the raw hook input. Currently the hook script uses it to extract responses but doesn't forward it.

Update the hook to include it:

```bash
# In vibecraft-hook.sh, for session_start event:
transcript_path=$(echo "$input" | "$JQ" -r '.transcript_path // ""')

event=$("$JQ" -n -c \
  # ... existing fields ...
  --arg transcriptPath "$transcript_path" \
  '{
    # ... existing fields ...
    transcriptPath: $transcriptPath
  }')
```

### Pros

- **Clean structured data** - Proper JSON, no parsing terminal garbage
- **Near real-time** - File watching gives quick updates
- **Complete content** - Everything Claude writes
- **Metadata included** - Timestamps, tool info, thinking
- **Centralized** - Server handles complexity, clients get clean stream
- **Works with existing system** - Enhances rather than replaces hooks

### Cons

- **File I/O overhead** - Polling/watching files
- **Transcript path dependency** - Need to capture from hooks
- **Potential race conditions** - File might be written while reading
- **Claude Code internal dependency** - Transcript format could change
- **Additional complexity** - Another subsystem to maintain

---

## Comparison Matrix

| Aspect | Option 1: Direct Watch | Option 2: New Hooks | Option 3: PTY Parse | Option 4: Dual View | Option 5: Watcher Service |
|--------|----------------------|-------------------|-------------------|-------------------|-------------------------|
| **Implementation Effort** | Medium | None (need Anthropic) | High | Medium | Medium-High |
| **Reliability** | High | Would be highest | Low | Medium | High |
| **Real-time** | Near | Would be best | Yes | Varies | Near |
| **Clean Data** | Yes | Yes | No | Mixed | Yes |
| **Maintenance** | Low | None | High | Medium | Medium |
| **Works Today** | Yes | No | Yes | Yes | Yes |

## Recommendation

**For Vibecraft specifically:**

1. **Short term**: Implement **Option 5 (Transcript Watcher Service)** - it gives clean, structured data with reasonable effort

2. **Also keep**: **Option 4 (Dual Display)** - the PTY terminal is valuable for seeing exactly what Claude Code shows

3. **Long term**: Request **Option 2 (Enhanced Hooks)** from Anthropic - this would be the cleanest solution if they add it

**Avoid Option 3** unless you have no other choice - parsing terminal output is fragile and will break.

## Implementation Priority

1. Update hooks to forward `transcript_path`
2. Add `TranscriptWatcher` class to server
3. Add WebSocket message type for transcript content
4. Add transcript view component in browser
5. Test with various Claude Code scenarios (streaming, tools, errors)
