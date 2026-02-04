/**
 * KanbanColumn - Droppable column for the Kanban board
 */

import { useDroppable } from '@dnd-kit/core'
import type { TodoStatus, Todo } from '@shared/types'
import { KanbanCard } from './KanbanCard'

interface ColumnConfig {
  id: TodoStatus
  title: string
  icon: string
  color: string
}

export const COLUMN_CONFIGS: ColumnConfig[] = [
  { id: 'todo', title: 'Todo', icon: '📋', color: 'var(--column-todo)' },
  { id: 'in-progress', title: 'In Progress', icon: '🔄', color: 'var(--column-in-progress)' },
  { id: 'done', title: 'Done', icon: '✅', color: 'var(--column-done)' },
  { id: 'blocked', title: 'Blocked', icon: '🚫', color: 'var(--column-blocked)' },
  { id: 'icebox', title: 'Icebox', icon: '❄️', color: 'var(--column-icebox)' },
]

interface TodoWithMeta {
  todo: Todo
  sessionId: string
  sessionName: string
}

interface KanbanColumnProps {
  status: TodoStatus
  todos: TodoWithMeta[]
  getSessionColor: (sessionId: string) => string
  onDeleteTodo: (sessionId: string, todoId: string) => void
}

export function KanbanColumn({
  status,
  todos,
  getSessionColor,
  onDeleteTodo,
}: KanbanColumnProps) {
  const config = COLUMN_CONFIGS.find(c => c.id === status)!

  const { setNodeRef, isOver } = useDroppable({
    id: status,
  })

  return (
    <div
      ref={setNodeRef}
      className={`kanban-column ${isOver ? 'drag-over' : ''}`}
      data-status={status}
    >
      <div className="kanban-column-header" style={{ borderColor: config.color }}>
        <span className="kanban-column-icon">{config.icon}</span>
        <span className="kanban-column-title">{config.title}</span>
        <span className="kanban-column-count">{todos.length}</span>
      </div>
      <div className="kanban-column-content">
        {todos.map(({ todo, sessionId, sessionName }) => (
          <KanbanCard
            key={`${sessionId}:${todo.id}`}
            todo={todo}
            sessionId={sessionId}
            sessionName={sessionName}
            sessionColor={getSessionColor(sessionId)}
            onDelete={onDeleteTodo}
          />
        ))}
        {todos.length === 0 && (
          <div className="kanban-column-empty">
            Drop items here
          </div>
        )}
      </div>
    </div>
  )
}
