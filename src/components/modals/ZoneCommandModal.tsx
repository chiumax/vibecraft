/**
 * ZoneCommandModal - Quick command input for a specific zone (shadcn/ui version)
 *
 * A minimal, elegant prompt that appears near the 3D zone
 * and sends commands directly to that zone's session.
 */

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import * as THREE from 'three'
import { useAppStore, getAppState } from '../../stores'
import { soundManager } from '../../audio/SoundManager'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

export interface ZoneCommandModalData {
  sessionId: string
  sessionName: string
  sessionColor: number
  zonePosition: THREE.Vector3
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  onSend: (sessionId: string, prompt: string) => Promise<{ ok: boolean; error?: string }>
}

export function ZoneCommandModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const rawModalData = useAppStore((s) => s.modalData)
  const hideModal = useAppStore((s) => s.hideModal)

  // Type-safe cast with validation
  const modalData = activeModal === 'zoneCommand' && rawModalData?.sessionId
    ? (rawModalData as unknown as ZoneCommandModalData)
    : undefined

  const [prompt, setPrompt] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [connectorStyle, setConnectorStyle] = useState<React.CSSProperties>({})
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const isOpen = activeModal === 'zoneCommand'

  // Position modal near the 3D zone
  useEffect(() => {
    if (!isOpen || !modalData) return

    const updatePosition = () => {
      const { zonePosition, camera, renderer } = modalData

      // Project 3D position to screen
      const pos = zonePosition.clone()
      pos.y += 2 // Slightly above the zone
      pos.project(camera)

      // Convert to screen coordinates
      const canvas = renderer.domElement
      const screenX = (pos.x * 0.5 + 0.5) * canvas.clientWidth
      const screenY = (-pos.y * 0.5 + 0.5) * canvas.clientHeight

      // Position content with smart viewport clamping
      const contentWidth = 320
      const contentHeight = 100
      const margin = 20

      let x = screenX - contentWidth / 2
      let y = screenY - contentHeight - 30 // Above the zone

      // Clamp to viewport
      x = Math.max(margin, Math.min(window.innerWidth - contentWidth - margin, x))
      y = Math.max(margin, Math.min(window.innerHeight - contentHeight - margin, y))

      setPosition({ x, y })

      // Calculate connector style
      const contentCenterX = x + contentWidth / 2
      const contentBottomY = y + contentHeight

      const dx = screenX - contentCenterX
      const dy = screenY - contentBottomY
      const length = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) * (180 / Math.PI)

      const colorHex = `#${modalData.sessionColor.toString(16).padStart(6, '0')}`
      setConnectorStyle({
        width: `${length}px`,
        left: `${contentCenterX}px`,
        top: `${contentBottomY}px`,
        transform: `rotate(${angle}deg)`,
        transformOrigin: '0 0',
        background: `linear-gradient(90deg, ${colorHex}40, ${colorHex}00)`,
      })
    }

    updatePosition()
    soundManager.play('notification')

    // Focus input
    setTimeout(() => {
      textareaRef.current?.focus()
    }, 50)
  }, [isOpen, modalData])

  const handleSend = async () => {
    if (!modalData || isSending || !prompt.trim()) return

    setIsSending(true)

    try {
      const result = await modalData.onSend(modalData.sessionId, prompt.trim())

      if (result.ok) {
        soundManager.play('prompt')
        hideModal()
      } else {
        // Show error feedback
        textareaRef.current?.classList.add('border-red-500')
        setTimeout(() => {
          textareaRef.current?.classList.remove('border-red-500')
        }, 500)
      }
    } catch (err) {
      console.error('Failed to send command:', err)
      textareaRef.current?.classList.add('border-red-500')
      setTimeout(() => {
        textareaRef.current?.classList.remove('border-red-500')
      }, 500)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      hideModal()
    }
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      hideModal()
    }
  }

  if (!isOpen || !modalData) return null

  const colorHex = `#${modalData.sessionColor.toString(16).padStart(6, '0')}`

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={handleBackdropClick}
    >
      {/* Connector line */}
      <div
        className="absolute h-px pointer-events-none"
        style={connectorStyle}
      />

      {/* Modal content */}
      <div
        ref={contentRef}
        className="absolute w-80 bg-card/95 backdrop-blur-sm border border-border rounded-lg shadow-xl"
        style={{ left: position.x, top: position.y }}
      >
        <div className="p-3">
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full"
                style={{
                  backgroundColor: colorHex,
                  boxShadow: `0 0 10px ${colorHex}`,
                }}
              />
              <span
                className="text-sm font-medium"
                style={{ color: colorHex }}
              >
                {modalData.sessionName}
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              Enter to send
            </span>
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <Textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => {
                setPrompt(e.target.value)
                // Auto-expand
                e.target.style.height = 'auto'
                e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px'
              }}
              onKeyDown={handleKeyDown}
              placeholder="Command..."
              rows={1}
              disabled={isSending}
              className="flex-1 resize-none min-h-[36px] text-sm transition-colors"
            />
            <Button
              size="sm"
              onClick={handleSend}
              disabled={isSending || !prompt.trim()}
              className="px-3"
            >
              {isSending ? (
                <span className="animate-spin">↻</span>
              ) : (
                <span>↗</span>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
