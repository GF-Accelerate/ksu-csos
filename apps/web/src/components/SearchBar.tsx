/**
 * SearchBar Component
 *
 * Reusable search input with icon and clear button.
 */

import { useState } from 'react'

interface SearchBarProps {
  placeholder?: string
  onSearch: (query: string) => void
  onClear?: () => void
  debounceMs?: number
  className?: string
}

export function SearchBar({
  placeholder = 'Search...',
  onSearch,
  onClear,
  debounceMs = 0,
  className = '',
}: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null)

  const handleChange = (value: string) => {
    setQuery(value)

    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    if (debounceMs > 0) {
      // Debounce search
      const newTimeoutId = setTimeout(() => {
        onSearch(value)
      }, debounceMs)
      setTimeoutId(newTimeoutId)
    } else {
      // Immediate search
      onSearch(value)
    }
  }

  const handleClear = () => {
    setQuery('')
    onSearch('')
    if (onClear) {
      onClear()
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch(query)
    }
  }

  return (
    <div className={`search-bar ${className}`}>
      <span className="search-icon">🔍</span>
      <input
        type="text"
        className="search-input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onKeyPress={handleKeyPress}
      />
      {query && (
        <button className="search-clear" onClick={handleClear} title="Clear search">
          ×
        </button>
      )}
    </div>
  )
}
