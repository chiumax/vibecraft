# Troubleshooting

Common issues and solutions for Vibecraft.

## node-pty "posix_spawnp failed" Error

**Symptom:** Terminal doesn't render in browser. Server logs show:
```
[PTY] Subscribe error for <session-id>: Error: posix_spawnp failed.
    at new UnixTerminal (node_modules/node-pty/src/unixTerminal.ts:106:22)
```

**Cause:** The `node-pty` native module wasn't properly compiled for your Node.js version. This commonly happens when:
- Node.js was upgraded
- The package was installed with prebuilt binaries that don't match your architecture
- The native build step failed silently during `npm install`

**Solution:** Rebuild the native module:

```bash
# From the vibecraft directory
cd node_modules/node-pty
npx node-gyp rebuild
```

You should see output ending with `gyp info ok`.

Then restart the server:
```bash
npm run dev
```

**Verification:** Test that node-pty works:
```bash
node -e "const pty = require('node-pty'); const p = pty.spawn('/bin/echo', ['hello']); p.onData(d => console.log(d))"
```

Should output: `hello`

**If rebuild fails:** Try a full reinstall:
```bash
rm -rf node_modules/node-pty
npm install node-pty
cd node_modules/node-pty
npx node-gyp rebuild
```

## Terminal Shows But No Output

**Symptom:** Terminal panel appears but stays blank.

**Possible causes:**

1. **PTY not subscribed** - Check browser console for `[TerminalManager] Subscribing to PTY` log
2. **tmux session doesn't exist** - Check server logs for `[PTY] Session not found`
3. **WebSocket not connected** - Check browser console for connection status

**Debug:** Enable verbose logging:
```bash
VIBECRAFT_DEBUG=true npm run dev:server
```

## Zone Gets Stuck / Claude Not Responding

**Symptom:** A zone shows "working" status indefinitely.

**Cause:** Claude Code may be waiting for input, stuck on a permission prompt, or in an unknown state.

**Solution:** Attach to the tmux session to see what's happening:

```bash
# List all tmux sessions
tmux ls

# Attach to the session (name shown in Vibecraft UI)
tmux attach -t <session-name>
```

From there you can:
- See any prompts Claude is waiting on
- Send Ctrl+C to interrupt
- Type responses if needed

Detach with `Ctrl+B, D` to leave tmux running.

## Server Won't Start

**Symptom:** `npx vibecraft` fails or port already in use.

**Solutions:**

1. **Port conflict** - Use a different port:
   ```bash
   VIBECRAFT_PORT=4004 npx vibecraft
   ```

2. **Kill existing process:**
   ```bash
   lsof -i :4003 | grep LISTEN
   kill <PID>
   ```

## Hooks Not Working

**Symptom:** Events don't appear in Vibecraft when using Claude Code.

**Solution:** Reinstall hooks:
```bash
npx vibecraft setup
```

Then restart Claude Code.

**Verify hooks are configured:**
```bash
cat ~/.claude/settings.json | grep vibecraft
```

Should show paths to vibecraft hook scripts.
