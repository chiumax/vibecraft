/**
 * KanbanBoard - Main Kanban board component with drag-and-drop
 */

import { useCallback, useEffect, useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import { useTodosStore } from '../../stores/todosStore'
import { useAppStore, showAppModal } from '../../stores'
import { ZONE_COLORS } from '../../scene/WorkshopScene'
import type { Todo, TodoStatus } from '@shared/types'
import { KanbanHeader } from './KanbanHeader'
import { KanbanColumn, COLUMN_CONFIGS } from './KanbanColumn'
import { KanbanCardPlaceholder } from './KanbanCard'
import { PlannerPanel } from '../planner'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'
import { Plus } from 'lucide-react'

interface KanbanBoardProps {
  /** API URL for server requests */
  apiUrl?: string
  /** Callback to send prompt to a session */
  onSendPrompt?: (sessionId: string, prompt: string) => Promise<{ ok: boolean; error?: string }>
}

interface DragData {
  todo: Todo
  sessionId: string
  sessionName: string
}

export function KanbanBoard({ apiUrl = '/api', onSendPrompt }: KanbanBoardProps) {
  const managedSessions = useAppStore((s) => s.managedSessions)

  const {
    sessionTodos,
    isLoaded,
    filterSessionId,
    setApiUrl,
    loadTodos,
    addTodo,
    updateTodoStatus,
    deleteTodo,
    setFilter,
    getAllTodos,
  } = useTodosStore()

  // Track active drag
  const [activeDrag, setActiveDrag] = useState<DragData | null>(null)

  // Add todo modal state
  const [showAddModal, setShowAddModal] = useState(false)
  const [newTodoText, setNewTodoText] = useState('')
  const [newTodoSessionId, setNewTodoSessionId] = useState('')

  // Initialize store
  useEffect(() => {
    setApiUrl(apiUrl)
    loadTodos()
  }, [apiUrl, setApiUrl, loadTodos])

  // Set default session when sessions load
  useEffect(() => {
    if (managedSessions.length > 0 && !newTodoSessionId) {
      setNewTodoSessionId(managedSessions[0].id)
    }
  }, [managedSessions, newTodoSessionId])

  // Configure drag sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  // Get session color by session ID
  const getSessionColor = useCallback(
    (sessionId: string): string => {
      const index = managedSessions.findIndex(s => s.id === sessionId)
      if (index === -1) return '#6b7280' // Default gray
      const color = ZONE_COLORS[index % ZONE_COLORS.length]
      return `#${color.toString(16).padStart(6, '0')}`
    },
    [managedSessions]
  )

  // Group todos by status - use useMemo so it recalculates when sessionTodos changes
  const grouped = useMemo(() => {
    const allTodos = getAllTodos()
    const result: Record<TodoStatus, Array<{ todo: Todo; sessionId: string; sessionName: string }>> = {
      'todo': [],
      'in-progress': [],
      'done': [],
      'blocked': [],
      'icebox': [],
    }

    for (const item of allTodos) {
      const status = item.todo.status || 'todo'
      if (result[status]) {
        result[status].push(item)
      }
    }

    // Sort by creation date within each column
    for (const status of Object.keys(result) as TodoStatus[]) {
      result[status].sort((a, b) => b.todo.createdAt - a.todo.createdAt)
    }

    return result
  }, [sessionTodos, filterSessionId, getAllTodos])

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const data = event.active.data.current as DragData | undefined
    if (data) {
      setActiveDrag(data)
    }
  }, [])

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null)

      const { active, over } = event
      if (!over) return

      // Get the dropped column status
      const newStatus = over.id as TodoStatus
      if (!COLUMN_CONFIGS.find(c => c.id === newStatus)) return

      // Parse the dragged item ID
      const [sessionId, todoId] = (active.id as string).split(':')
      if (!sessionId || !todoId) return

      // Update the todo status
      updateTodoStatus(sessionId, todoId, newStatus)
    },
    [updateTodoStatus]
  )

  // Handle add todo
  const handleAddTodo = useCallback(async () => {
    if (!newTodoText.trim() || !newTodoSessionId) return

    const session = managedSessions.find(s => s.id === newTodoSessionId)
    if (!session) return

    await addTodo(newTodoSessionId, session.name, newTodoText.trim())
    setNewTodoText('')
    setShowAddModal(false)
  }, [newTodoText, newTodoSessionId, managedSessions, addTodo])

  // Handle delete todo
  const handleDeleteTodo = useCallback(
    (sessionId: string, todoId: string) => {
      deleteTodo(sessionId, todoId)
    },
    [deleteTodo]
  )

  // Handle run todo - opens RunTodoModal
  const handleRunTodo = useCallback(
    (sessionId: string, todo: Todo, sessionName: string) => {
      showAppModal('runTodo', {
        todo,
        sessionId,
        sessionName,
      })
    },
    []
  )

  if (!isLoaded) {
    return (
      <div className="kanban-loading">
        Loading todos...
      </div>
    )
  }

  return (
    <div className="kanban-board">
      <KanbanHeader
        sessions={managedSessions}
        filterSessionId={filterSessionId}
        onFilterChange={setFilter}
        onAddTodo={() => setShowAddModal(true)}
      />

      {/* AI Planner Section */}
      <PlannerPanel apiUrl={apiUrl} onSendPrompt={onSendPrompt} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="kanban-columns">
          {COLUMN_CONFIGS.map(config => (
            <KanbanColumn
              key={config.id}
              status={config.id}
              todos={grouped[config.id]}
              getSessionColor={getSessionColor}
              onDeleteTodo={handleDeleteTodo}
              onRunTodo={handleRunTodo}
            />
          ))}
        </div>

        <DragOverlay>
          {activeDrag && (
            <KanbanCardPlaceholder
              todo={activeDrag.todo}
              sessionName={activeDrag.sessionName}
              sessionColor={getSessionColor(activeDrag.sessionId)}
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Add Todo Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Add Todo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="workspace">Workspace</Label>
              <Select
                value={newTodoSessionId}
                onValueChange={setNewTodoSessionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select workspace" />
                </SelectTrigger>
                <SelectContent>
                  {managedSessions.map(session => (
                    <SelectItem key={session.id} value={session.id}>
                      {session.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="todo-text">Todo</Label>
              <Input
                id="todo-text"
                value={newTodoText}
                onChange={e => setNewTodoText(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter' && newTodoText.trim()) handleAddTodo()
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddTodo} disabled={!newTodoText.trim()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Todo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
