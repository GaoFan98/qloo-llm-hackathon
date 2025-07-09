import { useEffect, useRef, useState } from 'react'
import { Place } from '../types'

interface MapViewProps {
  places: Place[]
  onPlaceSelect?: (place: Place) => void
  selectedPlaceId?: string
  city: string
  isFullMapView?: boolean
}

declare global {
  interface Window {
    google: any
    initMap: () => void
  }
}

const MapView = ({ places, onPlaceSelect, selectedPlaceId, city, isFullMapView = false }: MapViewProps) => {
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const markersRef = useRef<any[]>([])
  const infoWindowRef = useRef<any>(null)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isMapReady, setIsMapReady] = useState(false)
  const [selectedPlaceCard, setSelectedPlaceCard] = useState<Place | null>(null)
  const [cardPosition, setCardPosition] = useState<{ x: number, y: number, arrow?: string } | null>(null)

  // Fallback coordinates for major cities
  const getCityFallbackCoords = (cityName: string) => {
    const cityCoords: { [key: string]: { lat: number, lng: number } } = {
      'tokyo': { lat: 35.6762, lng: 139.6503 },
      'osaka': { lat: 34.6937, lng: 135.5023 },
      'kyoto': { lat: 35.0116, lng: 135.7681 },
      'yokohama': { lat: 35.4437, lng: 139.6380 },
      'nagoya': { lat: 35.1815, lng: 136.9066 },
      'sapporo': { lat: 43.0642, lng: 141.3469 },
      'fukuoka': { lat: 33.5904, lng: 130.4017 },
      'kobe': { lat: 34.6901, lng: 135.1956 },
      'sendai': { lat: 38.2682, lng: 140.8694 },
      'hiroshima': { lat: 34.3853, lng: 132.4553 }
    }
    
    const normalizedCity = cityName.toLowerCase().trim()
    return cityCoords[normalizedCity] || { lat: 35.6762, lng: 139.6503 } // Default to Tokyo
  }

  // Generate random coordinates within a city area
  const generateRandomCoordinatesInCity = (cityName: string, index: number) => {
    const baseCoords = getCityFallbackCoords(cityName)
    // Add slight randomization based on index to spread markers around the city
    const offsetRange = 0.02 // About 2km range
    const latOffset = (Math.sin(index * 2.3) * offsetRange)
    const lngOffset = (Math.cos(index * 1.7) * offsetRange)
    
    return {
      lat: baseCoords.lat + latOffset,
      lng: baseCoords.lng + lngOffset
    }
  }

  // Load Google Maps script
  useEffect(() => {
    const loadGoogleMaps = async () => {
      try {
        // Check if Google Maps is already loaded
        if (window.google && window.google.maps) {
          console.log('MapView: Google Maps already loaded')
          setIsLoaded(true)
          return
        }

        console.log('MapView: Fetching Google Maps API key from secure endpoint')
        
        // Get API key from secure endpoint
        const response = await fetch('/.netlify/functions/maps-config', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
        
        if (!response.ok) {
          console.error('MapView: Failed to get API key from secure endpoint')
          return
        }
        
        const { apiKey } = await response.json()
        
        if (!apiKey) {
          console.error('MapView: No API key received from secure endpoint')
          return
        }

        console.log('MapView: Successfully received API key, loading Google Maps script')

        // Create script element
        const script = document.createElement('script')
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
        script.async = true
        script.defer = true
        
        // Set up callback for when script loads
        script.onload = () => {
          console.log('MapView: Google Maps script loaded successfully')
          setIsLoaded(true)
        }
        
        script.onerror = (error) => {
          console.error('MapView: Failed to load Google Maps script:', error)
        }
        
        document.head.appendChild(script)

        return () => {
          // Cleanup - remove script if component unmounts
          try {
            if (script.parentNode) {
              document.head.removeChild(script)
            }
          } catch (e) {
            // Script might already be removed
            console.log('MapView: Script cleanup completed')
          }
        }
      } catch (error) {
        console.error('MapView: Error loading Google Maps:', error)
      }
    }

    loadGoogleMaps()
  }, [])

  // Initialize map when Google Maps is loaded
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !window.google) {
      console.log('MapView: Skipping map initialization - requirements not met:', {
        isLoaded,
        hasMapRef: !!mapRef.current,
        hasGoogle: !!window.google
      })
      return
    }

    console.log('MapView: Initializing map for city:', city)

    // Geocode city to get center coordinates
    const geocoder = new window.google.maps.Geocoder()
    
    const initializeMapWithCenter = (center: any) => {
      console.log('MapView: Creating map with center:', center)
      
      mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
        center: center,
        zoom: 12,
        styles: [
          {
            featureType: 'poi',
            elementType: 'labels',
            stylers: [{ visibility: 'off' }]
          }
        ],
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: true,
        zoomControl: true,
        gestureHandling: 'greedy'
      })

      // Initialize InfoWindow
      infoWindowRef.current = new window.google.maps.InfoWindow()
      
      // Mark map as ready
      setIsMapReady(true)
      console.log('MapView: Map initialized successfully and marked as ready')
    }
    
    geocoder.geocode({ address: city }, (results: any, status: any) => {
      if (status === 'OK' && results[0]) {
        console.log('MapView: Geocoding successful for city:', city)
        const center = results[0].geometry.location
        initializeMapWithCenter(center)
      } else {
        console.log('MapView: Geocoding failed for city, using fallback coordinates')
        // Fallback to default center based on city
        const fallbackCenter = getCityFallbackCoords(city)
        initializeMapWithCenter(fallbackCenter)
      }
    })
  }, [isLoaded, city])

  // Update markers when places change OR when map becomes ready
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current || !window.google || !places.length) {
      console.log('MapView: Skipping marker update - missing requirements:', {
        isMapReady,
        hasMap: !!mapInstanceRef.current,
        hasGoogle: !!window.google,
        placesCount: places.length
      })
      return
    }

    console.log('MapView: Updating markers for', places.length, 'places')

    // Clear existing markers
    markersRef.current.forEach(marker => marker.setMap(null))
    markersRef.current = []

    // Create new markers
    const bounds = new window.google.maps.LatLngBounds()
    let processedMarkers = 0
    const totalPlaces = places.length

    // Function to create marker with given coordinates
    const createMarker = (place: any, position: any, isFallback = false) => {
      console.log(`MapView: Creating ${isFallback ? 'fallback ' : ''}marker for ${place.name}`)
      
      const marker = new window.google.maps.Marker({
        position: position,
        map: mapInstanceRef.current,
        title: place.name,
        icon: {
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
          fillColor: selectedPlaceId === place.id ? '#EF4444' : '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
          scale: selectedPlaceId === place.id ? 1.8 : 1.5,
          anchor: new window.google.maps.Point(12, 24),
          labelOrigin: new window.google.maps.Point(12, 9)
        },
        zIndex: selectedPlaceId === place.id ? 1000 : 1,
        animation: selectedPlaceId === place.id ? window.google.maps.Animation.BOUNCE : null
      })

      // Add click listener to marker
      marker.addListener('click', (event: any) => {
        // Prevent map click event from firing
        if (event) {
          event.stop()
        }
        
        if (isFullMapView) {
          // In full map view, show custom card overlay
          setSelectedPlaceCard(place)
          
          // Smart positioning based on available space around the marker
          const mapContainer = mapRef.current
          if (mapContainer) {
            const containerRect = mapContainer.getBoundingClientRect()
            
            // Get marker position in screen coordinates
            const projection = mapInstanceRef.current.getProjection()
            const bounds = mapInstanceRef.current.getBounds()
            
            if (projection && bounds) {
              const markerLatLng = marker.getPosition()
              const ne = bounds.getNorthEast()
              const sw = bounds.getSouthWest()
              
              // Calculate marker position as percentage of map dimensions
              const latRange = ne.lat() - sw.lat()
              const lngRange = ne.lng() - sw.lng()
              
              const markerLat = markerLatLng.lat()
              const markerLng = markerLatLng.lng()
              
              const xPercent = (markerLng - sw.lng()) / lngRange
              const yPercent = (ne.lat() - markerLat) / latRange // Flip Y coordinate
              
              const markerX = xPercent * containerRect.width
              const markerY = yPercent * containerRect.height
              
              // Card dimensions (smaller size)
              const cardWidth = 280
              const cardHeight = 220
              const margin = 16
              
              // Calculate available space in each direction
              const spaceRight = containerRect.width - markerX - margin
              const spaceLeft = markerX - margin
              const spaceBottom = containerRect.height - markerY - margin
              const spaceTop = markerY - margin
              
              let cardX, cardY, arrowClass = ''
              
              if (spaceRight >= cardWidth) {
                // Position to the right of marker
                cardX = markerX + 20
                cardY = Math.max(margin, Math.min(markerY - cardHeight / 2, containerRect.height - cardHeight - margin))
                arrowClass = 'left-arrow'
              } else if (spaceLeft >= cardWidth) {
                // Position to the left of marker
                cardX = markerX - cardWidth - 20
                cardY = Math.max(margin, Math.min(markerY - cardHeight / 2, containerRect.height - cardHeight - margin))
                arrowClass = 'right-arrow'
              } else if (spaceBottom >= cardHeight) {
                // Position below marker
                cardX = Math.max(margin, Math.min(markerX - cardWidth / 2, containerRect.width - cardWidth - margin))
                cardY = markerY + 20
                arrowClass = 'top-arrow'
              } else if (spaceTop >= cardHeight) {
                // Position above marker
                cardX = Math.max(margin, Math.min(markerX - cardWidth / 2, containerRect.width - cardWidth - margin))
                cardY = markerY - cardHeight - 20
                arrowClass = 'bottom-arrow'
              } else {
                // Fallback: position in the corner with most space
                if (spaceRight + spaceBottom > spaceLeft + spaceTop) {
                  cardX = Math.max(margin, containerRect.width - cardWidth - margin)
                  cardY = Math.max(margin, containerRect.height - cardHeight - margin)
                  arrowClass = 'no-arrow'
                } else {
                  cardX = margin
                  cardY = margin
                  arrowClass = 'no-arrow'
                }
              }
              
              setCardPosition({ x: cardX, y: cardY, arrow: arrowClass })
            }
          }
        } else {
          // In split view, use the existing info window behavior
          const content = `
            <div class="p-0 max-w-xs w-80 font-sans">
              <div class="bg-white rounded-lg shadow-lg overflow-hidden">
                ${place.image ? `
                  <div class="h-40 w-full bg-gray-200 overflow-hidden">
                    <img 
                      src="${place.image}" 
                      alt="${place.name}"
                      class="w-full h-full object-cover"
                      onerror="this.style.display='none'"
                    />
                  </div>
                ` : ''}
                
                <div class="p-4">
                  <div class="flex items-start justify-between mb-2">
                    <h3 class="text-lg font-semibold text-gray-900 flex-1 pr-2 leading-tight">${place.name}</h3>
                    <button 
                      onclick="event.stopPropagation(); window.open('https://www.google.com/maps/search/${encodeURIComponent(place.name + ' ' + place.address)}', '_blank')"
                      class="p-1 rounded hover:bg-gray-100 transition-colors flex-shrink-0"
                      title="Open in Google Maps"
                    >
                      <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </button>
                  </div>
                  
                  <p class="text-sm text-gray-600 mb-3 leading-relaxed">${place.address}</p>
                  
                  ${place.rating ? `
                    <div class="flex items-center mb-3">
                      <div class="flex items-center">
                        <svg class="w-4 h-4 text-yellow-400 mr-1" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        <span class="text-sm font-medium text-gray-900">${place.rating.toFixed(1)}</span>
                        ${place.reviewCount ? `<span class="text-sm text-gray-500 ml-1">(${place.reviewCount.toLocaleString()})</span>` : ''}
                      </div>
                    </div>
                  ` : ''}
                  
                  ${place.explanation ? `
                    <p class="text-sm text-gray-700 leading-relaxed mb-4 max-h-20 overflow-hidden">${place.explanation.length > 120 ? place.explanation.substring(0, 120) + '...' : place.explanation}</p>
                  ` : ''}
                  
                  <div class="pt-3 border-t border-gray-100">
                    <button 
                      onclick="window.open('https://www.google.com/maps/search/${encodeURIComponent(place.name + ' ' + place.address)}', '_blank')"
                      class="w-full bg-gray-900 hover:bg-gray-800 text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors flex items-center justify-center"
                    >
                      <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      View on Google Maps
                    </button>
                  </div>
                </div>
              </div>
            </div>
          `

          infoWindowRef.current.setContent(content)
          infoWindowRef.current.open(mapInstanceRef.current, marker)
        }
        
        // Notify parent component
        if (onPlaceSelect) {
          onPlaceSelect(place)
        }
      })

      markersRef.current.push(marker)
      bounds.extend(position)
      return marker
    }

    // Function to handle completion of all markers
    const handleMarkersComplete = () => {
      console.log('MapView: All markers processed, fitting bounds with', markersRef.current.length, 'markers')
      if (markersRef.current.length > 1) {
        mapInstanceRef.current.fitBounds(bounds)
        // Ensure minimum zoom level
        const listener = window.google.maps.event.addListener(mapInstanceRef.current, 'zoom_changed', () => {
          if (mapInstanceRef.current.getZoom() > 15) {
            mapInstanceRef.current.setZoom(15)
          }
          window.google.maps.event.removeListener(listener)
        })
      } else if (markersRef.current.length === 1) {
        // Single marker - center on it with reasonable zoom
        const markerPosition = markersRef.current[0].getPosition()
        mapInstanceRef.current.setCenter(markerPosition)
        mapInstanceRef.current.setZoom(14)
      }
    }

    // Create markers immediately with fallback coordinates, then try to improve them with geocoding
    places.forEach((place, index) => {
      console.log(`MapView: Processing place ${index + 1}: ${place.name}`)
      
      // Try geocoding first - only create marker with proper coordinates
      const geocoder = new window.google.maps.Geocoder()
      let geocodingCompleted = false
      
      // Set a timeout for geocoding attempt (3 seconds)
      const geocodingTimeout = setTimeout(() => {
        if (!geocodingCompleted) {
          console.log(`MapView: Geocoding timeout for ${place.name}, using fallback coordinates`)
          geocodingCompleted = true
          
          // Only use fallback if geocoding completely fails
          const fallbackCoords = generateRandomCoordinatesInCity(city, index)
          const fallbackPosition = new window.google.maps.LatLng(fallbackCoords.lat, fallbackCoords.lng)
          createMarker(place, fallbackPosition, true)
          
          processedMarkers++
          if (processedMarkers === totalPlaces) {
            handleMarkersComplete()
          }
        }
      }, 3000)
      
      // Try geocoding with place name and address
      geocoder.geocode({ address: `${place.name}, ${place.address}` }, (results: any, status: any) => {
        if (geocodingCompleted) return
        
        if (status === 'OK' && results[0]) {
          console.log(`MapView: Geocoding successful for ${place.name}`)
          geocodingCompleted = true
          clearTimeout(geocodingTimeout)
          
          const position = results[0].geometry.location
          createMarker(place, position)
          
          processedMarkers++
          if (processedMarkers === totalPlaces) {
            handleMarkersComplete()
          }
        } else {
          // Try with just the address as backup
          geocoder.geocode({ address: place.address }, (altResults: any, altStatus: any) => {
            if (geocodingCompleted) return
            
            if (altStatus === 'OK' && altResults[0]) {
              console.log(`MapView: Alternate geocoding successful for ${place.name}`)
              geocodingCompleted = true
              clearTimeout(geocodingTimeout)
              
              const position = altResults[0].geometry.location
              createMarker(place, position)
              
              processedMarkers++
              if (processedMarkers === totalPlaces) {
                handleMarkersComplete()
              }
            }
            // If this also fails, the timeout will handle it with fallback coordinates
          })
        }
      })
    })

    // Emergency fallback if no markers were created after 5 seconds
    const emergencyTimeout = setTimeout(() => {
      if (markersRef.current.length === 0) {
        console.log('MapView: Emergency fallback - creating markers with random coordinates')
        places.forEach((place, index) => {
          const coords = generateRandomCoordinatesInCity(city, index)
          const position = new window.google.maps.LatLng(coords.lat, coords.lng)
          createMarker(place, position, true)
        })
        handleMarkersComplete()
      }
    }, 5000)

    return () => {
      clearTimeout(emergencyTimeout)
    }
  }, [isMapReady, places, selectedPlaceId, onPlaceSelect, city])

  // Update marker styles when selected place changes
  useEffect(() => {
    markersRef.current.forEach((marker, index) => {
      const place = places[index]
      if (place) {
        marker.setIcon({
          path: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
          fillColor: selectedPlaceId === place.id ? '#EF4444' : '#3B82F6',
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 3,
          scale: selectedPlaceId === place.id ? 1.8 : 1.5,
          anchor: new window.google.maps.Point(12, 24),
          labelOrigin: new window.google.maps.Point(12, 9)
        })
        marker.setZIndex(selectedPlaceId === place.id ? 1000 : 1)
      }
    })
  }, [selectedPlaceId, places])

  // Close card when view mode changes or places change
  useEffect(() => {
    setSelectedPlaceCard(null)
    setCardPosition(null)
  }, [isFullMapView, places])

  // Add click handler to map to close card when clicking outside
  useEffect(() => {
    if (!mapInstanceRef.current || !isFullMapView) return

    const handleMapClick = () => {
      setSelectedPlaceCard(null)
      setCardPosition(null)
    }

    const listener = mapInstanceRef.current.addListener('click', handleMapClick)

    return () => {
      if (listener) {
        window.google.maps.event.removeListener(listener)
      }
    }
  }, [isMapReady, isFullMapView])

  if (!isLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100 dark:bg-gray-800">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Loading map...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-full relative">
      <div ref={mapRef} className="w-full h-full" />
      
      {/* Beautiful Card Overlay for Full Map View */}
      {isFullMapView && selectedPlaceCard && cardPosition && (
        <>
          {/* Backdrop overlay */}
          <div 
            className="absolute inset-0 bg-black bg-opacity-20 z-40 transition-opacity duration-300"
            onClick={() => {
              setSelectedPlaceCard(null)
              setCardPosition(null)
            }}
          />
          
          <div 
            className={`absolute z-50 bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden transform transition-all duration-500 ease-out animate-in slide-in-from-right-5 fade-in ${cardPosition.arrow || ''}`}
            style={{
              left: cardPosition.x,
              top: cardPosition.y,
              width: '280px'
            }}
          >
            {/* Arrow Pointer */}
            {cardPosition.arrow && cardPosition.arrow !== 'no-arrow' && (
              <div 
                className={`absolute w-0 h-0 border-solid ${
                  cardPosition.arrow === 'left-arrow' ? 
                    '-left-2 top-1/2 -translate-y-1/2 border-r-8 border-r-white dark:border-r-gray-800 border-t-8 border-t-transparent border-b-8 border-b-transparent' :
                  cardPosition.arrow === 'right-arrow' ? 
                    '-right-2 top-1/2 -translate-y-1/2 border-l-8 border-l-white dark:border-l-gray-800 border-t-8 border-t-transparent border-b-8 border-b-transparent' :
                  cardPosition.arrow === 'top-arrow' ? 
                    'left-1/2 -translate-x-1/2 -top-2 border-b-8 border-b-white dark:border-b-gray-800 border-l-8 border-l-transparent border-r-8 border-r-transparent' :
                  cardPosition.arrow === 'bottom-arrow' ? 
                    'left-1/2 -translate-x-1/2 -bottom-2 border-t-8 border-t-white dark:border-t-gray-800 border-l-8 border-l-transparent border-r-8 border-r-transparent' :
                    ''
                }`}
              />
            )}
            
            {/* Card Header with Close Button */}
            <div className="relative">
              {selectedPlaceCard.image && (
                <div className="h-32 w-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <img 
                    src={selectedPlaceCard.image} 
                    alt={selectedPlaceCard.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                    }}
                  />
                </div>
              )}
              
              {/* Close Button */}
              <button
                onClick={() => {
                  setSelectedPlaceCard(null)
                  setCardPosition(null)
                }}
                className="absolute top-2 right-2 w-7 h-7 bg-white dark:bg-gray-800 bg-opacity-95 hover:bg-opacity-100 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 hover:scale-110 border border-gray-200 dark:border-gray-600"
              >
                <svg className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Card Content */}
            <div className="p-3">
              {/* Title and Rating */}
              <div className="mb-2">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white leading-tight mb-1 line-clamp-1">
                  {selectedPlaceCard.name}
                </h3>
                
                {selectedPlaceCard.rating && (
                  <div className="flex items-center">
                    <svg className="w-3.5 h-3.5 text-yellow-400 mr-1" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {selectedPlaceCard.rating.toFixed(1)}
                    </span>
                    {selectedPlaceCard.reviewCount && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        ({selectedPlaceCard.reviewCount.toLocaleString()})
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Short Description */}
              {selectedPlaceCard.explanation && (
                <p className="text-xs text-gray-600 dark:text-gray-300 leading-relaxed mb-3 line-clamp-2">
                  {selectedPlaceCard.explanation.length > 80 
                    ? selectedPlaceCard.explanation.substring(0, 80) + '...' 
                    : selectedPlaceCard.explanation
                  }
                </p>
              )}

              {/* Action Button */}
              <button 
                onClick={() => {
                  window.open(
                    `https://www.google.com/maps/search/${encodeURIComponent(selectedPlaceCard.name + ' ' + selectedPlaceCard.address)}`, 
                    '_blank'
                  )
                }}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors flex items-center justify-center shadow-lg hover:shadow-xl"
              >
                <svg className="w-3.5 h-3.5 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                View on Google Maps
              </button>
            </div>
          </div>
        </>
      )}
      
      {places.length > 0 && (
        <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300">
          {places.length} place{places.length !== 1 ? 's' : ''} shown
        </div>
      )}
    </div>
  )
}

export default MapView 