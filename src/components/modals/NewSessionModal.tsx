/**
 * NewSessionModal - Create a new Claude session/zone (shadcn/ui version)
 *
 * Allows users to configure a new Claude session with directory,
 * name, and command options.
 */

import { useState, useEffect, type KeyboardEvent } from 'react'
import { useAppStore } from '../../stores'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Checkbox } from '../ui/checkbox'
import { DirectoryAutocomplete } from '../ui/directory-autocomplete'

export interface NewSessionModalData {
  defaultCwd?: string
  onCreate?: (options: NewSessionOptions) => Promise<void>
}

export interface NewSessionOptions {
  name: string
  cwd: string
  continueSession: boolean
  skipPermissions: boolean
  chrome: boolean
}

export function NewSessionModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData) as NewSessionModalData | undefined
  const hideModal = useAppStore((s) => s.hideModal)
  const serverCwd = useAppStore((s) => s.serverCwd)

  const [cwd, setCwd] = useState('')
  const [name, setName] = useState('')
  const [continueSession, setContinueSession] = useState(false)
  const [skipPermissions, setSkipPermissions] = useState(true)
  const [chrome, setChrome] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  const isOpen = activeModal === 'newSession'
  const defaultCwd = modalData?.defaultCwd ?? serverCwd

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setCwd('')
      setName('')
      setContinueSession(false)
      setSkipPermissions(true)
      setChrome(false)
      setIsCreating(false)
    }
  }, [isOpen])

  // Auto-fill name from directory
  useEffect(() => {
    if (cwd && !name) {
      const parts = cwd.split('/')
      const lastPart = parts[parts.length - 1]
      if (lastPart) {
        setName(lastPart)
      }
    }
  }, [cwd, name])

  const handleCreate = async () => {
    if (isCreating) return

    setIsCreating(true)

    try {
      await modalData?.onCreate?.({
        name: name || 'New Zone',
        cwd: cwd || defaultCwd,
        continueSession,
        skipPermissions,
        chrome,
      })
      hideModal()
    } catch (e) {
      console.error('Failed to create session:', e)
    } finally {
      setIsCreating(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCreate()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && hideModal()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>New Zone</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="session-cwd-input">Directory</Label>
            <DirectoryAutocomplete
              id="session-cwd-input"
              value={cwd}
              onChange={setCwd}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.defaultPrevented) {
                  handleKeyDown(e as unknown as KeyboardEvent)
                }
              }}
            />
            <p className="text-xs text-muted-foreground">
              Default: <code className="bg-muted px-1 py-0.5 rounded">{defaultCwd}</code>
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="session-name-input">Name</Label>
            <Input
              type="text"
              id="session-name-input"
              placeholder="Auto-filled from directory..."
              autoComplete="off"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>

          <div className="space-y-2">
            <Label>Options</Label>
            <div className="space-y-3 pl-1">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="continue-session"
                  checked={continueSession}
                  onCheckedChange={(checked) => setContinueSession(checked === true)}
                />
                <Label htmlFor="continue-session" className="text-sm font-normal cursor-pointer">
                  Continue <code className="text-xs bg-muted px-1 py-0.5 rounded">-c</code>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="skip-permissions"
                  checked={skipPermissions}
                  onCheckedChange={(checked) => setSkipPermissions(checked === true)}
                />
                <Label htmlFor="skip-permissions" className="text-sm font-normal cursor-pointer">
                  Skip permissions{' '}
                  <code className="text-xs bg-muted px-1 py-0.5 rounded">--dangerously-skip-permissions</code>
                </Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="chrome"
                  checked={chrome}
                  onCheckedChange={(checked) => setChrome(checked === true)}
                />
                <Label htmlFor="chrome" className="text-sm font-normal cursor-pointer">
                  Chrome <code className="text-xs bg-muted px-1 py-0.5 rounded">--chrome</code>
                </Label>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={hideModal} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isCreating}>
            {isCreating ? 'Creating...' : '+ Create'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
