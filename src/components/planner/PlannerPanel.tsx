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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '../ui/collapsible'
import { ScrollArea } from '../ui/scroll-area'
import { ChevronDown, Loader2, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
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
  const [isOpen, setIsOpen] = useState(false)
  const [showManualInput, setShowManualInput] = useState(false)
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
    setShowManualInput(false)
  }, [manualResponse, parseResponse])

  // Create todos from plan
  const handleCreateTodos = useCallback(async () => {
    if (!targetSessionId) return

    const success = await createTodos(targetSessionId, false)
    if (success) {
      loadTodos()
      setGoal('')
      setIsOpen(false)
    }
  }, [targetSessionId, createTodos, loadTodos])

  // Cancel/reset
  const handleCancel = useCallback(() => {
    clearPreview()
    clearError()
    setWaitingForResponse(false)
    setManualResponse('')
    setShowManualInput(false)
    reset()
  }, [clearPreview, clearError, reset])

  // Get active sessions
  const activeSessions = managedSessions.filter((s) => s.status !== 'offline')
  const isProcessing = isBuildingPrompt || isParsingResponse || waitingForResponse

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
      className="border-b border-border bg-card/50"
    >
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent/50 transition-colors">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium">AI Planner</span>
            {(waitingForResponse || planPreview) && (
              <Badge variant={waitingForResponse ? 'default' : 'secondary'} className="text-[10px] px-1.5 py-0">
                {waitingForResponse ? 'working' : 'ready'}
              </Badge>
            )}
          </div>
          <ChevronDown className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            isOpen && "rotate-180"
          )} />
        </button>
      </CollapsibleTrigger>

      <CollapsibleContent className="px-3 pb-3">
        <div className="space-y-3 pt-2">
          {/* Goal input (when no prompt/preview) */}
          {!generatedPrompt && !planPreview && !waitingForResponse && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="goal" className="text-xs">
                  What do you want to accomplish?
                </Label>
                <Textarea
                  id="goal"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g., Add user authentication with JWT tokens"
                  rows={2}
                  className="resize-none text-sm"
                  disabled={isProcessing}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="session" className="text-xs">
                  Claude Code Session
                </Label>
                {activeSessions.length === 0 ? (
                  <p className="text-xs text-destructive py-1">
                    No active sessions. Start a session first.
                  </p>
                ) : (
                  <Select
                    value={targetSessionId}
                    onValueChange={setTargetSessionId}
                    disabled={isProcessing}
                  >
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select a session" />
                    </SelectTrigger>
                    <SelectContent>
                      {activeSessions.map((session) => (
                        <SelectItem key={session.id} value={session.id}>
                          {session.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {error && (
                <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive">
                  {error}
                </div>
              )}

              <Button
                onClick={handlePlan}
                disabled={!goal.trim() || isProcessing || activeSessions.length === 0 || !onSendPrompt}
                size="sm"
                className="w-full"
              >
                {isBuildingPrompt ? (
                  <>
                    <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                    Building...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-3 w-3" />
                    Generate Plan
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Waiting for Claude's response */}
          {waitingForResponse && (
            <div className="space-y-3">
              <Card className="bg-muted/30">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    <span>Waiting for Claude to generate a plan...</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1.5">
                    This will update automatically when Claude responds.
                  </p>
                </CardContent>
              </Card>

              {/* Manual response input (fallback) */}
              <Collapsible open={showManualInput} onOpenChange={setShowManualInput}>
                <CollapsibleTrigger className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  Response not detected? Paste manually
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2 space-y-2">
                  <Textarea
                    value={manualResponse}
                    onChange={(e) => setManualResponse(e.target.value)}
                    placeholder="Paste Claude's JSON response here..."
                    rows={3}
                    className="resize-none font-mono text-xs"
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleManualParse}
                    disabled={!manualResponse.trim() || isParsingResponse}
                  >
                    {isParsingResponse ? 'Parsing...' : 'Parse Response'}
                  </Button>
                </CollapsibleContent>
              </Collapsible>

              <Button variant="outline" size="sm" onClick={handleCancel} className="w-full">
                Cancel
              </Button>
            </div>
          )}

          {/* Plan preview */}
          {planPreview && (
            <div className="space-y-3">
              <Card className="bg-muted/30">
                <CardHeader className="p-3 pb-2">
                  <CardTitle className="text-sm">Plan Preview</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  {/* Summary */}
                  <p className="text-xs text-muted-foreground">
                    {planPreview.summary}
                  </p>

                  {/* Tasks */}
                  <div className="space-y-1.5">
                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      Tasks ({planPreview.todos.length})
                    </Label>
                    <ScrollArea className="max-h-32">
                      <div className="space-y-1">
                        {planPreview.todos.map((task, index) => (
                          <div
                            key={index}
                            className="p-1.5 bg-background/50 rounded text-xs"
                          >
                            <div className="flex items-start gap-1.5">
                              <span className="text-muted-foreground font-mono text-[10px] mt-0.5">
                                {index + 1}.
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="font-medium leading-tight">{task.text}</p>
                                {task.description && (
                                  <p className="text-muted-foreground text-[10px] mt-0.5 line-clamp-2">
                                    {task.description}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                </CardContent>
              </Card>

              {error && (
                <div className="p-2 bg-destructive/10 border border-destructive/20 rounded-md text-xs text-destructive">
                  {error}
                </div>
              )}

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancel}
                  disabled={isCreatingTodos}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleCreateTodos}
                  disabled={isCreatingTodos}
                  className="flex-1"
                >
                  {isCreatingTodos ? (
                    <>
                      <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    'Create Todos'
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
