/**
 * KanbanCard - Draggable todo card for the Kanban board
 */

import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import type { Todo } from '@shared/types'

interface KanbanCardProps {
  todo: Todo
  sessionId: string
  sessionName: string
  sessionColor: string
  onDelete: (sessionId: string, todoId: string) => void
}

export function KanbanCard({
  todo,
  sessionId,
  sessionName,
  sessionColor,
  onDelete,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: `${sessionId}:${todo.id}`,
    data: {
      todo,
      sessionId,
      sessionName,
    },
  })

  const style = transform
    ? {
        transform: CSS.Transform.toString(transform),
        zIndex: isDragging ? 1000 : undefined,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`kanban-card ${isDragging ? 'dragging' : ''}`}
      {...listeners}
      {...attributes}
    >
      <div className="kanban-card-color" style={{ backgroundColor: sessionColor }} />
      <div className="kanban-card-content">
        <span className="kanban-card-text">{todo.text}</span>
        <span className="kanban-card-session">{sessionName}</span>
      </div>
      <button
        className="kanban-card-delete"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(sessionId, todo.id)
        }}
        title="Delete todo"
      >
        ×
      </button>
    </div>
  )
}

/**
 * Placeholder card shown during drag operations
 */
export function KanbanCardPlaceholder({
  todo,
  sessionName,
  sessionColor,
}: {
  todo: Todo
  sessionName: string
  sessionColor: string
}) {
  return (
    <div className="kanban-card placeholder">
      <div className="kanban-card-color" style={{ backgroundColor: sessionColor }} />
      <div className="kanban-card-content">
        <span className="kanban-card-text">{todo.text}</span>
        <span className="kanban-card-session">{sessionName}</span>
      </div>
    </div>
  )
}
