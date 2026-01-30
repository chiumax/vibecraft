# PTY Terminal Implementation

This document captures the evolution of the browser terminal feature, from initial concept through multiple iterations to the final tmux-backed PTY solution.

## Motivation

The original Vibecraft architecture relied on:
- **Hooks** for capturing Claude Code events (tool use, prompts, etc.)
- **tmux** for session persistence and prompt injection via `tmux send-keys`

This worked but had limitations:
1. Browser couldn't see actual terminal output (only hook events)
2. Had to `tmux attach` from a native terminal to see what Claude was doing
3. Interaction wasn't 1:1 - hooks capture events, not the full terminal experience

**Goal**: Render Claude Code's actual terminal output in the browser, eliminating the need to attach via native terminal.

## Approach 1: Direct PTY (No tmux)

### Concept
Run Claude Code directly in a node-pty pseudo-terminal, stream output to browser via WebSocket.

```
Browser (xterm.js) <-> WebSocket <-> node-pty <-> claude process
```

### Implementation
```typescript
// server/PtyManager.ts v1
const ptyProcess = pty.spawn('claude', claudeArgs, {
  name: 'xterm-256color',
  cols: 120,
  rows: 40,
  cwd,
  env,
})
```

### Problems Encountered

1. **`posix_spawnp failed` error**
   - node-pty's prebuilt binaries weren't compatible with Node.js v22
   - **Fix**: Rebuild from source with `npm install node-pty --build-from-source`

2. **Direct spawn failed on macOS**
   - node-pty had issues spawning commands directly
   - **Fix**: Spawn through shell instead:
   ```typescript
   const shell = process.env.SHELL || '/bin/zsh'
   pty.spawn(shell, ['-l', '-c', 'claude ...'], { ... })
   ```

3. **No persistence**
   - If server restarts, Claude process dies
   - Can't attach from native terminal
   - Lose all context

### Verdict
Works for basic terminal streaming, but lack of persistence is a dealbreaker for real usage.

## Approach 2: PTY + tmux (Final Solution)

### Concept
Best of both worlds - use tmux for persistence, PTY for browser streaming:

```
Browser (xterm.js)
    ↕ WebSocket
Node.js server
    ↕ PTY (node-pty)
tmux attach -t session
    ↕
tmux session (persistent daemon)
    └── claude process
```

### How It Works

1. **Session Creation**
   ```typescript
   // Create tmux session (detached, no PTY yet)
   execSync(`tmux new-session -d -s "${tmuxSession}" -c "${cwd}" "claude ..."`)
   ```

2. **Browser Subscribes**
   ```typescript
   // Spawn PTY that attaches to tmux
   pty.spawn(shell, ['-l', '-c', `tmux attach -t "${tmuxSession}"`], { ... })
   ```

3. **Data Flow**
   - User types in browser → WebSocket → `pty.write(data)` → tmux → Claude
   - Claude outputs → tmux → PTY captures → WebSocket → browser renders

4. **Disconnection Handling**
   - Browser closes → PTY process ends (tmux detach)
   - tmux session keeps running with Claude
   - Browser reconnects → new PTY attaches to same tmux session

### Key Files

**server/PtyManager.ts**
```typescript
export class PtyManager {
  // Creates tmux session, returns session object (no PTY yet)
  create(sessionId, cwd, claudeArgs, tmuxSessionName): PtySession

  // Spawns PTY that attaches to existing tmux session
  attach(sessionId): PtySession | null

  // Auto-attaches on first subscribe
  subscribe(sessionId, ws): boolean

  // Sends data to PTY (which goes to tmux -> Claude)
  write(sessionId, data): boolean

  // Kills tmux session entirely
  kill(sessionId): boolean

  // Re-register existing tmux session (for server restart recovery)
  register(sessionId, tmuxSession): PtySession
}
```

**src/ui/Terminal.ts**
```typescript
export class TerminalManager {
  // Creates xterm.js terminal, subscribes to PTY output
  getOrCreate(sessionId): TerminalUI

  // Routes WebSocket messages to correct terminal
  handleMessage(message): void
  // Handles: pty:output, pty:buffer, pty:detached, pty:exit
}
```

**WebSocket Message Types**
```typescript
// Client -> Server
| { type: 'pty:subscribe'; sessionId: string }
| { type: 'pty:unsubscribe'; sessionId: string }
| { type: 'pty:input'; sessionId: string; data: string }
| { type: 'pty:resize'; sessionId: string; cols: number; rows: number }

// Server -> Client
| { type: 'pty:output'; sessionId: string; data: string }
| { type: 'pty:buffer'; sessionId: string; data: string }
| { type: 'pty:detached'; sessionId: string; exitCode: number }
| { type: 'pty:exit'; sessionId: string; exitCode: number }
```

### UI Integration

**New Session Modal**
- Added "Browser Terminal (PTY)" checkbox
- When checked, session uses PTY mode instead of tmux-only mode

**Terminal Panel**
- Appears in activity feed area when PTY session selected
- Header shows session name, connection status
- Expand/collapse and close buttons
- Auto-shows when PTY session is selected

**Session Selection**
- Selecting PTY session shows terminal panel
- Selecting non-PTY session hides terminal panel
- Terminal toggle button only visible for PTY sessions

## Learnings

### node-pty on macOS
1. **Native module compatibility**: Always rebuild from source on new Node versions
   ```bash
   npm install node-pty --build-from-source
   ```

2. **Spawning commands**: Use shell wrapper for reliability
   ```typescript
   // Instead of: pty.spawn('claude', args)
   // Use: pty.spawn('/bin/zsh', ['-l', '-c', 'claude ...'])
   ```

3. **Environment**: Pass full env including extended PATH
   ```typescript
   env: {
     ...process.env,
     PATH: `/opt/homebrew/bin:/usr/local/bin:${process.env.PATH}`,
     TERM: 'xterm-256color',
   }
   ```

### tmux Integration
1. **Detached creation**: Use `-d` flag to create without attaching
2. **Session naming**: Use predictable names for reconnection
3. **Health checks**: Use `tmux has-session -t name` to verify session exists
4. **Attach for streaming**: `tmux attach` in a PTY gives full terminal output

### xterm.js
1. **Fit addon**: Essential for responsive terminals
2. **Buffer replay**: Send buffered output to new clients for history
3. **Theme matching**: Match Vibecraft's dark theme for consistency

## Trade-offs

| Aspect | tmux-only (original) | PTY-only (v1) | PTY+tmux (final) |
|--------|---------------------|---------------|------------------|
| Browser terminal | No | Yes | Yes |
| Persistence | Yes | No | Yes |
| Native terminal attach | Yes | No | Yes |
| Complexity | Low | Medium | High |
| Server restart survival | Yes | No | Yes |

## Future Improvements

1. **Auto-reattach on reconnect**: Detect existing tmux sessions on server start
2. **Multiple viewers**: Allow multiple browser tabs to watch same session
3. **Session recording**: Save terminal output for replay
4. **Split panes**: Support tmux panes in browser view

## Dependencies Added

```json
{
  "node-pty": "^1.0.0",
  "@xterm/xterm": "^5.0.0",
  "@xterm/addon-fit": "^0.10.0"
}
```

**Note**: node-pty requires native compilation. On install issues:
```bash
npm rebuild node-pty
# or
npm install node-pty --build-from-source
```
