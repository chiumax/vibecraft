/**
 * KanbanHeader - Header with filter dropdown and add button
 */

import type { ManagedSession } from '@shared/types'
import { Button } from '../ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Plus, Filter } from 'lucide-react'

interface KanbanHeaderProps {
  sessions: ManagedSession[]
  filterSessionId: string | null
  onFilterChange: (sessionId: string | null) => void
  onAddTodo: () => void
}

export function KanbanHeader({
  sessions,
  filterSessionId,
  onFilterChange,
  onAddTodo,
}: KanbanHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-card/30">
      <h3 className="text-sm font-semibold text-foreground/80">Todos</h3>
      <div className="flex items-center gap-2">
        <Select
          value={filterSessionId ?? 'all'}
          onValueChange={(value) => onFilterChange(value === 'all' ? null : value)}
        >
          <SelectTrigger className="h-7 w-[140px] text-xs">
            <Filter className="mr-1.5 h-3 w-3 opacity-50" />
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sessions</SelectItem>
            {sessions.map(session => (
              <SelectItem key={session.id} value={session.id}>
                {session.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={onAddTodo}>
          <Plus className="mr-1 h-3 w-3" />
          Add
        </Button>
      </div>
    </div>
  )
}
