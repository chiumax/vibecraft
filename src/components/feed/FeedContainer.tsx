/**
 * FeedContainer - Container with toggle between Activity Feed and Transcript
 *
 * Provides a toggle switch to switch between the traditional event-based
 * Activity Feed and the new real-time Transcript view.
 */

import { useState } from 'react'
import { FeedPanel } from './FeedPanel'
import { TranscriptPanel } from '../transcript'
import { cn } from '../../lib/utils'
import { List, FileText } from 'lucide-react'

interface FeedContainerProps {
  /** Working directory for path shortening */
  cwd?: string
}

export function FeedContainer({ cwd }: FeedContainerProps) {
  const [view, setView] = useState<'feed' | 'transcript'>('feed')

  return (
    <div className="flex flex-col h-full">
      {/* Toggle Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-background/50">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {view === 'feed' ? 'Activity' : 'Transcript'}
        </span>

        {/* Toggle Switch */}
        <div className="flex items-center gap-1 bg-muted/50 rounded-md p-0.5">
          <button
            onClick={() => setView('feed')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
              view === 'feed'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Activity Feed - Event-based view"
          >
            <List className="h-3 w-3" />
            <span>Feed</span>
          </button>
          <button
            onClick={() => setView('transcript')}
            className={cn(
              'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
              view === 'transcript'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            title="Transcript - Real-time Claude output"
          >
            <FileText className="h-3 w-3" />
            <span>Output</span>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {view === 'feed' ? (
          <FeedPanel cwd={cwd} />
        ) : (
          <TranscriptPanel cwd={cwd} />
        )}
      </div>
    </div>
  )
}
