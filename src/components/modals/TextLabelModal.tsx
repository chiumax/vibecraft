/**
 * TextLabelModal - Custom modal for text tile input (shadcn/ui version)
 *
 * Replaces browser's prompt() with a themed textarea modal
 * that supports multi-line input for longer text.
 */

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import { useAppStore } from '../../stores'
import { soundManager } from '../../audio/SoundManager'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

export interface TextLabelModalData {
  title?: string
  placeholder?: string
  initialText?: string
  maxLength?: number
  onSave?: (text: string | null) => void
}

export function TextLabelModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const modalData = useAppStore((s) => s.modalData) as TextLabelModalData
  const hideModal = useAppStore((s) => s.hideModal)

  const [text, setText] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const isOpen = activeModal === 'textLabel'
  const maxLength = modalData?.maxLength ?? 500
  const charCount = text.length
  const title = modalData?.title ?? 'Add Label'
  const placeholder = modalData?.placeholder ?? 'Enter your text here...'

  // Initialize text when modal opens
  useEffect(() => {
    if (isOpen) {
      setText(modalData?.initialText ?? '')
      soundManager.play('notification')
      // Focus and select
      setTimeout(() => {
        textareaRef.current?.focus()
        textareaRef.current?.select()
      }, 50)
    }
  }, [isOpen, modalData?.initialText])

  const handleSave = () => {
    const trimmedText = text.trim()
    modalData?.onSave?.(trimmedText || null)
    hideModal()
  }

  const handleCancel = () => {
    modalData?.onSave?.(null)
    hideModal()
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault()
      handleSave()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      handleCancel()
    }
  }

  // Character count color
  const getCharCountColor = () => {
    if (charCount > maxLength * 0.9) return 'text-red-400'
    if (charCount > maxLength * 0.7) return 'text-yellow-400'
    return 'text-muted-foreground'
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <Textarea
            ref={textareaRef}
            placeholder={placeholder}
            maxLength={maxLength}
            rows={4}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            className="resize-none"
          />
          <div className="flex items-center justify-between text-xs">
            <span className={getCharCountColor()}>
              {charCount}/{maxLength}
            </span>
            <span className="text-muted-foreground">
              Enter to save, Shift+Enter for newline
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-2">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
