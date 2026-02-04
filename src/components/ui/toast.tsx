/**
 * Toast - React toast notification system
 *
 * Shows brief, non-blocking notifications at the bottom of the screen.
 * Auto-dismisses after a configurable duration.
 */

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/utils'

export type ToastType = 'info' | 'success' | 'warning' | 'error'

export interface ToastData {
  id: string
  message: string
  type: ToastType
  icon?: string
  duration: number
  removing?: boolean
}

interface ToastOptions {
  type?: ToastType
  icon?: string
  duration?: number
}

const DEFAULT_DURATION = 3000
const FADE_OUT_DURATION = 200

// Global toast state
let toastListener: ((toasts: ToastData[]) => void) | null = null
let toastQueue: ToastData[] = []
let toastIdCounter = 0

function notifyListener() {
  toastListener?.([...toastQueue])
}

function addToast(message: string, options: ToastOptions = {}): string {
  const id = `toast-${++toastIdCounter}`
  const toast: ToastData = {
    id,
    message,
    type: options.type ?? 'info',
    icon: options.icon,
    duration: options.duration ?? DEFAULT_DURATION,
  }
  toastQueue.push(toast)
  notifyListener()

  // Auto-remove
  if (toast.duration > 0) {
    setTimeout(() => removeToast(id), toast.duration)
  }

  return id
}

function removeToast(id: string): void {
  const index = toastQueue.findIndex((t) => t.id === id)
  if (index === -1) return

  // Mark as removing for animation
  toastQueue[index] = { ...toastQueue[index], removing: true }
  notifyListener()

  // Actually remove after animation
  setTimeout(() => {
    toastQueue = toastQueue.filter((t) => t.id !== id)
    notifyListener()
  }, FADE_OUT_DURATION)
}

function clearToasts(): void {
  toastQueue.forEach((t) => removeToast(t.id))
}

// Export imperative API
export const toast = {
  show: addToast,
  remove: removeToast,
  clear: clearToasts,
  info: (message: string, options?: Omit<ToastOptions, 'type'>) =>
    addToast(message, { ...options, type: 'info' }),
  success: (message: string, options?: Omit<ToastOptions, 'type'>) =>
    addToast(message, { ...options, type: 'success' }),
  warning: (message: string, options?: Omit<ToastOptions, 'type'>) =>
    addToast(message, { ...options, type: 'warning' }),
  error: (message: string, options?: Omit<ToastOptions, 'type'>) =>
    addToast(message, { ...options, type: 'error' }),
}

// Toast item component
function ToastItem({ toast: t }: { toast: ToastData }) {
  const typeStyles = {
    info: 'bg-secondary border-secondary-foreground/20',
    success: 'bg-green-900/90 border-green-500/30 text-green-100',
    warning: 'bg-yellow-900/90 border-yellow-500/30 text-yellow-100',
    error: 'bg-red-900/90 border-red-500/30 text-red-100',
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-4 py-2 rounded-lg border shadow-lg',
        'transition-all duration-200',
        typeStyles[t.type],
        t.removing && 'opacity-0 translate-y-2'
      )}
    >
      {t.icon && <span className="text-lg">{t.icon}</span>}
      <span className="text-sm">{t.message}</span>
    </div>
  )
}

// Toast container component - renders at bottom of screen
export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    toastListener = setToasts
    // Initialize with any existing toasts
    setToasts([...toastQueue])
    return () => {
      toastListener = null
    }
  }, [])

  if (!mounted) return null

  return createPortal(
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div key={t.id} className="pointer-events-auto">
          <ToastItem toast={t} />
        </div>
      ))}
    </div>,
    document.body
  )
}
