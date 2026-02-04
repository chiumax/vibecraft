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
  onRun?: (sessionId: string, todo: Todo, sessionName: string) => void
}

export function KanbanCard({
  todo,
  sessionId,
  sessionName,
  sessionColor,
  onDelete,
  onRun,
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

  // Show run button for todo and blocked statuses
  const showRunButton = onRun && (todo.status === 'todo' || todo.status === 'blocked')

  // Show executing indicator
  const isExecuting = todo.status === 'in-progress' && todo.executingSessionId

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`kanban-card ${isDragging ? 'dragging' : ''} ${isExecuting ? 'executing' : ''}`}
      {...listeners}
      {...attributes}
    >
      <div className="kanban-card-color" style={{ backgroundColor: sessionColor }} />
      <div className="kanban-card-content">
        <span className="kanban-card-text">{todo.text}</span>
        <div className="kanban-card-meta">
          <span className="kanban-card-session">{sessionName}</span>
          {isExecuting && (
            <span className="kanban-card-executing" title="Running in session">
              ⚙️
            </span>
          )}
        </div>
      </div>
      <div className="kanban-card-actions">
        {showRunButton && (
          <button
            className="kanban-card-run"
            onClick={(e) => {
              e.stopPropagation()
              onRun(sessionId, todo, sessionName)
            }}
            title="Run this todo"
          >
            ▶
          </button>
        )}
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
