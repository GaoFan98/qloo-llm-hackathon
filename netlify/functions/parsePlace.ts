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
            const geocodeData = await geocodeResponse.json()
            
            if (geocodeData.status === 'OK' && geocodeData.results.length > 0) {
              const location = geocodeData.results[0].geometry.location
              const lat = location.lat
              const lng = location.lng
              
              // Add location bias (circle with ~50km radius)
              autocompleteUrl += `&location=${lat},${lng}&radius=50000&strictbounds=false`
              console.log(`Adding location bias for ${city}: ${lat},${lng}`)
            }
          } catch (geocodeError) {
            console.error('Geocoding error:', geocodeError)
            // Continue without location bias if geocoding fails
          }
        }
        
        const response = await fetch(autocompleteUrl)
        const data = await response.json()

        if (data.status === 'OK') {
          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type',
              'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({
              predictions: data.predictions || []
            })
          }
        } else {
          console.error('Google Places Autocomplete error:', data.status, data.error_message)
          return {
            statusCode: 200,
            body: JSON.stringify({ predictions: [] })
          }
        }
      } catch (error) {
        console.error('Autocomplete API error:', error)
        return {
          statusCode: 200,
          body: JSON.stringify({ predictions: [] })
        }
      }
    }

    // Handle URL parsing (existing functionality)
    if (url) {
      const parsedData = parseGoogleMapsUrl(url)
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Allow-Methods': 'POST, OPTIONS'
        },
        body: JSON.stringify(parsedData)
      }
    }

    // Handle place details lookup (existing functionality)  
    if (place_id) {
      if (!process.env.GOOGLE_MAPS_API_KEY) {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Google Maps API key not configured' })
        }
      }

      try {
        const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&fields=name,formatted_address,photos,rating&key=${process.env.GOOGLE_MAPS_API_KEY}`
        
        const response = await fetch(detailsUrl)
        const data = await response.json()

        if (data.status === 'OK') {
          const place = data.result
          let photo_reference = null
          
          if (place.photos && place.photos.length > 0) {
            photo_reference = place.photos[0].photo_reference
          }

          return {
            statusCode: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Headers': 'Content-Type',
              'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: JSON.stringify({
              place_id,
              name: place.name,
              address: place.formatted_address,
              rating: place.rating,
              photo_reference
            })
          }
        } else {
          return {
            statusCode: 404,
            body: JSON.stringify({ error: 'Place not found' })
          }
        }
      } catch (error) {
        console.error('Google Places API error:', error)
        return {
          statusCode: 500,
          body: JSON.stringify({ error: 'Failed to fetch place details' })
        }
      }
    }

    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing required parameters' })
    }

  } catch (error) {
    console.error('Parse place error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    }
  }
}

function parseGoogleMapsUrl(url: string) {
  try {
    const urlObj = new URL(url)
    
    // Handle shortened goo.gl URLs - these need special handling
    if (urlObj.hostname.includes('goo.gl') || urlObj.hostname.includes('maps.app.goo.gl')) {
      // For shortened URLs, we can't parse them directly without following redirects
      // Return a success response indicating it's a valid shortened URL
      return {
        type: 'shortened',
        place_id: null,
        query: 'location from Google Maps', // Generic fallback
        note: 'Shortened Google Maps URL detected'
      }
    }
    
    // Extract place_id from various URL formats
    const placeId = urlObj.searchParams.get('place_id')
    if (placeId) {
      return { 
        type: 'place_id',
        place_id: placeId,
        query: null
      }
    }
    
    // Extract from /place/ URLs
    const placeMatch = urlObj.pathname.match(/\/place\/([^\/\@]+)/)
    if (placeMatch) {
      const placeName = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '))
      return {
        type: 'query',
        place_id: null,
        query: placeName
      }
    }
    
    // Extract from q parameter
    const q = urlObj.searchParams.get('q')
    if (q) {
      return {
        type: 'query', 
        place_id: null,
        query: decodeURIComponent(q)
      }
    }
    
    // Check if it's a maps URL but we couldn't parse it
    if (urlObj.hostname.includes('maps.google') || urlObj.hostname.includes('google.com/maps')) {
      return {
        type: 'maps_url',
        place_id: null,
        query: 'location from Google Maps',
        note: 'Google Maps URL detected but could not extract specific place'
      }
    }
    
    return {
      type: 'unknown',
      place_id: null,
      query: null,
      error: 'Could not parse Google Maps URL'
    }
    
  } catch (error) {
    return {
      type: 'error',
      place_id: null,
      query: null,
      error: 'Invalid URL format'
    }
  }
} 