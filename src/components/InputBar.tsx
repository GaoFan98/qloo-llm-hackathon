import { useState, useRef, useEffect } from 'react'
import { usePlacesAutocomplete } from '../hooks/usePlacesAutocomplete'

interface InputBarProps {
  onSearch: (query: string, isPlaceId: boolean) => void
  isLoading: boolean
  query: string
  setQuery: (query: string) => void
  city: string
}

const InputBar = ({ onSearch, isLoading, query, setQuery, city }: InputBarProps) => {
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [urlParseError, setUrlParseError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  
  // Check if query starts with @ for place autocomplete
  const isPlaceSearch = query.startsWith('@')
  const searchTerm = isPlaceSearch ? query.substring(1) : query
  
  // Use autocomplete hook when searching for places
  const {
    suggestions,
    isLoading: suggestionsLoading,
    fetchSuggestions,
    clearSuggestions
  } = usePlacesAutocomplete()

  // Fetch suggestions when typing @ followed by text
  useEffect(() => {
    if (isPlaceSearch && searchTerm.length > 1) {
      fetchSuggestions(searchTerm, city)
      setShowSuggestions(true)
    } else {
      clearSuggestions()
      setShowSuggestions(false)
    }
  }, [isPlaceSearch, searchTerm, city, fetchSuggestions, clearSuggestions])

  // Parse Google Maps URLs
  const parseGoogleMapsUrl = (url: string): { placeId?: string, query?: string, type?: string } | null => {
    try {
      const urlObj = new URL(url)
      
      // Handle shortened goo.gl URLs - these are valid and should be accepted
      if (urlObj.hostname.includes('goo.gl') || urlObj.hostname.includes('maps.app.goo.gl')) {
        return { type: 'shortened', query: 'location from Google Maps' }
      }
      
      // Check for various Google Maps URL formats
      if (urlObj.hostname.includes('maps.google') || urlObj.hostname.includes('google.com/maps')) {
        // Extract place_id from URL params
        const placeId = urlObj.searchParams.get('place_id')
        if (placeId) {
          return { placeId, type: 'place_id' }
        }
        
        // Extract from path for /place/ URLs
        const pathMatch = urlObj.pathname.match(/\/place\/([^\/]+)/)
        if (pathMatch) {
          const placeName = decodeURIComponent(pathMatch[1].replace(/\+/g, ' '))
          return { query: placeName, type: 'query' }
        }
        
        // Extract from search params
        const q = urlObj.searchParams.get('q')
        if (q) {
          return { query: q, type: 'query' }
        }
        
        // Generic maps URL
        return { query: 'location from Google Maps', type: 'maps_url' }
      }
      
      return null
    } catch {
      return null
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setUrlParseError(null)
    
    // Check if it's a Google Maps URL
    if (value.includes('maps.google') || value.includes('goo.gl') || value.includes('maps.app.goo.gl')) {
      const parsed = parseGoogleMapsUrl(value)
      if (parsed) {
        // Successfully detected URL (including shortened ones)
        if (parsed.placeId) {
          setQuery(`@${parsed.placeId}`)
        } else if (parsed.query) {
          setQuery(parsed.query)
        }
        setUrlParseError(null)
      } else {
        setUrlParseError('Unable to parse Google Maps URL')
      }
    }
  }

  const handleSuggestionClick = (suggestion: any) => {
    setQuery(`@${suggestion.place_id}`)
    setShowSuggestions(false)
    // Immediately trigger search with the selected place
    onSearch(suggestion.place_id, true)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    
    setShowSuggestions(false)
    
    if (isPlaceSearch) {
      // Remove @ prefix and search as place ID
      onSearch(searchTerm, true)
    } else {
      // Regular taste search
      onSearch(query, false)
    }
  }

  const handleKeyDown = (e: React.KeyEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        setShowSuggestions(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <form onSubmit={handleSubmit} className="relative flex flex-col w-full max-w-md">
      <label htmlFor="search" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Taste or Place
      </label>
      
      <div className="relative">
        <input
          ref={inputRef}
          id="search"
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder="cozy minimalistic cafe or @Starbucks or Google Maps URL"
          className="w-full px-4 py-2 pr-24 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isLoading}
        />
        
        <button
          type="submit"
          disabled={isLoading || !query.trim()}
          className="absolute right-2 top-1/2 transform -translate-y-1/2 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </div>

      {/* Error message for URL parsing */}
      {urlParseError && (
        <div className="mt-1 text-sm text-red-600 dark:text-red-400">
          {urlParseError}
        </div>
      )}

      {/* Help text */}
      <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
        💡 Try: "cozy minimalistic cafe" or "@Starbucks" or paste a Google Maps URL
      </div>

      {/* Autocomplete suggestions dropdown */}
      {showSuggestions && isPlaceSearch && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg z-50 max-h-60 overflow-y-auto">
          {suggestionsLoading ? (
            <div className="p-3 text-sm text-gray-500 dark:text-gray-400">
              Searching places...
            </div>
          ) : suggestions.length > 0 ? (
            suggestions.map((suggestion, index) => (
              <button
                key={suggestion.place_id || index}
                onClick={() => handleSuggestionClick(suggestion)}
                className="w-full text-left p-3 hover:bg-gray-100 dark:hover:bg-gray-700 border-b border-gray-200 dark:border-gray-600 last:border-b-0 transition-colors"
              >
                <div className="font-medium text-gray-900 dark:text-white">
                  {suggestion.structured_formatting?.main_text || suggestion.description}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {suggestion.structured_formatting?.secondary_text || ''}
                </div>
              </button>
            ))
          ) : searchTerm.length > 1 ? (
            <div className="p-3 text-sm text-gray-500 dark:text-gray-400">
              No places found for "{searchTerm}"
            </div>
          ) : null}
        </div>
      )}
    </form>
  )
}

export default InputBar 