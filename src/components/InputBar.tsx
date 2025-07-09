import { useState, useRef, useEffect } from 'react'
import { usePlacesAutocomplete } from '../hooks/usePlacesAutocomplete'

interface InputBarProps {
  onSearch: (query: string, isPlaceId: boolean) => void
  isLoading: boolean
  query: string
  setQuery: (query: string) => void
  city: string
  setCity: (city: string) => void
}

const InputBar = ({ onSearch, isLoading, query, setQuery, city, setCity }: InputBarProps) => {
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

  // Debug: Track query changes
  useEffect(() => {
    console.log('🔍 Query state changed to:', query)
  }, [query])

  // Debug: Track suggestions rendering
  useEffect(() => {
    if (showSuggestions && isPlaceSearch) {
      if (suggestionsLoading) {
        console.log('🔍 === SHOWING LOADING STATE ===')
      } else if (suggestions.length > 0) {
        console.log('🔍 === RENDERING SUGGESTIONS ===', suggestions.length, 'suggestions:', suggestions)
      } else if (searchTerm.length > 1) {
        console.log('🔍 === NO SUGGESTIONS FOUND ===', 'searchTerm:', searchTerm)
      }
    }
  }, [showSuggestions, isPlaceSearch, suggestionsLoading, suggestions, searchTerm])

  const handleInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setUrlParseError(null)
    
    // Check if it's a Google Maps URL
    if (value.includes('maps.google') || value.includes('goo.gl') || value.includes('maps.app.goo.gl')) {
      try {
        // Use relative path for Netlify functions in production, localhost for development
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const endpoint = isDev 
          ? 'http://localhost:8888/.netlify/functions/parsePlace'
          : '/.netlify/functions/parsePlace'
        
        // Use backend to parse the URL (especially important for shortened URLs)
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            type: 'parse',
            url: value
          })
        })
        
        if (response.ok) {
          const parsed = await response.json()
          console.log('🔗 Parsed URL result:', parsed)
          
          if (parsed.query && parsed.query !== 'Google Maps location') {
            // Successfully extracted place name from URL
            setQuery(parsed.query)
            console.log(`✅ URL parsed to: ${parsed.query}`)
          } else if (parsed.place_id) {
            // Got a place ID, convert to @ search
            setQuery(`@${parsed.place_id}`)
            console.log(`✅ URL parsed to place ID: ${parsed.place_id}`)
          } else {
            // URL was recognized but couldn't extract specific place info
            console.log('⚠️ URL recognized but no specific place extracted')
            setUrlParseError('Could not extract place information from URL')
          }
        } else {
          console.log('❌ Failed to parse URL via backend')
          setUrlParseError('Unable to parse Google Maps URL')
        }
      } catch (error) {
        console.log('❌ URL parsing error:', error)
        setUrlParseError('Unable to parse Google Maps URL')
      }
    }
  }

  const handleSuggestionClick = (suggestion: any) => {
    console.log('🔍 === SUGGESTION CLICK DEBUG START ===')
    console.log('🔍 Current query before click:', query)
    console.log('🔍 isPlaceSearch:', isPlaceSearch)
    console.log('🔍 searchTerm:', searchTerm)
    console.log('🔍 Clicked suggestion object:', JSON.stringify(suggestion, null, 2))
    console.log('🔍 Suggestion structured_formatting:', suggestion.structured_formatting)
    console.log('🔍 Suggestion description:', suggestion.description)
    console.log('🔍 Suggestion place_id:', suggestion.place_id)
    
    // Prioritize structured_formatting.main_text as it contains just the business name
    // Description contains the full address which we don't want
    let placeName = suggestion.structured_formatting?.main_text || suggestion.description || 'Selected place'
    console.log('🔍 Initial placeName extracted:', placeName)
    
    // If we got the description instead and it has a comma, take only the part before the first comma
    if (placeName === suggestion.description && placeName.includes(',')) {
      const originalPlaceName = placeName
      placeName = placeName.split(',')[0].trim()
      console.log('🔍 Trimmed placeName from:', originalPlaceName, 'to:', placeName)
    }
    
    console.log('🔍 Final place name to set:', placeName)
    
    // Set the place name without @ prefix so user can directly search
    console.log('🔍 About to call setQuery with:', placeName)
    setQuery(placeName)
    console.log('🔍 setQuery called, new query should be:', placeName)
    
    console.log('🔍 About to hide suggestions')
    setShowSuggestions(false)
    console.log('🔍 Suggestions hidden')
    
    console.log('🔍 === SUGGESTION CLICK DEBUG END ===')
    // Don't immediately search - let user click Search button or press Enter
    // This is more intuitive UX behavior for autocomplete
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowSuggestions(false)
    }
  }

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        // Check if the click was on a suggestion button
        const target = event.target as Element
        if (!target.closest('[data-suggestion-button]')) {
          setShowSuggestions(false)
        }
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

      {/* City input */}
      <div className="mt-3">
        <label htmlFor="city" className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
          Target City
        </label>
        <input
          id="city"
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="Tokyo, New York, London..."
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={isLoading}
        />
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
                data-suggestion-button="true"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  console.log('🔍 === BUTTON CLICKED ===')
                  handleSuggestionClick(suggestion)
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  console.log('🔍 === BUTTON MOUSE DOWN ===')
                }}
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