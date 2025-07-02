import { Handler } from '@netlify/functions'

interface RequestBody {
  url?: string
  place_id?: string
  type?: 'parse' | 'autocomplete'
  input?: string
  city?: string
}

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    }
  }

  try {
    const body: RequestBody = JSON.parse(event.body || '{}')
    const { url, place_id, type = 'parse', input, city } = body

    // Handle URL parsing requests
    if (type === 'parse' && url) {
      console.log(`🔗 Parsing URL: ${url}`)
      
      const parsed = parseGoogleMapsUrl(url)
      
      // Handle shortened URLs that need resolution
      if (parsed.type === 'shortened' && parsed.needsResolution) {
        console.log(`🔄 Resolving shortened URL: ${url}`)
        const resolvedUrl = await resolveGoogleMapsUrl(url)
        
        if (resolvedUrl !== url) {
          // Parse the resolved URL
          const resolvedParsed = parseGoogleMapsUrl(resolvedUrl)
          console.log(`✅ Resolved to: ${resolvedParsed.query || resolvedParsed.place_id || 'Unknown place'}`)
          
          return {
            statusCode: 200,
            body: JSON.stringify({
              original_url: url,
              resolved_url: resolvedUrl,
              ...resolvedParsed
            })
          }
        }
      }
      
      return {
        statusCode: 200,
        body: JSON.stringify(parsed)
      }
    }

    // Handle autocomplete requests
    if (type === 'autocomplete' && input) {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Google Maps API key not configured' })
        }
      }

      try {
        let autocompleteUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(input)}&key=${process.env.GOOGLE_MAPS_API_KEY}&types=establishment`
        
        // Add location bias if city is provided
        if (city) {
          try {
            // First, geocode the city to get coordinates
            const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(city)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
            const geocodeResponse = await fetch(geocodeUrl)
            
            if (geocodeResponse.ok) {
              const geocodeData = await geocodeResponse.json()
              if (geocodeData.results && geocodeData.results.length > 0) {
                const location = geocodeData.results[0].geometry.location
                const lat = location.lat
                const lng = location.lng
                autocompleteUrl += `&location=${lat},${lng}&radius=50000`
                console.log(`Adding location bias for ${city}: ${lat},${lng}`)
              }
            }
          } catch (geocodeError) {
            console.log('Failed to add location bias:', geocodeError)
          }
        }

        const response = await fetch(autocompleteUrl)
        
        if (response.ok) {
          const data = await response.json()
          return {
            statusCode: 200,
            body: JSON.stringify(data)
          }
        } else {
          const errorText = await response.text()
          console.error('Google Places Autocomplete error:', errorText)
          return {
            statusCode: response.status,
            body: JSON.stringify({ error: 'Google Places API error', details: errorText })
          }
        }
      } catch (error) {
        console.error('Autocomplete request failed:', error)
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch autocomplete suggestions' })
        }
      }
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Invalid request. Provide either url or input with type.' })
    }

  } catch (error) {
    console.error('Parse place error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    }
  }
}

// Resolve shortened Google Maps URLs
const resolveGoogleMapsUrl = async (url: string): Promise<string> => {
  try {
    // For shortened URLs, follow redirects to get the actual URL
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual'
    })
    
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      if (location) {
        console.log(`📍 Resolved ${url} → ${location}`)
        return location
      }
    }
    
    // If no redirect, return original URL
    return url
  } catch (error) {
    console.log(`❌ Failed to resolve ${url}:`, error)
    return url
  }
}

function parseGoogleMapsUrl(url: string) {
  try {
    const urlObj = new URL(url)
    
    // Handle shortened goo.gl URLs - these need to be resolved first
    if (urlObj.hostname.includes('goo.gl') || urlObj.hostname.includes('maps.app.goo.gl')) {
      return {
        type: 'shortened',
        needsResolution: true,
        originalUrl: url
      }
    }
    
    // Extract place_id from various URL formats
    const placeId = urlObj.searchParams.get('place_id')
    if (placeId) {
      return { 
        type: 'place_id',
        place_id: placeId,
        query: null,
        note: 'Place ID found'
      }
    }
    
    // Extract from /place/ path
    const placeMatch = urlObj.pathname.match(/\/place\/([^\/]+)/)
    if (placeMatch) {
      const placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
      return {
        type: 'place_name',
        query: placeName,
        place_id: null,
        note: 'Place name extracted from path'
      }
    }
    
    // Extract from query parameter
    const qParam = urlObj.searchParams.get('q')
    if (qParam) {
      return {
        type: 'query',
        query: qParam,
        place_id: null,
        note: 'Query parameter found'
      }
    }
    
    // Generic Google Maps URL
    return {
      type: 'maps_url',
      query: 'Google Maps location',
      place_id: null,
      note: 'Generic maps URL'
    }
    
  } catch (error) {
    return {
      type: 'error',
      query: null,
      place_id: null,
      note: 'Invalid URL format'
    }
  }
} 