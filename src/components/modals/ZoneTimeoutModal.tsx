/**
 * ZoneTimeoutModal - Shown when zone creation takes too long (shadcn/ui version)
 *
 * Displays troubleshooting tips when a zone doesn't respond.
 */

import { useAppStore } from '../../stores'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'

export function ZoneTimeoutModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const hideModal = useAppStore((s) => s.hideModal)

  const isOpen = activeModal === 'zoneTimeout'

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hideModal()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>Zone Not Responding</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The zone is taking longer than expected to start. Claude Code may be
            stuck or waiting for input.
          </p>

          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Troubleshooting</h4>
            <div className="space-y-1.5">
              <CommandRow cmd="tmux ls" desc="List sessions" />
              <CommandRow cmd="tmux attach -t session" desc="See what's happening" />
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Also ensure your Claude Code is up to date.
          </p>
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

function CommandRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{cmd}</code>
      <span className="text-xs text-muted-foreground">{desc}</span>
    </div>
  )
}
