/**
 * PlannerPanel - AI-powered goal decomposition UI
 *
 * Uses Claude Code sessions for planning - no separate API key needed.
 * Flow:
 * 1. User enters a goal
 * 2. We build a planning prompt and send it to a Claude Code session
 * 3. When Claude responds (stop event), we parse the response
 * 4. User reviews the plan and creates todos
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePlannerStore } from '../../stores/plannerStore'
import { useTodosStore } from '../../stores/todosStore'
import { useAppStore } from '../../stores'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Badge } from '../ui/badge'
import type { StopEvent } from '@shared/types'

interface PlannerPanelProps {
  /** API URL for requests */
  apiUrl?: string
  /** Callback to send prompt to a session */
  onSendPrompt?: (sessionId: string, prompt: string) => Promise<{ ok: boolean; error?: string }>
}

export function PlannerPanel({ apiUrl = '/api', onSendPrompt }: PlannerPanelProps) {
  const managedSessions = useAppStore((s) => s.managedSessions)
  const eventHistory = useAppStore((s) => s.eventHistory)
  const loadTodos = useTodosStore((s) => s.loadTodos)

  const {
    state,
    planPreview,
    generatedPrompt,
    isBuildingPrompt,
    isParsingResponse,
    isCreatingTodos,
    error,
    setApiUrl,
    fetchStatus,
    buildPrompt,
    parseResponse,
    createTodos,
    clearPreview,
    reset,
    clearError,
  } = usePlannerStore()

  // Form state
  const [goal, setGoal] = useState('')
  const [targetSessionId, setTargetSessionId] = useState('')
  const [waitingForResponse, setWaitingForResponse] = useState(false)
  const [manualResponse, setManualResponse] = useState('')
  const lastEventIdRef = useRef<string | null>(null)

  // Initialize
  useEffect(() => {
    setApiUrl(apiUrl)
    fetchStatus()
  }, [apiUrl, setApiUrl, fetchStatus])

  // Set default session
  useEffect(() => {
    if (managedSessions.length > 0 && !targetSessionId) {
      const activeSession = managedSessions.find((s) => s.status !== 'offline')
      if (activeSession) {
        setTargetSessionId(activeSession.id)
      } else if (managedSessions[0]) {
        setTargetSessionId(managedSessions[0].id)
      }
    }
  }, [managedSessions, targetSessionId])

  // Watch for stop events when waiting for response
  useEffect(() => {
    if (!waitingForResponse || !targetSessionId) return

    // Find the most recent stop event for our session
    const session = managedSessions.find(s => s.id === targetSessionId)
    if (!session?.claudeSessionId) return

    const stopEvents = eventHistory.filter(
      (e): e is StopEvent =>
        e.type === 'stop' &&
        e.sessionId === session.claudeSessionId &&
        e.id !== lastEventIdRef.current
    )

    if (stopEvents.length > 0) {
      const latestStop = stopEvents[stopEvents.length - 1]
      if (latestStop.response) {
        lastEventIdRef.current = latestStop.id
        setWaitingForResponse(false)
        // Auto-parse the response
        parseResponse(latestStop.response)
      }
    }
  }, [eventHistory, waitingForResponse, targetSessionId, managedSessions, parseResponse])

  // Build and send prompt to session
  const handlePlan = useCallback(async () => {
    if (!goal.trim() || !targetSessionId || !onSendPrompt) return

    // Build the prompt
    const prompt = await buildPrompt({ goal: goal.trim() })
    if (!prompt) return

    // Remember the last event ID to detect new stop events
    if (eventHistory.length > 0) {
      lastEventIdRef.current = eventHistory[eventHistory.length - 1].id
    }

    // Send to Claude Code session
    const result = await onSendPrompt(targetSessionId, prompt)
    if (result.ok) {
      setWaitingForResponse(true)
    } else {
      clearError()
      usePlannerStore.setState({ error: result.error || 'Failed to send prompt' })
    }
  }, [goal, targetSessionId, onSendPrompt, buildPrompt, eventHistory, clearError])

  // Manual parse (if auto-parse doesn't work)
  const handleManualParse = useCallback(async () => {
    if (!manualResponse.trim()) return
    await parseResponse(manualResponse.trim())
    setManualResponse('')
    setWaitingForResponse(false)
  }, [manualResponse, parseResponse])

  // Create todos from plan
  const handleCreateTodos = useCallback(async () => {
    if (!targetSessionId) return

    const success = await createTodos(targetSessionId, false)
    if (success) {
      loadTodos()
      setGoal('')
    }
  }, [targetSessionId, createTodos, loadTodos])

  // Cancel/reset
  const handleCancel = useCallback(() => {
    clearPreview()
    clearError()
    setWaitingForResponse(false)
    setManualResponse('')
    reset()
  }, [clearPreview, clearError, reset])

  // Get active sessions
  const activeSessions = managedSessions.filter((s) => s.status !== 'offline')
  const isProcessing = isBuildingPrompt || isParsingResponse || waitingForResponse

  return (
    <div className="planner-panel p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">AI Planner</h3>
        <Badge variant={state.status === 'idle' ? 'secondary' : 'default'}>
          {waitingForResponse ? 'waiting' : state.status}
        </Badge>
      </div>

      {/* Goal input (when no prompt/preview) */}
      {!generatedPrompt && !planPreview && !waitingForResponse && (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="goal">What do you want to accomplish?</Label>
            <Textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g., Add user authentication with JWT tokens"
              rows={3}
              className="resize-none"
              disabled={isProcessing}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="session">Claude Code Session</Label>
            <select
              id="session"
              value={targetSessionId}
              onChange={(e) => setTargetSessionId(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm"
              disabled={isProcessing || activeSessions.length === 0}
            >
              {activeSessions.map((session) => (
                <option key={session.id} value={session.id}>
                  {session.name}
                </option>
              ))}
            </select>
            {activeSessions.length === 0 && (
              <p className="text-xs text-destructive">
                No active sessions. Start a session first.
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            This will send a planning prompt to the selected Claude Code session.
            Claude will generate a task breakdown that you can review and add to your todos.
          </p>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              {error}
            </div>
          )}

          <Button
            onClick={handlePlan}
            disabled={!goal.trim() || isProcessing || activeSessions.length === 0 || !onSendPrompt}
            className="w-full"
          >
            {isBuildingPrompt ? 'Building...' : 'Generate Plan'}
          </Button>
        </div>
      )}

      {/* Waiting for Claude's response */}
      {waitingForResponse && (
        <div className="space-y-3">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-sm">
                <span className="animate-spin">⚙️</span>
                <span>Waiting for Claude to generate a plan...</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Claude is working on breaking down your goal into tasks.
                This will update automatically when Claude responds.
              </p>
            </CardContent>
          </Card>

          {/* Manual response input (fallback) */}
          <details className="text-sm">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
              Response not detected? Paste manually
            </summary>
            <div className="mt-2 space-y-2">
              <Textarea
                value={manualResponse}
                onChange={(e) => setManualResponse(e.target.value)}
                placeholder="Paste Claude's JSON response here..."
                rows={4}
                className="resize-none font-mono text-xs"
              />
              <Button
                size="sm"
                onClick={handleManualParse}
                disabled={!manualResponse.trim() || isParsingResponse}
              >
                {isParsingResponse ? 'Parsing...' : 'Parse Response'}
              </Button>
            </div>
          </details>

          <Button variant="outline" onClick={handleCancel} className="w-full">
            Cancel
          </Button>
        </div>
      )}

      {/* Plan preview */}
      {planPreview && (
        <div className="space-y-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Plan Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Summary */}
              <p className="text-sm text-muted-foreground">
                {planPreview.summary}
              </p>

              {/* Tasks */}
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">
                  Tasks ({planPreview.todos.length})
                </Label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {planPreview.todos.map((task, index) => (
                    <div
                      key={index}
                      className="p-2 bg-muted/50 rounded text-xs"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-muted-foreground font-mono">
                          {index + 1}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium">{task.text}</p>
                          {task.description && (
                            <p className="text-muted-foreground mt-0.5">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {error && (
            <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-sm text-destructive">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleCancel}
              disabled={isCreatingTodos}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateTodos}
              disabled={isCreatingTodos}
              className="flex-1"
            >
              {isCreatingTodos ? 'Creating...' : 'Create Todos'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
