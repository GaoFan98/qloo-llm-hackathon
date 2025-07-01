import { Handler } from '@netlify/functions'

// Cache for OpenAI responses to avoid duplicate calls
const explanationCache = new Map<string, string>()

interface QlooPlace {
  id: string
  name: string
  address: string
  image?: string
  rating?: number
  distance?: number
}

interface RequestBody {
  type: 'similar' | 'taste'
  place_id?: string
  query?: string
  city: string
  limit: number
}

// Get Qloo API base URL from environment or use default
const QLOO_API_URL = process.env.QLOO_API_URL || 'https://api.qloo.com'

const generateExplanation = async (originalQuery: string, place: QlooPlace): Promise<string> => {
  const cacheKey = `${originalQuery}-${place.name}`
  
  if (explanationCache.has(cacheKey)) {
    return explanationCache.get(cacheKey)!
  }

  // Skip OpenAI if no API key
  if (!process.env.OPENAI_API_KEY) {
    return 'Culturally similar place with matching vibe and atmosphere.'
  }

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: 'You are a helpful assistant that explains why places are culturally similar. Keep responses to 1-2 sentences, focusing on atmosphere, style, or cultural elements.'
          },
          {
            role: 'user',
            content: `Why is "${place.name}" similar to the taste query "${originalQuery}"? Focus on cultural similarity, atmosphere, or style.`
          }
        ],
        max_tokens: 60,
        temperature: 0.7
      })
    })

    if (response.ok) {
      const data = await response.json()
      const explanation = data.choices[0]?.message?.content?.trim() || 'Similar cultural vibe and atmosphere.'
      explanationCache.set(cacheKey, explanation)
      return explanation
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
  }

  return 'Similar cultural vibe and atmosphere.'
}

const getGooglePlacePhoto = (photoReference: string): string => {
  return `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoReference}&key=${process.env.GOOGLE_MAPS_API_KEY}`
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
    const { type, place_id, query, city, limit = 10 } = body

    if (!city) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'City is required' })
      }
    }

    // Check if API key is present
    if (!process.env.QLOO_API_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Qloo API key not configured' })
      }
    }

    console.log(`Making Qloo API request: ${type}, query: ${query}, city: ${city}`)
    console.log(`Using API URL: ${QLOO_API_URL}`)
    console.log(`API Key available: ${process.env.QLOO_API_KEY ? 'YES' : 'NO'}`)
    console.log(`API Key prefix: ${process.env.QLOO_API_KEY ? process.env.QLOO_API_KEY.substring(0, 10) + '...' : 'NONE'}`)

    let places: QlooPlace[] = []

    // TEMPORARY MOCK DATA - Replace with real API once auth is fixed
    console.log('Using mock data temporarily...')
    places = [
      {
        id: 'mock-1',
        name: 'Blue Bottle Coffee',
        address: '1-2-3 Shibuya, Tokyo, Japan',
        image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
        rating: 4.5
      },
      {
        id: 'mock-2', 
        name: 'Omotesando Koffee',
        address: '4-5-6 Omotesando, Tokyo, Japan',
        image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800',
        rating: 4.3
      },
      {
        id: 'mock-3',
        name: 'Streamer Coffee Company',
        address: '7-8-9 Harajuku, Tokyo, Japan', 
        image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800',
        rating: 4.7
      }
    ]

    /* REAL API CALLS - COMMENTED OUT UNTIL AUTH IS FIXED
    if (type === 'taste' && query) {
      // Try different authentication methods
      const authMethods = [
        { 'Authorization': `Bearer ${process.env.QLOO_API_KEY}` },
        { 'X-API-Key': process.env.QLOO_API_KEY },
        { 'API-Key': process.env.QLOO_API_KEY },
        { 'Authorization': process.env.QLOO_API_KEY }
      ]
      
      for (const headers of authMethods) {
        try {
          console.log('Trying auth method:', Object.keys(headers)[0])
          const response = await fetch(`${QLOO_API_URL}/v1/taste/extract`, {
            method: 'POST',
            headers: {
              ...headers,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ text: query })
          })
          
          console.log(`Response status: ${response.status}`)
          if (response.ok) {
            const data = await response.json()
            console.log('Success with auth method:', Object.keys(headers)[0])
            // Continue with recommendations...
            break
          } else {
            const errorText = await response.text()
            console.log('Auth method failed:', Object.keys(headers)[0], errorText)
          }
        } catch (error) {
          console.log('Auth method error:', Object.keys(headers)[0], error)
        }
      }
    }
    */

    console.log(`Found ${places.length} places`)

    // Generate explanations and process images for all places
    const processedPlaces = await Promise.all(
      places.map(async (place) => {
        const originalQuery = query || place_id || ''
        const explanation = await generateExplanation(originalQuery, place)
        
        // Handle image - prefer Qloo image, fallback to Google Photos
        let image = place.image
        // Skip Google Photos lookup for now to avoid complications
        
        return {
          id: place.id,
          name: place.name,
          address: place.address,
          image,
          explanation,
          rating: place.rating,
          distance: place.distance
        }
      })
    )

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: JSON.stringify({ places: processedPlaces })
    }

  } catch (error) {
    console.error('Function error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Internal server error' 
      })
    }
  }
} 