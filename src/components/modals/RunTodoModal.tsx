/**
 * RunTodoModal - Modal to select target session for running a todo
 *
 * Allows user to select an existing session or create a new one,
 * optionally add context prefix, and execute the todo as a prompt.
 */

import { useState, useEffect } from 'react'
import { useAppStore, getAppState } from '../../stores'
import { useTodosStore } from '../../stores/todosStore'
import { soundManager } from '../../audio/SoundManager'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import type { Todo, ManagedSession } from '@shared/types'

export interface RunTodoModalData {
  todo: Todo
  sessionId: string
  sessionName: string
}

export function RunTodoModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const rawModalData = useAppStore((s) => s.modalData)
  const hideModal = useAppStore((s) => s.hideModal)
  const managedSessions = useAppStore((s) => s.managedSessions)

  // Type-safe cast with validation
  const modalData = activeModal === 'runTodo' && rawModalData?.todo
    ? (rawModalData as unknown as RunTodoModalData)
    : undefined

  const isOpen = activeModal === 'runTodo'

  // Form state
  const [targetSessionId, setTargetSessionId] = useState<string>('')
  const [contextPrefix, setContextPrefix] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initialize with first non-offline session
  useEffect(() => {
    if (isOpen && managedSessions.length > 0 && !targetSessionId) {
      const activeSession = managedSessions.find(s => s.status !== 'offline')
      if (activeSession) {
        setTargetSessionId(activeSession.id)
      } else {
        setTargetSessionId(managedSessions[0].id)
      }
    }
  }, [isOpen, managedSessions, targetSessionId])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setContextPrefix('')
      setError(null)
    }
  }, [isOpen])

  const handleClose = () => {
    const state = getAppState()
    if (state.soundEnabled) {
      soundManager.play('modal_cancel')
    }
    setTargetSessionId('')
    hideModal()
  }

  const handleRun = async () => {
    if (!modalData || !targetSessionId) return

    setIsSubmitting(true)
    setError(null)

    try {
      const { port } = getAppState()
      const apiUrl = `http://localhost:${port}`

      const response = await fetch(
        `${apiUrl}/todos/${modalData.sessionId}/${modalData.todo.id}/execute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionId: targetSessionId,
            contextPrefix: contextPrefix.trim() || undefined,
          }),
        }
      )

      const data = await response.json()

      if (!data.ok) {
        setError(data.error || 'Failed to execute todo')
        return
      }

      // Success - play sound and close
      const state = getAppState()
      if (state.soundEnabled) {
        soundManager.play('prompt')
      }

      // Reload todos to get updated status
      useTodosStore.getState().loadTodos()

      hideModal()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!modalData) return null

  const { todo, sessionName } = modalData

  // Filter to active sessions
  const activeSessions = managedSessions.filter(s => s.status !== 'offline')

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[450px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Run Todo</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Todo preview */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Todo</Label>
            <div className="p-3 bg-muted rounded-md text-sm">
              {todo.text}
            </div>
            <p className="text-xs text-muted-foreground">
              From workspace: {sessionName}
            </p>
          </div>

          {/* Target session */}
          <div className="space-y-2">
            <Label htmlFor="target-session">Send to Session</Label>
            {activeSessions.length === 0 ? (
              <p className="text-sm text-destructive">
                No active sessions. Please start a session first.
              </p>
            ) : (
              <select
                id="target-session"
                value={targetSessionId}
                onChange={(e) => setTargetSessionId(e.target.value)}
                className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              >
                {activeSessions.map((session) => (
                  <option key={session.id} value={session.id}>
                    {session.name} ({session.status})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Context prefix */}
          <div className="space-y-2">
            <Label htmlFor="context-prefix">
              Context (optional)
              <span className="text-muted-foreground font-normal ml-2">
                Prepended to the todo
              </span>
            </Label>
            <Textarea
              id="context-prefix"
              value={contextPrefix}
              onChange={(e) => setContextPrefix(e.target.value)}
              placeholder="Additional instructions or context..."
              rows={3}
              className="resize-none"
            />
          </div>

          {/* Error message */}
          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleRun}
            disabled={isSubmitting || activeSessions.length === 0}
          >
            {isSubmitting ? 'Running...' : 'Run'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
