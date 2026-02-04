/**
 * QuestionModal - AskUserQuestion tool UI (shadcn/ui version)
 *
 * Displays questions from Claude's AskUserQuestion tool
 * and sends responses back via the API.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import { useAppStore, getAppState } from '../../stores'
import { soundManager } from '../../audio/SoundManager'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Label } from '../ui/label'
import { Badge } from '../ui/badge'

export interface QuestionOption {
  label: string
  description?: string
}

export interface Question {
  question: string
  header: string
  options: QuestionOption[]
  multiSelect: boolean
}

export interface QuestionModalData {
  sessionId: string
  managedSessionId: string | null
  questions: Question[]
  apiUrl: string
}

// Queue for multiple questions
let questionQueue: QuestionModalData[] = []

export function QuestionModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const rawModalData = useAppStore((s) => s.modalData)
  const hideModal = useAppStore((s) => s.hideModal)
  const showModal = useAppStore((s) => s.showModal)

  // Type-safe cast with validation
  const modalData = activeModal === 'question' && rawModalData?.sessionId
    ? (rawModalData as unknown as QuestionModalData)
    : undefined

  const [customResponse, setCustomResponse] = useState('')
  const [isSending, setIsSending] = useState(false)
  const otherInputRef = useRef<HTMLTextAreaElement>(null)

  const isOpen = activeModal === 'question'
  const question = modalData?.questions?.[0]

  // Play sound and set attention when modal opens
  useEffect(() => {
    if (isOpen && modalData) {
      const state = getAppState()
      if (state.soundEnabled) {
        soundManager.play('notification')
      }

      // Set zone attention
      if (state.scene) {
        state.scene.setZoneAttention(modalData.sessionId, 'question')
        state.scene.setZoneStatus(modalData.sessionId, 'attention')
      }

      // Add to attention queue
      if (modalData.managedSessionId) {
        state.attentionSystem?.add(modalData.managedSessionId)
      }
    }
  }, [isOpen, modalData])

  const sendResponse = async (response: string) => {
    if (!modalData || isSending) return

    setIsSending(true)

    try {
      if (modalData.managedSessionId) {
        // Send to managed session
        await fetch(`${modalData.apiUrl}/sessions/${modalData.managedSessionId}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: response }),
        })
      } else {
        // Send to default tmux session
        await fetch(`${modalData.apiUrl}/prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: response, send: true }),
        })
      }
    } catch (e) {
      console.error('Failed to send question response:', e)
    }

    handleClose()
  }

  const handleClose = () => {
    // Clear attention
    if (modalData) {
      const state = getAppState()
      if (state.scene) {
        state.scene.setZoneStatus(modalData.sessionId, 'working')
        state.scene.clearZoneAttention(modalData.sessionId)
      }
      if (modalData.managedSessionId) {
        state.attentionSystem?.remove(modalData.managedSessionId)
      }
    }

    setIsSending(false)
    setCustomResponse('')

    // Check for queued questions
    if (questionQueue.length > 0) {
      const nextQuestion = questionQueue.shift()!
      console.log(`Showing next queued question (${questionQueue.length} remaining)`)
      setTimeout(() => {
        showModal('question', nextQuestion as unknown as Record<string, unknown>)
      }, 150)
    } else {
      hideModal()
    }
  }

  const handleOptionClick = (option: QuestionOption) => {
    sendResponse(option.label)
  }

  const handleSendCustom = () => {
    const text = customResponse.trim()
    if (text) {
      sendResponse(text)
    }
  }

  const handleCustomKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendCustom()
    }
  }

  // Queue indicator
  const queueCount = questionQueue.length
  const queueIndicator = queueCount > 0 ? ` (+${queueCount} more)` : ''

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="secondary" className="text-xs">
              {(question?.header || 'Question') + queueIndicator}
            </Badge>
          </div>
          <DialogTitle>Claude needs input</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm">{question?.question}</p>

          <div className="space-y-2">
            {question?.options.map((opt, idx) => (
              <button
                key={idx}
                className="w-full p-3 text-left rounded-md border border-border bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-50"
                onClick={() => handleOptionClick(opt)}
                disabled={isSending}
              >
                <span className="text-sm font-medium">{opt.label}</span>
                {opt.description && (
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    {opt.description}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="question-other-input" className="text-xs text-muted-foreground">
              Or type your own response:
            </Label>
            <Textarea
              ref={otherInputRef}
              id="question-other-input"
              placeholder="Type here..."
              rows={2}
              value={customResponse}
              onChange={(e) => setCustomResponse(e.target.value)}
              onKeyDown={handleCustomKeyDown}
              disabled={isSending}
              className="resize-none"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={handleClose} disabled={isSending}>
            Skip
          </Button>
          <Button onClick={handleSendCustom} disabled={isSending || !customResponse.trim()}>
            Send
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Add a question to the queue (for external use)
 */
export function queueQuestion(data: QuestionModalData): void {
  const state = getAppState()

  // If modal is already showing, queue this question
  if (state.activeModal === 'question') {
    console.log(`Question queued (${questionQueue.length + 1} in queue)`)
    questionQueue.push(data)

    // Still set zone attention for queued questions
    if (state.scene) {
      state.scene.setZoneAttention(data.sessionId, 'question')
      state.scene.setZoneStatus(data.sessionId, 'attention')
    }
    if (data.managedSessionId) {
      state.attentionSystem?.add(data.managedSessionId)
    }
    return
  }

  // Show immediately
  state.showModal('question', data as unknown as Record<string, unknown>)
}
