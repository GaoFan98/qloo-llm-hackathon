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
  const [activeField, setActiveField] = useState<'description' | 'city' | null>(null)
  const queryInputRef = useRef<HTMLInputElement>(null)
  const cityInputRef = useRef<HTMLInputElement>(null)
  
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

  const handleQueryChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setQuery(value)
    setUrlParseError(null)
    
    // Check if it's a Google Maps URL
    if (value.includes('maps.google') || value.includes('goo.gl') || value.includes('maps.app.goo.gl')) {
      try {
        const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const endpoint = isDev 
          ? 'http://localhost:8888/.netlify/functions/parsePlace'
          : '/.netlify/functions/parsePlace'
        
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
          
          if (parsed.query && parsed.query !== 'Google Maps location') {
            setQuery(parsed.query)
          } else if (parsed.place_id) {
            setQuery(`@${parsed.place_id}`)
          } else {
            setUrlParseError('Could not extract place information from URL')
          }
        } else {
          setUrlParseError('Unable to parse Google Maps URL')
        }
      } catch (error) {
        setUrlParseError('Unable to parse Google Maps URL')
      }
    }
  }

  const handleCityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCity(e.target.value)
  }

  const handleSuggestionClick = (suggestion: any) => {
    let placeName = suggestion.structured_formatting?.main_text || suggestion.description || 'Selected place'
    
    if (placeName === suggestion.description && placeName.includes(',')) {
      placeName = placeName.split(',')[0].trim()
    }
    
    setQuery(placeName)
    setShowSuggestions(false)
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return
    
    setShowSuggestions(false)
    
    if (isPlaceSearch) {
      onSearch(searchTerm, true)
    } else {
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
      if (queryInputRef.current && !queryInputRef.current.contains(event.target as Node) &&
          cityInputRef.current && !cityInputRef.current.contains(event.target as Node)) {
        const target = event.target as Element
        if (!target.closest('[data-suggestion-button]')) {
          setShowSuggestions(false)
          setActiveField(null)
        }
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="relative w-full max-w-4xl mx-auto">
      <form onSubmit={handleSubmit} className="relative">
        {/* Unified Search Bar Container */}
        <div className="flex items-center bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-shadow duration-200">
          
          {/* Description Field */}
          <div className="flex-1 px-6 py-4 border-r border-gray-200 dark:border-gray-700">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Description
            </label>
            <input
              ref={queryInputRef}
              type="text"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleKeyDown}
              onFocus={() => setActiveField('description')}
              placeholder="Cozy minimalistic cafe or @Starbucks..."
              className="w-full text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 bg-transparent border-0 focus:outline-none focus:ring-0"
            />
          </div>

          {/* City Field */}
          <div className="flex-1 px-6 py-4">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
              City
            </label>
            <input
              ref={cityInputRef}
              type="text"
              value={city}
              onChange={handleCityChange}
              onFocus={() => setActiveField('city')}
              placeholder="Tokyo, Seoul, Paris..."
              className="w-full text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 bg-transparent border-0 focus:outline-none focus:ring-0"
            />
          </div>

          {/* Search Button */}
          <div className="px-2">
            <button
              type="submit"
              disabled={isLoading || !query.trim() || !city.trim()}
              className="flex items-center justify-center w-12 h-12 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed rounded-full transition-colors duration-200 shadow-md"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Helper Text */}
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          💡 Try: "cozy minimalistic cafe" or "@Starbucks" or paste a Google Maps URL
        </p>

        {/* URL Parse Error */}
        {urlParseError && (
          <div className="mt-2 text-sm text-red-600 dark:text-red-400 text-center">
            {urlParseError}
          </div>
        )}
      </form>

      {/* Autocomplete Suggestions */}
      {showSuggestions && isPlaceSearch && (
        <div className="absolute top-full left-0 right-0 mt-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 max-h-60 overflow-y-auto">
          {suggestionsLoading ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              <div className="inline-block w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mr-2"></div>
              Searching places...
            </div>
          ) : suggestions.length > 0 ? (
            <div className="py-2">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  data-suggestion-button
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                >
                  <div className="flex items-center">
                    <div className="flex-shrink-0 w-6 h-6 mr-3">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {suggestion.structured_formatting?.main_text || suggestion.description}
                      </div>
                      {suggestion.structured_formatting?.secondary_text && (
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {suggestion.structured_formatting.secondary_text}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : searchTerm.length > 1 ? (
            <div className="p-4 text-center text-gray-500 dark:text-gray-400">
              No places found for "{searchTerm}"
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

export default InputBar 