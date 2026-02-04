/**
 * ZoneInfoModal - Displays detailed information about a session/zone (shadcn/ui version)
 *
 * Shows session stats, git status, token usage, files touched, etc.
 */

import { useAppStore, getAppState } from '../../stores'
import { soundManager } from '../../audio/SoundManager'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import { ContextIndicator, getContextStatus } from '../sessions/ContextIndicator'
import type { ManagedSession, GitStatus, ContextFileCategory } from '@shared/types'

export interface ZoneInfoModalData {
  managedSession: ManagedSession
  stats?: {
    toolsUsed: number
    filesTouched: Set<string>
    activeSubagents: number
  }
}

export function ZoneInfoModal() {
  const activeModal = useAppStore((s) => s.activeModal)
  const rawModalData = useAppStore((s) => s.modalData)
  const hideModal = useAppStore((s) => s.hideModal)

  // Type-safe cast with validation
  const modalData = activeModal === 'zoneInfo' && rawModalData?.managedSession
    ? (rawModalData as unknown as ZoneInfoModalData)
    : undefined

  const isOpen = activeModal === 'zoneInfo'

  const handleClose = () => {
    const state = getAppState()
    if (state.soundEnabled) {
      soundManager.play('modal_cancel')
    }
    hideModal()
  }

  if (!modalData?.managedSession) return null

  const s = modalData.managedSession
  const stats = modalData.stats
  const filesTouched = stats?.filesTouched ? Array.from(stats.filesTouched) : []

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[500px] bg-card border-border max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zone Info</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <span className="text-lg font-medium">{s.name}</span>
            <Badge
              variant={s.status === 'working' ? 'default' : s.status === 'offline' ? 'destructive' : 'secondary'}
            >
              {s.status}
            </Badge>
          </div>

          {/* Basic Info */}
          <Card>
            <CardContent className="pt-4 space-y-2 text-sm">
              <InfoRow label="Directory" value={s.cwd || '~'} mono />
              <InfoRow label="tmux Session" value={s.tmuxSession} mono />
              <InfoRow label="Created" value={formatTimeAgo(s.createdAt)} />
              <InfoRow label="Last Activity" value={formatTimeAgo(s.lastActivity)} />
              {s.currentTool && (
                <InfoRow label="Current Tool" value={s.currentTool} highlight />
              )}
            </CardContent>
          </Card>

          {/* Stats */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Statistics</h4>
            <div className="grid grid-cols-3 gap-2">
              <StatCard value={stats?.toolsUsed ?? 0} label="Tools Used" />
              <StatCard value={filesTouched.length} label="Files Touched" />
              <StatCard value={stats?.activeSubagents ?? 0} label="Subagents" />
            </div>
          </div>

          {/* Tokens */}
          {s.tokens && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Token Usage</h4>
              <Card>
                <CardContent className="pt-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Current Conversation</span>
                    <span className="font-mono">{formatNumber(s.tokens.current)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Cumulative (Session)</span>
                    <span className="font-mono">{formatNumber(s.tokens.cumulative)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Context Files */}
          <ContextFilesSection context={s.context} />

          {/* Git Status */}
          {s.gitStatus?.isRepo ? (
            <GitStatusSection git={s.gitStatus} />
          ) : (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">Git Status</h4>
              <p className="text-sm text-muted-foreground">Not a git repository</p>
            </div>
          )}

          {/* Files Touched */}
          {filesTouched.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-muted-foreground">
                Files Touched ({filesTouched.length})
              </h4>
              <Card>
                <CardContent className="pt-4 space-y-1 text-xs font-mono">
                  {filesTouched.slice(0, 10).map((f, idx) => (
                    <div key={idx} className="text-muted-foreground truncate">
                      {shortenPath(f)}
                    </div>
                  ))}
                  {filesTouched.length > 10 && (
                    <div className="text-muted-foreground/60">
                      ... and {filesTouched.length - 10} more
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          {/* IDs */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Identifiers</h4>
            <Card>
              <CardContent className="pt-4 space-y-2 text-xs">
                <InfoRow label="Managed ID" value={s.id} mono small />
                {s.claudeSessionId && (
                  <InfoRow label="Claude Session" value={s.claudeSessionId} mono small />
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({
  label,
  value,
  mono,
  highlight,
  small,
}: {
  label: string
  value: string
  mono?: boolean
  highlight?: boolean
  small?: boolean
}) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`truncate ${mono ? 'font-mono' : ''} ${highlight ? 'text-primary' : ''} ${small ? 'text-xs' : ''}`}
      >
        {value}
      </span>
    </div>
  )
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <Card>
      <CardContent className="pt-3 pb-3 text-center">
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  )
}

const CATEGORY_LABELS: Record<ContextFileCategory, { label: string; icon: string }> = {
  project: { label: 'Project', icon: '📋' },
  parent: { label: 'Parent', icon: '📁' },
  local: { label: 'Local', icon: '📄' },
  rules: { label: 'Rules', icon: '⚙️' },
  docs: { label: 'Docs', icon: '📚' },
}

function ContextFilesSection({ context }: { context?: ManagedSession['context'] }) {
  const status = getContextStatus(context)
  const files = context?.contextFiles ?? []

  // Group files by category
  const grouped = files.reduce((acc, file) => {
    if (!acc[file.category]) {
      acc[file.category] = []
    }
    acc[file.category].push(file)
    return acc
  }, {} as Record<ContextFileCategory, typeof files>)

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-sm font-medium text-muted-foreground">Context Files</h4>
        <ContextIndicator context={context} size="md" />
      </div>

      {files.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No CLAUDE.md or context files read yet
        </p>
      ) : (
        <Card>
          <CardContent className="pt-4 space-y-3">
            {/* Status summary */}
            <div className="flex items-center gap-2 text-sm">
              {context?.projectContextLoaded ? (
                <span className="text-green-500">✅ Project context loaded</span>
              ) : (
                <span className="text-yellow-500">⚠️ Main CLAUDE.md not read</span>
              )}
            </div>

            {/* Files by category */}
            {(Object.keys(grouped) as ContextFileCategory[]).map((category) => {
              const categoryConfig = CATEGORY_LABELS[category]
              const categoryFiles = grouped[category]
              if (!categoryFiles?.length) return null

              return (
                <div key={category} className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                    <span>{categoryConfig.icon}</span>
                    <span>{categoryConfig.label}</span>
                  </div>
                  <div className="space-y-0.5 pl-4">
                    {categoryFiles.map((file, idx) => (
                      <div
                        key={idx}
                        className="text-xs font-mono text-muted-foreground truncate"
                        title={file.path}
                      >
                        {shortenPath(file.path)}
                        {file.readCount > 1 && (
                          <span className="text-muted-foreground/60 ml-1">
                            ({file.readCount}x)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}

            {/* Total count */}
            <div className="text-xs text-muted-foreground/60 pt-1 border-t border-border">
              {files.length} context file{files.length !== 1 ? 's' : ''} read
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function GitStatusSection({ git }: { git: GitStatus }) {
  const stagedTotal = git.staged.added + git.staged.modified + git.staged.deleted
  const unstagedTotal = git.unstaged.added + git.unstaged.modified + git.unstaged.deleted
  const isDirty = stagedTotal > 0 || unstagedTotal > 0 || git.untracked > 0

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">Git Status</h4>
      <Card>
        <CardContent className="pt-4 space-y-3">
          {/* Branch */}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">⎇</span>
            <span className="font-medium">{git.branch}</span>
            {git.ahead > 0 && <span className="text-green-500 text-xs">↑{git.ahead}</span>}
            {git.behind > 0 && <span className="text-red-400 text-xs">↓{git.behind}</span>}
            {isDirty ? (
              <span className="text-yellow-400">●</span>
            ) : (
              <span className="text-green-500">✓</span>
            )}
          </div>

          {/* Staged Changes */}
          {stagedTotal > 0 && (
            <ChangesRow
              label="Staged"
              added={git.staged.added}
              modified={git.staged.modified}
              deleted={git.staged.deleted}
            />
          )}

          {/* Unstaged Changes */}
          {unstagedTotal > 0 && (
            <ChangesRow
              label="Unstaged"
              added={git.unstaged.added}
              modified={git.unstaged.modified}
              deleted={git.unstaged.deleted}
            />
          )}

          {/* Untracked */}
          {git.untracked > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Untracked</span>
              <span className="text-muted-foreground">{git.untracked} files</span>
            </div>
          )}

          {/* Clean */}
          {!isDirty && (
            <p className="text-sm text-green-500">Working tree clean</p>
          )}

          {/* Lines Changed */}
          {(git.linesAdded > 0 || git.linesRemoved > 0) && (
            <div className="flex items-center gap-2 text-xs">
              {git.linesAdded > 0 && <span className="text-green-500">+{git.linesAdded}</span>}
              {git.linesRemoved > 0 && <span className="text-red-400">-{git.linesRemoved}</span>}
              <span className="text-muted-foreground">lines</span>
            </div>
          )}

          {/* Last Commit */}
          {git.lastCommitMessage && (
            <div className="text-xs border-t border-border pt-2 mt-2">
              <p className="text-muted-foreground truncate">{git.lastCommitMessage}</p>
              {git.lastCommitTime && (
                <p className="text-muted-foreground/60 mt-1">
                  {formatTimeAgo(git.lastCommitTime * 1000)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function ChangesRow({
  label,
  added,
  modified,
  deleted,
}: {
  label: string
  added: number
  modified: number
  deleted: number
}) {
  return (
    <div className="flex justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <div className="flex gap-2">
        {added > 0 && <span className="text-green-500">+{added}</span>}
        {modified > 0 && <span className="text-yellow-400">~{modified}</span>}
        {deleted > 0 && <span className="text-red-400">-{deleted}</span>}
      </div>
    </div>
  )
}

// Utilities
function formatTimeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return `${Math.floor(seconds / 86400)}d ago`
}

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function shortenPath(path: string): string {
  const parts = path.split('/')
  if (parts.length <= 3) return path
  return '.../' + parts.slice(-3).join('/')
}
