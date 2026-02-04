/**
 * PermissionModal - Tool permission request UI (shadcn/ui version)
 *
 * Displays permission prompts when Claude sessions run without
 * --dangerously-skip-permissions and need user approval for tools.
 *
 * Note: This modal does NOT close on escape or backdrop click - user MUST select an option.
 */

import { useEffect, useState } from 'react'
import { useAppStore, getAppState } from '../../stores'
import { soundManager } from '../../audio/SoundManager'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Badge } from '../ui/badge'
import type { ManagedSession } from '@shared/types'

export interface PermissionOption {
  number: string
  label: string
}

export interface PermissionModalData {
  sessionId: string
  tool: string
  context: string
  options: PermissionOption[]
  apiUrl: string
  getManagedSessions: () => ManagedSession[]
}

export function PermissionModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const rawModalData = useAppStore((s) => s.modalData)
  const hideModal = useAppStore((s) => s.hideModal)

  // Type-safe cast with validation
  const modalData = activeModal === 'permission' && rawModalData?.sessionId
    ? (rawModalData as unknown as PermissionModalData)
    : undefined

  const [isSending, setIsSending] = useState(false)

  const isOpen = activeModal === 'permission'

  // Handle keyboard shortcuts (1-9 to select options)
  useEffect(() => {
    if (!isOpen || !modalData) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (/^[1-9]$/.test(e.key)) {
        const option = modalData.options.find((o) => o.number === e.key)
        if (option) {
          e.preventDefault()
          sendResponse(option.number)
        }
      }
      // NOTE: No Escape handler - user MUST select an option
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, modalData])

  // Play sound and set attention when modal opens
  useEffect(() => {
    if (isOpen && modalData) {
      const state = getAppState()
      if (state.soundEnabled) {
        soundManager.play('notification')
      }

      // Set zone attention
      const managed = modalData.getManagedSessions().find((s) => s.id === modalData.sessionId)
      if (managed?.claudeSessionId && state.scene) {
        state.scene.setZoneAttention(managed.claudeSessionId, 'question')
        state.scene.setZoneStatus(managed.claudeSessionId, 'attention')
      }

      // Add to attention queue
      state.attentionSystem?.add(modalData.sessionId)
    }
  }, [isOpen, modalData])

  const sendResponse = async (response: string) => {
    if (!modalData || isSending) return

    setIsSending(true)

    try {
      await fetch(`${modalData.apiUrl}/sessions/${modalData.sessionId}/permission`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ response }),
      })
    } catch (e) {
      console.error('Failed to send permission response:', e)
    }

    handleClose()
  }

  const handleClose = () => {
    // Clear attention
    if (modalData) {
      const state = getAppState()
      const managed = modalData.getManagedSessions().find((s) => s.id === modalData.sessionId)
      if (managed?.claudeSessionId && state.scene) {
        state.scene.clearZoneAttention(managed.claudeSessionId)
        state.scene.setZoneStatus(managed.claudeSessionId, 'working')
      }
      state.attentionSystem?.remove(modalData.sessionId)
    }

    setIsSending(false)
    hideModal()
  }

  const handleOptionClick = (option: PermissionOption) => {
    sendResponse(option.number)
  }

  // Custom dialog that doesn't close on escape/overlay click
  return (
    <Dialog open={isOpen}>
      <DialogContent
        className="sm:max-w-[500px] bg-card border-border"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        // Hide the close button
        hideCloseButton
      >
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Badge variant="destructive" className="text-xs">
              Permission Required
            </Badge>
          </div>
          <DialogTitle>
            Allow <span className="text-primary">{modalData?.tool}</span>?
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground font-mono bg-muted/50 p-3 rounded-md overflow-auto max-h-32">
            {modalData?.context}
          </p>

          <div className="grid gap-2">
            {modalData?.options.map((opt) => (
              <button
                key={opt.number}
                type="button"
                className="flex items-center gap-3 p-3 text-left rounded-md border border-border bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-50"
                onClick={() => handleOptionClick(opt)}
                disabled={isSending}
              >
                <span className="flex items-center justify-center w-6 h-6 rounded bg-muted text-xs font-mono">
                  {opt.number}
                </span>
                <span className="text-sm">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
