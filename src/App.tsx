import { useState, useEffect, useRef, useCallback } from 'react'
import InputBar from './components/InputBar'
import ResultCard from './components/ResultCard'
import SkeletonLoader from './components/SkeletonLoader'
import ShareButton from './components/ShareButton'
import ViewToggle, { ViewMode } from './components/ViewToggle'
import MapView from './components/MapView'
import { useQueryParam } from './hooks/useQueryParam'
import { Place } from './types'

function App() {
  const [query, setQuery] = useQueryParam('q', '')
  const [city, setCity] = useQueryParam('city', '')
  const [allPlaces, setAllPlaces] = useState<Place[]>([]) // All places from API
  const [visiblePlaces, setVisiblePlaces] = useState<Place[]>([]) // Currently visible places
  const [visibleCount, setVisibleCount] = useState(6) // How many places to show initially
  const [explanation, setExplanation] = useState<string>('')
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasAutoSearched, setHasAutoSearched] = useState(false)
  
  // Map-related state
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null)
  const [hoveredPlaceId, setHoveredPlaceId] = useState<string | null>(null)
  
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('darkMode') === 'true' ||
             (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches)
    }
    return false
  })

  const observer = useRef<IntersectionObserver>()

  // Apply dark mode class to document
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    localStorage.setItem('darkMode', darkMode.toString())
  }, [darkMode])

  // Update visible places when allPlaces or visibleCount changes
  useEffect(() => {
    setVisiblePlaces(allPlaces.slice(0, visibleCount))
  }, [allPlaces, visibleCount])

  // Reset selected place when places change
  useEffect(() => {
    if (allPlaces.length > 0 && !allPlaces.find(p => p.id === selectedPlaceId)) {
      setSelectedPlaceId(null)
    }
  }, [allPlaces, selectedPlaceId])

  // Infinite scroll: load more places when user scrolls to bottom
  const lastPlaceElementRef = useCallback((node: HTMLDivElement) => {
    if (isLoadingMore) return
    if (observer.current) observer.current.disconnect()
    
    observer.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && visibleCount < allPlaces.length) {
        setIsLoadingMore(true)
        setTimeout(() => {
          setVisibleCount(prev => Math.min(prev + 6, allPlaces.length))
          setIsLoadingMore(false)
        }, 500) // Small delay for smooth UX
      }
    })
    
    if (node) observer.current.observe(node)
  }, [isLoadingMore, visibleCount, allPlaces.length])

  // Get user's location for city auto-fill
  useEffect(() => {
    if (!city && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          try {
            const { latitude, longitude } = position.coords
            const response = await fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`
            )
            const data = await response.json()
            if (data.city) {
              setCity(data.city)
            }
          } catch (err) {
            console.error('Failed to get location:', err)
          }
        },
        (err) => {
          console.error('Geolocation error:', err)
        }
      )
    }
  }, [city, setCity])

  const handleSearch = async (searchQuery: string, isPlaceId: boolean) => {
    if (!searchQuery.trim() || !city.trim()) {
      setError('Please enter both a search query and target city')
      return
    }

    setIsLoading(true)
    setError(null)
    setAllPlaces([])
    setVisiblePlaces([])
    setVisibleCount(6) // Reset to initial count
    setExplanation('')
    setSelectedPlaceId(null) // Reset selection

    try {
      // Use relative path for Netlify functions in production, localhost for development
      const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      const endpoint = isDev 
        ? 'http://localhost:8888/.netlify/functions/qloo'
        : '/.netlify/functions/qloo'
      
      const body = isPlaceId 
        ? { type: 'similar', place_id: searchQuery, city, limit: 100 } // Request many results
        : { type: 'taste', query: searchQuery, city, limit: 100 } // Request many results

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const data = await response.json()
      
      if (data.error) {
        throw new Error(data.error)
      }

      setAllPlaces(data.places || [])
      setExplanation(data.explanation || '')
      console.log(`🎯 Received ${data.places?.length || 0} places from API`)
    } catch (err) {
      console.error('Search error:', err)
      setError(err instanceof Error ? err.message : 'An error occurred while searching')
    } finally {
      setIsLoading(false)
    }
  }

  // Auto-search only once when page loads with URL params (shared links)
  useEffect(() => {
    if (query && city && !hasAutoSearched && !isLoading) {
      const isPlaceId = query.startsWith('@')
      const searchQuery = isPlaceId ? query.substring(1) : query
      handleSearch(searchQuery, isPlaceId)
      setHasAutoSearched(true)
    }
  }, [query, city, hasAutoSearched, isLoading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle place selection from map or list
  const handlePlaceSelect = (place: Place) => {
    setSelectedPlaceId(selectedPlaceId === place.id ? null : place.id)
  }

  // Handle place hover from list
  const handlePlaceHover = (placeId: string | null) => {
    setHoveredPlaceId(placeId)
  }

  // Handle view mode changes
  const handleViewModeChange = (newViewMode: ViewMode) => {
    setViewMode(newViewMode)
    
    // When switching to split view, auto-select first place if none selected
    // This ensures map pins are immediately visible
    if (newViewMode === 'split' && !selectedPlaceId && allPlaces.length > 0) {
      setSelectedPlaceId(allPlaces[0].id)
    }
  }

  // Render results list
  const renderResultsList = () => (
    <div className="p-4">
      {/* Results Header with Counter */}
      {allPlaces.length > 0 && (
        <div className="mb-4 flex items-center justify-between">
          <div className="text-center flex-1">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Showing {visiblePlaces.length} of {allPlaces.length} places
              {visibleCount < allPlaces.length && (
                <span className="ml-2 text-blue-600 dark:text-blue-400">
                  (scroll down for more)
                </span>
              )}
            </p>
          </div>
          {query && city && !isLoading && visiblePlaces.length > 0 && (
            <div className="flex-shrink-0">
              <ShareButton query={query} city={city} />
            </div>
          )}
        </div>
      )}

      {/* Results Grid */}
      {!isLoading && visiblePlaces.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-8">
          {visiblePlaces.map((place, index) => (
            <div
              key={`${place.id}-${index}`}
              ref={index === visiblePlaces.length - 1 ? lastPlaceElementRef : null}
            >
              <ResultCard 
                place={place}
                // For list view - no selection behavior, just open Google Maps
                isSelected={false}
                onHover={undefined}
                onSelect={undefined}
              />
            </div>
          ))}
        </div>
      )}

      {/* Loading More Indicator */}
      {isLoadingMore && (
        <div className="mt-6 text-center pb-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            <span className="text-gray-600 dark:text-gray-400 text-sm">Loading more places...</span>
          </div>
        </div>
      )}

      {/* End of Results Indicator */}
      {!isLoading && allPlaces.length > 0 && visibleCount >= allPlaces.length && (
        <div className="mt-6 text-center pb-8">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            🎉 You've seen all {allPlaces.length} places! Try a new search to discover more.
          </p>
        </div>
      )}
    </div>
  )

  return (
    <div className={`h-screen transition-colors duration-200 ${darkMode ? 'dark bg-gray-900' : 'bg-gray-50'}`}>
      <div className="container mx-auto px-4 py-8 max-w-7xl h-full flex flex-col">
        {/* Header */}
        <div className="text-center mb-8 flex-shrink-0">
          <div className="flex items-center justify-center gap-4 mb-4">
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Qloo Taste Discovery
            </h1>
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg bg-white dark:bg-gray-800 shadow-md hover:shadow-lg transition-shadow"
              aria-label="Toggle dark mode"
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
          <p className="text-gray-600 dark:text-gray-300 text-lg">
            Discover places that match your taste using AI-powered recommendations
          </p>
        </div>

        {/* Search Form */}
        <div className="mb-8 flex-shrink-0">
          <InputBar
            onSearch={handleSearch}
            isLoading={isLoading}
            query={query}
            setQuery={setQuery}
            city={city}
            setCity={setCity}
          />
        </div>

        {/* Overall Explanation */}
        {explanation && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex-shrink-0">
            <p className="text-blue-800 dark:text-blue-200 text-sm leading-relaxed">
              {explanation}
            </p>
          </div>
        )}

        {/* View Toggle - Only show when we have results */}
        {!isLoading && allPlaces.length > 0 && (
          <div className="mb-4 flex justify-center flex-shrink-0">
            <ViewToggle
              currentView={viewMode}
              onViewChange={handleViewModeChange}
            />
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex-shrink-0">
            <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 flex-1">
            {[...Array(6)].map((_, index) => (
              <SkeletonLoader key={index} />
            ))}
          </div>
        )}

        {/* Results - Different layouts based on view mode */}
        {!isLoading && visiblePlaces.length > 0 && (
          <div className="flex-1 min-h-0">
            {/* LIST VIEW - Infinite scroll with proper background */}
            {viewMode === 'list' && (
              <div 
                className="bg-gray-50 dark:bg-gray-900 pb-24" 
                style={{ 
                  minHeight: 'max(100vh, 200vh, 100%)',
                  marginLeft: 'calc(-50vw + 50%)',
                  marginRight: 'calc(-50vw + 50%)',
                  paddingLeft: 'calc(50vw - 50% + 2rem)',
                  paddingRight: 'calc(50vw - 50% + 2rem)',
                  marginBottom: '-2rem',
                  overflowX: 'hidden'
                }}
              >
                {renderResultsList()}
              </div>
            )}
            
            {/* MAP VIEW - Full map without extra wrappers */}
            {viewMode === 'map' && (
              <div className="h-full">
                <MapView
                  places={allPlaces}
                  selectedPlaceId={selectedPlaceId || undefined}
                  onPlaceSelect={handlePlaceSelect}
                  city={city}
                  isFullMapView={true}
                />
              </div>
            )}
            
            {/* SPLIT VIEW - Fixed height with internal scrolling */}
            {viewMode === 'split' && (
              <div className="h-full flex">
                {/* Left Panel - Sticky Header + Scrollable Results */}
                <div className="w-1/2 h-full bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                  {/* Sticky Header */}
                  {allPlaces.length > 0 && (
                    <div className="flex-shrink-0 p-4 pb-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="text-center flex-1">
                          <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Showing {visiblePlaces.length} of {allPlaces.length} places
                            {visibleCount < allPlaces.length && (
                              <span className="ml-2 text-blue-600 dark:text-blue-400">
                                (scroll down for more)
                              </span>
                            )}
                          </p>
                        </div>
                        {query && city && !isLoading && visiblePlaces.length > 0 && (
                          <div className="flex-shrink-0">
                            <ShareButton query={query} city={city} />
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Scrollable Content Area */}
                  <div className="flex-1 overflow-y-auto">
                    <div className="p-4">
                      {/* Results Grid */}
                      {!isLoading && visiblePlaces.length > 0 && (
                        <div className="grid grid-cols-3 gap-3 pb-8">
                          {visiblePlaces.map((place, index) => (
                            <div
                              key={`${place.id}-${index}`}
                              ref={index === visiblePlaces.length - 1 ? lastPlaceElementRef : null}
                            >
                              <ResultCard 
                                place={place}
                                isSelected={selectedPlaceId === place.id}
                                onHover={handlePlaceHover}
                                onSelect={handlePlaceSelect}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Loading More Indicator */}
                      {isLoadingMore && (
                        <div className="mt-6 text-center pb-8">
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                            <span className="text-gray-600 dark:text-gray-400 text-sm">Loading more places...</span>
                          </div>
                        </div>
                      )}

                      {/* End of Results Indicator */}
                      {!isLoading && allPlaces.length > 0 && visibleCount >= allPlaces.length && (
                        <div className="mt-6 text-center pb-8">
                          <p className="text-gray-500 dark:text-gray-400 text-sm">
                            🎉 You've seen all {allPlaces.length} places! Try a new search to discover more.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Panel - Fixed Height Map */}
                <div className="w-1/2 h-full">
                  <MapView
                    places={allPlaces}
                    selectedPlaceId={selectedPlaceId || hoveredPlaceId || (allPlaces.length > 0 ? allPlaces[0].id : undefined)}
                    onPlaceSelect={handlePlaceSelect}
                    city={city}
                    isFullMapView={false}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* No Results */}
        {!isLoading && query && city && visiblePlaces.length === 0 && !error && (
          <div className="text-center py-12 flex-1 flex items-center justify-center">
            <div>
              <div className="text-6xl mb-4">🔍</div>
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                No places found
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Try adjusting your search terms or exploring a different city.
              </p>
            </div>
          </div>
        )}

        {/* Welcome State */}
        {!isLoading && !query && (
          <div className="text-center py-12 flex-1 flex items-center justify-center">
            <div>
              <div className="text-6xl mb-4">🍴</div>
              <h3 className="text-xl font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Ready to discover amazing places?
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Enter your taste preferences and city to get personalized recommendations.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App 