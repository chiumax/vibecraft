/**
 * ContextIndicator - Shows context file loading status for a session
 *
 * Visual indicator showing whether Claude has read the project's CLAUDE.md
 * and other context files.
 *
 * States:
 * - none (📄 gray): No context files read yet
 * - partial (📋 yellow): Some files read, but not main CLAUDE.md
 * - loaded (✅ green): Main project CLAUDE.md confirmed read
 */

import type { SessionContext } from '@shared/types'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../ui/tooltip'

export type ContextStatus = 'none' | 'partial' | 'loaded'

interface ContextIndicatorProps {
  /** The session's context state */
  context?: SessionContext
  /** Override the computed status */
  status?: ContextStatus
  /** Size variant */
  size?: 'sm' | 'md'
}

/**
 * Compute context status from SessionContext
 */
export function getContextStatus(context?: SessionContext): ContextStatus {
  if (!context) return 'none'
  if (context.projectContextLoaded) return 'loaded'
  if (context.contextFiles.length > 0) return 'partial'
  return 'none'
}

const STATUS_CONFIG: Record<ContextStatus, { icon: string; color: string; label: string }> = {
  none: {
    icon: '📄',
    color: 'text-muted-foreground/50',
    label: 'No context loaded',
  },
  partial: {
    icon: '📋',
    color: 'text-yellow-500',
    label: 'Some context loaded',
  },
  loaded: {
    icon: '✅',
    color: 'text-green-500',
    label: 'Project context loaded',
  },
}

export function ContextIndicator({ context, status, size = 'sm' }: ContextIndicatorProps) {
  const computedStatus = status ?? getContextStatus(context)
  const config = STATUS_CONFIG[computedStatus]

  // Build tooltip content
  const tooltipContent = context && context.contextFiles.length > 0
    ? (
      <div className="space-y-1">
        <div className="font-medium">{config.label}</div>
        <div className="text-xs text-muted-foreground">
          {context.contextFiles.length} file{context.contextFiles.length !== 1 ? 's' : ''} read:
        </div>
        <ul className="text-xs space-y-0.5 max-h-32 overflow-y-auto">
          {context.contextFiles.slice(0, 5).map((f, i) => (
            <li key={i} className="truncate max-w-48">
              {getFileName(f.path)}
              {f.readCount > 1 && <span className="text-muted-foreground/60"> ({f.readCount}x)</span>}
            </li>
          ))}
          {context.contextFiles.length > 5 && (
            <li className="text-muted-foreground/60">
              +{context.contextFiles.length - 5} more...
            </li>
          )}
        </ul>
      </div>
    )
    : config.label

  const sizeClass = size === 'sm' ? 'text-xs' : 'text-sm'

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center ${config.color} ${sizeClass} cursor-help`}
            title={typeof tooltipContent === 'string' ? tooltipContent : undefined}
          >
            {config.icon}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-64">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Extract file name from path
 */
function getFileName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/')
  return parts[parts.length - 1] || path
}

/**
 * Compact version for session list
 */
export function ContextIndicatorCompact({ context }: { context?: SessionContext }) {
  const status = getContextStatus(context)
  if (status === 'none') return null

  const config = STATUS_CONFIG[status]
  const count = context?.contextFiles.length ?? 0

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] ${config.color}`}
      title={`${config.label} (${count} files)`}
    >
      {config.icon}
    </span>
  )
}
