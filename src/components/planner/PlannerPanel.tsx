/**
 * PlannerPanel - AI-powered goal decomposition UI
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { usePlannerStore } from '../../stores/plannerStore'
import { useTodosStore } from '../../stores/todosStore'
import { useAppStore } from '../../stores'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
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
import { ChevronDown, Loader2, Sparkles, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StopEvent } from '@shared/types'

interface PlannerPanelProps {
  apiUrl?: string
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

  const [goal, setGoal] = useState('')
  const [targetSessionId, setTargetSessionId] = useState('')
  const [waitingForResponse, setWaitingForResponse] = useState(false)
  const [manualResponse, setManualResponse] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [showManualInput, setShowManualInput] = useState(false)
  const lastEventIdRef = useRef<string | null>(null)

  useEffect(() => {
    setApiUrl(apiUrl)
    fetchStatus()
  }, [apiUrl, setApiUrl, fetchStatus])

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

  useEffect(() => {
    if (!waitingForResponse || !targetSessionId) return
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
        parseResponse(latestStop.response)
      }
    }
  }, [eventHistory, waitingForResponse, targetSessionId, managedSessions, parseResponse])

  const handlePlan = useCallback(async () => {
    if (!goal.trim() || !targetSessionId || !onSendPrompt) return
    const prompt = await buildPrompt({ goal: goal.trim() })
    if (!prompt) return

    if (eventHistory.length > 0) {
      lastEventIdRef.current = eventHistory[eventHistory.length - 1].id
    }

    const result = await onSendPrompt(targetSessionId, prompt)
    if (result.ok) {
      setWaitingForResponse(true)
    } else {
      clearError()
      usePlannerStore.setState({ error: result.error || 'Failed to send prompt' })
    }
  }, [goal, targetSessionId, onSendPrompt, buildPrompt, eventHistory, clearError])

  const handleManualParse = useCallback(async () => {
    if (!manualResponse.trim()) return
    await parseResponse(manualResponse.trim())
    setManualResponse('')
    setWaitingForResponse(false)
    setShowManualInput(false)
  }, [manualResponse, parseResponse])

  const handleCreateTodos = useCallback(async () => {
    if (!targetSessionId) return
    const success = await createTodos(targetSessionId, false)
    if (success) {
      loadTodos()
      setGoal('')
      setIsOpen(false)
    }
  }, [targetSessionId, createTodos, loadTodos])

  const handleCancel = useCallback(() => {
    clearPreview()
    clearError()
    setWaitingForResponse(false)
    setManualResponse('')
    setShowManualInput(false)
    reset()
  }, [clearPreview, clearError, reset])

  const activeSessions = managedSessions.filter((s) => s.status !== 'offline')
  const isProcessing = isBuildingPrompt || isParsingResponse || waitingForResponse

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 bg-secondary/30 hover:bg-secondary/50 border-b border-border transition-colors">
        <div className="flex items-center gap-3">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-medium text-sm">AI Planner</span>
          {waitingForResponse && (
            <span className="flex items-center gap-1.5 text-xs text-primary">
              <Loader2 className="h-3 w-3 animate-spin" />
              Working...
            </span>
          )}
          {planPreview && !waitingForResponse && (
            <span className="flex items-center gap-1 text-xs text-green-500">
              <CheckCircle2 className="h-3 w-3" />
              Ready
            </span>
          )}
        </div>
        <ChevronDown className={cn(
          "h-4 w-4 text-muted-foreground transition-transform duration-200",
          isOpen && "rotate-180"
        )} />
      </CollapsibleTrigger>

      <CollapsibleContent>
        <div className="p-4 space-y-4 bg-secondary/20 border-b border-border">

          {/* Input Form */}
          {!generatedPrompt && !planPreview && !waitingForResponse && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  What do you want to accomplish?
                </label>
                <Textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="e.g., Add user authentication with JWT tokens"
                  rows={3}
                  disabled={isProcessing}
                  className="bg-background"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Target Session
                </label>
                {activeSessions.length === 0 ? (
                  <p className="text-sm text-destructive">
                    No active sessions available.
                  </p>
                ) : (
                  <Select value={targetSessionId} onValueChange={setTargetSessionId} disabled={isProcessing}>
                    <SelectTrigger className="bg-background">
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
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <Button
                onClick={handlePlan}
                disabled={!goal.trim() || isProcessing || activeSessions.length === 0 || !onSendPrompt}
                className="w-full"
              >
                {isBuildingPrompt ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Building prompt...
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Plan
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Waiting State */}
          {waitingForResponse && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-md bg-primary/10 border border-primary/20">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <div>
                  <p className="font-medium">Generating plan...</p>
                  <p className="text-sm text-muted-foreground">
                    Claude is breaking down your goal into tasks.
                  </p>
                </div>
              </div>

              <Collapsible open={showManualInput} onOpenChange={setShowManualInput}>
                <CollapsibleTrigger className="text-sm text-muted-foreground hover:text-foreground underline">
                  Response not detected? Paste manually
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-3 space-y-3">
                  <Textarea
                    value={manualResponse}
                    onChange={(e) => setManualResponse(e.target.value)}
                    placeholder="Paste Claude's JSON response..."
                    rows={4}
                    className="font-mono text-sm bg-background"
                  />
                  <Button
                    variant="secondary"
                    onClick={handleManualParse}
                    disabled={!manualResponse.trim() || isParsingResponse}
                  >
                    {isParsingResponse ? 'Parsing...' : 'Parse Response'}
                  </Button>
                </CollapsibleContent>
              </Collapsible>

              <Button variant="outline" onClick={handleCancel} className="w-full">
                Cancel
              </Button>
            </div>
          )}

          {/* Plan Preview */}
          {planPreview && (
            <div className="space-y-4">
              <div className="rounded-md border border-border bg-background p-4 space-y-4">
                <div>
                  <h3 className="font-semibold mb-1">Plan Summary</h3>
                  <p className="text-sm text-muted-foreground">{planPreview.summary}</p>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">
                    Tasks ({planPreview.todos.length})
                  </h4>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                    {planPreview.todos.map((task, index) => (
                      <div
                        key={index}
                        className="flex gap-3 p-3 rounded-md bg-secondary/50 border border-border"
                      >
                        <span className="text-sm font-mono text-muted-foreground shrink-0 w-6">
                          {index + 1}.
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{task.text}</p>
                          {task.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {task.description}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-destructive text-sm">
                  <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex gap-3">
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
                  {isCreatingTodos ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Create Todos
                    </>
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
