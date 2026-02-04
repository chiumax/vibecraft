/**
 * KanbanHeader - Header with filter dropdown and add button
 */

import type { ManagedSession } from '@shared/types'

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
    <div className="kanban-header">
      <h3 className="kanban-title">Kanban Board</h3>
      <div className="kanban-header-actions">
        <select
          className="kanban-filter"
          value={filterSessionId ?? ''}
          onChange={(e) => onFilterChange(e.target.value || null)}
        >
          <option value="">All Sessions</option>
          {sessions.map(session => (
            <option key={session.id} value={session.id}>
              {session.name}
            </option>
          ))}
        </select>
        <button className="kanban-add-btn" onClick={onAddTodo}>
          + Add Todo
        </button>
      </div>
    </div>
  )
}
