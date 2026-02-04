/**
 * DirectoryAutocomplete - React component for directory path autocomplete
 *
 * Fetches suggestions from the server (known projects + filesystem)
 * and shows a dropdown with keyboard navigation.
 */

import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { Input } from './input'

// Injected by Vite at build time
declare const __VIBECRAFT_DEFAULT_PORT__: number
const API_PORT = __VIBECRAFT_DEFAULT_PORT__
const API_URL = `http://${window.location.hostname}:${API_PORT}`

interface DirectoryAutocompleteProps {
  value: string
  onChange: (value: string) => void
  onSelect?: (path: string) => void
  placeholder?: string
  id?: string
  autoFocus?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void
}

export function DirectoryAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = 'e.g. /home/user/my-project',
  id,
  autoFocus,
  onKeyDown: externalKeyDown,
}: DirectoryAutocompleteProps) {
  const [results, setResults] = useState<string[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Fetch autocomplete results
  const fetchResults = useCallback(async (query: string) => {
    try {
      const response = await fetch(
        `${API_URL}/projects/autocomplete?q=${encodeURIComponent(query)}`
      )
      const data = await response.json()
      if (data.ok && Array.isArray(data.results)) {
        setResults(data.results)
        setSelectedIndex(0)
        setIsOpen(data.results.length > 0)
      }
    } catch (e) {
      console.error('Autocomplete fetch error:', e)
    }
  }, [])

  // Debounced input handler
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }

    debounceRef.current = setTimeout(() => {
      fetchResults(value)
    }, value.length === 0 ? 100 : 150)

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
    }
  }, [value, fetchResults])

  const selectResult = useCallback((path: string) => {
    onChange(path)
    setIsOpen(false)
    setResults([])
    onSelect?.(path)
  }, [onChange, onSelect])

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (results.length > 0 && isOpen) {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => (prev + 1) % results.length)
          return

        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev - 1 + results.length) % results.length)
          return

        case 'Tab':
          if (results.length > 0) {
            e.preventDefault()
            selectResult(results[selectedIndex])
          }
          return

        case 'Enter':
          e.preventDefault()
          e.stopPropagation()
          selectResult(results[selectedIndex])
          return

        case 'Escape':
          setIsOpen(false)
          return
      }
    }

    // Pass through to external handler
    externalKeyDown?.(e)
  }, [results, isOpen, selectedIndex, selectResult, externalKeyDown])

  const handleFocus = useCallback(() => {
    // Show suggestions on focus
    fetchResults(value)
  }, [fetchResults, value])

  const handleBlur = useCallback(() => {
    // Delay to allow click events to fire on dropdown
    setTimeout(() => {
      if (!dropdownRef.current?.contains(document.activeElement)) {
        setIsOpen(false)
      }
    }, 150)
  }, [])

  const handleItemClick = useCallback((index: number) => {
    selectResult(results[index])
  }, [results, selectResult])

  // Scroll selected item into view
  useEffect(() => {
    if (isOpen && dropdownRef.current) {
      const selected = dropdownRef.current.querySelector('.selected')
      selected?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, isOpen])

  // Shorten path for display
  const shortenPath = (path: string) => {
    if (path.startsWith('/home/')) {
      const homeIndex = path.indexOf('/', 6)
      if (homeIndex > 0) {
        return '~' + path.slice(homeIndex)
      }
    }
    return path
  }

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        type="text"
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        autoFocus={autoFocus}
      />

      {isOpen && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 z-50 mt-1 max-h-[200px] overflow-y-auto rounded-lg border border-border bg-popover/98 backdrop-blur-sm"
        >
          {results.map((path, i) => {
            const name = path.replace(/\/+$/, '').split('/').pop() || path
            const shortPath = shortenPath(path)

            return (
              <div
                key={path}
                className={`cursor-pointer px-3 py-2 flex flex-col gap-0.5 ${
                  i === selectedIndex
                    ? 'bg-accent selected'
                    : 'hover:bg-accent/50'
                }`}
                onClick={() => handleItemClick(i)}
                onMouseEnter={() => setSelectedIndex(i)}
              >
                <span className="font-mono font-semibold text-sm text-primary">
                  {name}
                </span>
                <span className="font-mono text-xs text-muted-foreground">
                  {shortPath}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
