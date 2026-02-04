/**
 * ConnectionOverlay - Shows when not connected to server
 */

import { useCallback } from 'react'
import { useAppStore } from '../../stores'
import { Button } from './button'

export function ConnectionOverlay() {
  const connected = useAppStore((s) => s.connected)
  const offlineMode = useAppStore((s) => s.offlineMode)

  const handleRetry = useCallback(() => {
    window.location.reload()
  }, [])

  const handleExploreOffline = useCallback(() => {
    useAppStore.getState().setOfflineMode(true)
  }, [])

  if (connected || offlineMode) return null

  return (
    <div className="fixed inset-0 z-[9999] bg-background/95 flex items-center justify-center">
      <div className="text-center max-w-md p-8">
        <div className="text-6xl mb-4">🔌</div>
        <h2 className="text-2xl font-bold mb-2">Not Connected</h2>
        <p className="text-muted-foreground mb-6">
          Unable to connect to the Vibecraft server. Make sure the server is running.
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={handleRetry}>
            Retry Connection
          </Button>
          <Button variant="secondary" onClick={handleExploreOffline}>
            Explore Offline
          </Button>
        </div>
      </div>
    </div>
  )
}

export function OfflineBanner() {
  const connected = useAppStore((s) => s.connected)
  const offlineMode = useAppStore((s) => s.offlineMode)

  const handleDismiss = useCallback(() => {
    useAppStore.getState().setOfflineMode(false)
  }, [])

  if (connected || !offlineMode) return null

  return (
    <div className="fixed top-0 left-0 right-0 z-[9998] bg-yellow-900/90 text-yellow-100 px-4 py-2 flex items-center justify-center gap-4">
      <span>⚠️ Offline Mode - Some features may not work</span>
      <Button
        variant="ghost"
        size="sm"
        className="text-yellow-100 hover:text-yellow-50"
        onClick={handleDismiss}
      >
        Dismiss
      </Button>
    </div>
  )
}
