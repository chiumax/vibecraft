/**
 * AboutModal - Information about Vibecraft (shadcn/ui version)
 *
 * Shows version info, commands, and troubleshooting tips.
 */

import { useEffect, useState } from 'react'
import { useAppStore } from '../../stores'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Badge } from '../ui/badge'

export function AboutModal() {
  const [version, setVersion] = useState<string>('...')
  const activeModal = useAppStore((s) => s.activeModal)
  const hideModal = useAppStore((s) => s.hideModal)

  const isOpen = activeModal === 'about'

  // Fetch version when modal opens
  useEffect(() => {
    if (!isOpen) return

    fetch('/health')
      .then((res) => res.json())
      .then((health) => {
        setVersion(`v${health.version || 'unknown'}`)
      })
      .catch(() => {
        setVersion('v?')
      })
  }, [isOpen])

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hideModal()}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Vibecraft</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Description */}
          <div className="space-y-2 text-sm">
            <p>Vibecraft is a 3D visualization app for Claude Code.</p>
            <p>
              Watch and manage your claudes in real-time - now featuring hexagonal grids!
            </p>
            <p className="text-muted-foreground text-xs">
              Vibecraft syncs with claude code instances running on your own machine.
              No files or code are sent to the web server.
            </p>
          </div>

          {/* Commands */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Commands</h4>
            <div className="space-y-1.5">
              <CommandRow cmd="npx vibecraft" desc="Start server" />
              <CommandRow cmd="npx vibecraft doctor" desc="Diagnose issues" />
              <CommandRow cmd="npx vibecraft setup" desc="Reinstall hooks" />
              <CommandRow cmd="npx vibecraft uninstall" desc="Remove hooks" />
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Troubleshooting</h4>
            <p className="text-xs text-muted-foreground">
              If a zone gets stuck, Claude Code may be waiting for input or in an unknown state.
              Attach to the tmux session to see what's happening:
            </p>
            <div className="space-y-1.5">
              <CommandRow cmd="tmux ls" desc="List sessions" />
              <CommandRow cmd="tmux attach -t session" desc="Attach to session" />
            </div>
          </div>

          {/* Voice Input */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Voice Input</h4>
            <p className="text-xs text-muted-foreground">
              To enable voice input, add your Deepgram API key to <code className="text-xs bg-muted px-1 py-0.5 rounded">.env</code>:
            </p>
            <div className="space-y-1.5">
              <CommandRow cmd="DEEPGRAM_API_KEY=your_key_here" />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-center gap-2 pt-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-xs font-mono">
              {version}
            </Badge>
            <span>·</span>
            <span>Elysian Labs</span>
          </div>
        </div>

        <div className="flex justify-end mt-2">
          <Button variant="outline" onClick={hideModal}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function CommandRow({ cmd, desc }: { cmd: string; desc?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{cmd}</code>
      {desc && <span className="text-xs text-muted-foreground">{desc}</span>}
    </div>
  )
}
