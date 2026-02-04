/**
 * App - Root React Component
 *
 * This is the entry point for React. During the migration,
 * this component will gradually take over UI rendering from
 * the vanilla TypeScript code.
 *
 * Phase 0: Renders null, just mounting React alongside existing code
 * Phase 1: Modal components (COMPLETE)
 * Phase 2: Sessions panel via portal (COMPLETE)
 * Phase 3: Activity feed via portal (COMPLETE)
 * Phase 4+: Layout, scene, etc.
 */

import { useEffect, useCallback } from 'react'
import { useAppStore } from './stores'
import {
  AboutModal,
  TextLabelModal,
  SettingsModal,
  QuestionModal,
  PermissionModal,
  ZoneInfoModal,
  ZoneTimeoutModal,
  NewSessionModal,
  ZoneCommandModal,
  RunTodoModal,
} from './components/modals'
import { SessionsPanelPortal } from './components/sessions'
import { FeedPanelPortal } from './components/feed'
import { KanbanBoardPortal } from './components/kanban'
import { ToastContainer } from './components/ui/toast'
import { ContextMenuContainer } from './components/ui/context-menu'
import { ConnectionOverlay, OfflineBanner } from './components/ui/connection-overlay'
import { Timeline } from './components/ui/timeline'
import { VersionBanner } from './components/ui/version-banner'
import { AppLayout } from './components/layout/AppLayout'

interface AppProps {
  /** Agent port for settings modal */
  agentPort?: number
  /** Callback to refresh sessions */
  onRefreshSessions?: () => Promise<void>
  /** Session management callbacks */
  sessionCallbacks?: {
    onSelectSession: (sessionId: string | null) => void
    onDeleteSession: (sessionId: string) => void
    onRestartSession: (sessionId: string, name: string) => void
    onDismissSession: (sessionId: string) => void
    onReactivateSession: (sessionId: string) => void
    onRenameSession: (sessionId: string, newName: string) => void
    onNewSession: () => void
  }
}

export function App({ agentPort = 4003, onRefreshSessions, sessionCallbacks }: AppProps) {
  // Subscribe to store for debugging (will be removed later)
  const connected = useAppStore((state) => state.connected)
  const activeModal = useAppStore((state) => state.activeModal)
  const serverCwd = useAppStore((state) => state.serverCwd)

  useEffect(() => {
    // Log React mount for verification
    console.log('[React] App mounted, connected:', connected)
  }, [connected])

  useEffect(() => {
    if (activeModal) {
      console.log('[React] Modal active:', activeModal)
    }
  }, [activeModal])

  // Callback to send prompt to a Claude Code session
  const handleSendPrompt = useCallback(async (sessionId: string, prompt: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      })
      return await response.json()
    } catch (e) {
      console.error('Error sending prompt:', e)
      return { ok: false, error: 'Network error' }
    }
  }, [])

  // Render modal components and sessions panel
  return (
    <AppLayout>
      {/* Modals */}
      <AboutModal />
      <TextLabelModal />
      <SettingsModal agentPort={agentPort} onRefreshSessions={onRefreshSessions} />
      <QuestionModal />
      <PermissionModal />
      <ZoneInfoModal />
      <ZoneTimeoutModal />
      <NewSessionModal />
      <ZoneCommandModal />
      <RunTodoModal />

      {/* Sessions Panel (rendered via portal into #managed-sessions) */}
      {sessionCallbacks && (
        <SessionsPanelPortal
          onSelectSession={sessionCallbacks.onSelectSession}
          onDeleteSession={sessionCallbacks.onDeleteSession}
          onRestartSession={sessionCallbacks.onRestartSession}
          onDismissSession={sessionCallbacks.onDismissSession}
          onReactivateSession={sessionCallbacks.onReactivateSession}
          onRenameSession={sessionCallbacks.onRenameSession}
          onNewSession={sessionCallbacks.onNewSession}
        />
      )}

      {/* Activity Feed (rendered via portal into #activity-feed) */}
      <FeedPanelPortal cwd={serverCwd} />

      {/* Kanban Board (rendered via portal into #todos-board-view) */}
      <KanbanBoardPortal apiUrl="/api" onSendPrompt={handleSendPrompt} />

      {/* Toast notifications */}
      <ToastContainer />

      {/* Context menu */}
      <ContextMenuContainer />

      {/* Connection status */}
      <ConnectionOverlay />
      <OfflineBanner />

      {/* Timeline */}
      <Timeline />

      {/* Version update banner */}
      <VersionBanner />
    </AppLayout>
  )
}
