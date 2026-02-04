/**
 * KeybindSettings - React component for editing keyboard shortcuts
 *
 * Displays editable keybindings and allows users to customize them.
 */

import { useState, useEffect, useCallback } from 'react'
import {
  keybindManager,
  formatKeybind,
  eventToKeybind,
  type Keybind,
  type KeybindAction,
} from '../../ui/KeybindConfig'

interface EditingState {
  actionId: string
  bindingIndex: number | 'add'
}

/**
 * Update the voice hint element in the DOM (outside React)
 */
function updateVoiceHintDOM(): void {
  const voiceHint = document.querySelector('.voice-hint')
  if (!voiceHint) return

  const bindings = keybindManager.getBindings('voice-toggle')
  if (bindings.length > 0) {
    const binding = bindings[0]
    const parts: string[] = []

    if (binding.modifier !== 'none') {
      const modDisplay: Record<string, string> = {
        ctrl: 'Ctrl',
        alt: 'Alt',
        shift: 'Shift',
        meta: '\u2318',
      }
      parts.push(`<kbd>${modDisplay[binding.modifier]}</kbd>`)
    }

    const keyDisplay = binding.key.length === 1 ? binding.key.toUpperCase() : binding.key
    parts.push(`<kbd>${keyDisplay}</kbd>`)

    voiceHint.innerHTML = parts.join('')
  }
}

export function KeybindSettings() {
  const [actions, setActions] = useState<KeybindAction[]>([])
  const [editing, setEditing] = useState<EditingState | null>(null)

  // Load actions and subscribe to changes
  useEffect(() => {
    setActions(keybindManager.getEditableActions())

    const unsubscribe = keybindManager.onChange(() => {
      setActions(keybindManager.getEditableActions())
      // Update the voice hint in the DOM
      updateVoiceHintDOM()
    })

    return unsubscribe
  }, [])

  // Global keydown handler for capturing keybinds
  useEffect(() => {
    if (!editing) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape cancels editing
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setEditing(null)
        return
      }

      // Ignore lone modifier keys
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) {
        return
      }

      e.preventDefault()
      e.stopPropagation()

      const newBinding = eventToKeybind(e)
      const currentBindings = [...keybindManager.getBindings(editing.actionId)]

      if (editing.bindingIndex === 'add') {
        // Adding a new binding
        currentBindings.push(newBinding)
      } else {
        // Replacing existing binding
        currentBindings[editing.bindingIndex] = newBinding
      }

      keybindManager.setBindings(editing.actionId, currentBindings)
      setEditing(null)
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [editing])

  const handleBindingClick = useCallback((actionId: string, bindingIndex: number) => {
    if (editing?.actionId === actionId && editing?.bindingIndex === bindingIndex) {
      setEditing(null)
    } else {
      setEditing({ actionId, bindingIndex })
    }
  }, [editing])

  const handleAddClick = useCallback((actionId: string) => {
    setEditing({ actionId, bindingIndex: 'add' })
  }, [])

  const handleResetClick = useCallback((actionId: string) => {
    keybindManager.resetToDefaults(actionId)
  }, [])

  return (
    <div className="keybind-settings-react">
      {actions.map((action) => (
        <div key={action.id} className="keybind-row">
          <span className="keybind-name">{action.name}</span>
          <div className="keybind-keys">
            {action.bindings.map((binding, index) => {
              const isEditing = editing?.actionId === action.id && editing?.bindingIndex === index
              return (
                <button
                  key={index}
                  type="button"
                  className={`keybind-key ${isEditing ? 'editing' : ''}`}
                  onClick={() => handleBindingClick(action.id, index)}
                  title={action.description}
                >
                  {isEditing ? 'Press key...' : formatKeybind(binding)}
                </button>
              )
            })}
            <button
              type="button"
              className={`keybind-add ${editing?.actionId === action.id && editing?.bindingIndex === 'add' ? 'editing' : ''}`}
              onClick={() => handleAddClick(action.id)}
              title="Add another keybind"
            >
              {editing?.actionId === action.id && editing?.bindingIndex === 'add' ? 'Press key...' : '+'}
            </button>
          </div>
          <button
            type="button"
            className="keybind-reset"
            onClick={() => handleResetClick(action.id)}
            title="Reset to default"
          >
            ↺
          </button>
        </div>
      ))}
    </div>
  )
}

/**
 * Hook to get the voice toggle keybinding for display
 */
export function useVoiceHint(): string {
  const [hint, setHint] = useState<string>('')

  useEffect(() => {
    const updateHint = () => {
      const bindings = keybindManager.getBindings('voice-toggle')
      if (bindings.length > 0) {
        const binding = bindings[0]
        const parts: string[] = []

        if (binding.modifier !== 'none') {
          const modDisplay: Record<string, string> = {
            ctrl: 'Ctrl',
            alt: 'Alt',
            shift: 'Shift',
            meta: '\u2318',
          }
          parts.push(modDisplay[binding.modifier])
        }

        const keyDisplay = binding.key.length === 1 ? binding.key.toUpperCase() : binding.key
        parts.push(keyDisplay)

        setHint(parts.join('+'))
      }
    }

    updateHint()
    return keybindManager.onChange(updateHint)
  }, [])

  return hint
}
