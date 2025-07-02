import { Handler } from '@netlify/functions'

// Cache for OpenAI responses to avoid duplicate calls
const explanationCache = new Map<string, string>()
const placesCache = new Map<string, any[]>()

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

// Try Qloo API first
const tryQlooAPI = async (type: string, query: string, city: string): Promise<QlooPlace[] | null> => {
  if (!process.env.QLOO_API_KEY) {
    console.log('❌ Qloo API key not configured, skipping to fallback')
    return null
  }

  console.log(`🔄 Trying Qloo API: ${type}, query: ${query}, city: ${city}`)
  console.log(`Using API URL: ${QLOO_API_URL}`)
  
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
        body: JSON.stringify({ text: query, location: city })
      })
      
      console.log(`Response status: ${response.status}`)
      if (response.ok) {
        const data = await response.json()
        console.log('✅ Success with Qloo API!')
        // Convert Qloo response to our format
        return data.recommendations?.map((place: any) => ({
          id: place.id || `qloo-${Math.random()}`,
          name: place.name,
          address: place.address || `${city}`,
          image: place.image,
          rating: place.rating || 4.5
        })) || []
      } else {
        const errorText = await response.text()
        console.log('❌ Qloo auth method failed:', Object.keys(headers)[0], errorText)
      }
    } catch (error) {
      console.log('❌ Qloo API error:', Object.keys(headers)[0], error)
    }
  }
  
  console.log('❌ All Qloo authentication methods failed, falling back to OpenAI')
  return null
}

// OpenAI fallback for place recommendations
const generatePlacesWithOpenAI = async (query: string, city: string, limit: number = 3): Promise<QlooPlace[]> => {
  const cacheKey = `${query}-${city}-${limit}`
  
  if (placesCache.has(cacheKey)) {
    console.log('📦 Using cached OpenAI places')
    return placesCache.get(cacheKey)!
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log('❌ OpenAI API key not configured, using hardcoded fallback')
    return getHardcodedPlaces(city)
  }

  console.log(`🤖 Generating places with OpenAI fallback for: "${query}" in ${city}`)

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
            content: `You are a local expert for ${city}. Generate exactly ${limit} real place recommendations that match the user's taste. Return ONLY a valid JSON array with this exact format (no extra text):
[
  {
    "id": "unique-id-1",
    "name": "Actual Place Name",
    "address": "Real street address in ${city}",
    "rating": 4.5,
    "explanation": "Why this place matches the taste (1-2 sentences)"
  }
]

CRITICAL: Return ONLY the JSON array, no markdown, no extra text, no explanations. Make sure all places are real and currently operating in ${city}.`
          },
          {
            role: 'user',
            content: `Find ${limit} places in ${city} that match this taste: "${query}"`
          }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    })

    if (response.ok) {
      const data = await response.json()
      const content = data.choices[0]?.message?.content?.trim()
      
      console.log(`🔍 OpenAI raw response: ${content?.substring(0, 200)}...`)
      
      if (!content) {
        console.log('❌ OpenAI returned empty content')
        return getHardcodedPlaces(city)
      }

      try {
        // Clean the content - remove any markdown formatting or extra text
        let cleanContent = content
        if (content.includes('```json')) {
          cleanContent = content.split('```json')[1].split('```')[0].trim()
        } else if (content.includes('```')) {
          cleanContent = content.split('```')[1].split('```')[0].trim()
        }
        
        const places = JSON.parse(cleanContent)
        if (Array.isArray(places) && places.length > 0) {
          console.log(`✅ OpenAI generated ${places.length} raw places successfully`)
          
          // Enrich with real Google Places data (photos and addresses)
          const enrichedPlaces = await enrichPlacesWithGoogleData(places.slice(0, limit), city)
          
          placesCache.set(cacheKey, enrichedPlaces)
          console.log(`🎯 Final result: ${enrichedPlaces.length} enriched places ready`)
          return enrichedPlaces
        } else {
          console.log('❌ OpenAI returned invalid array format')
        }
      } catch (parseError) {
        console.log('❌ Failed to parse OpenAI JSON response:', parseError)
        console.log('❌ Raw content:', content)
        
        // Try to extract place data manually if JSON parsing fails
        const manualPlaces = extractPlacesManually(content, query, city, limit)
        if (manualPlaces.length > 0) {
          console.log(`🔧 Manually extracted ${manualPlaces.length} places`)
          // Enrich manual places too
          const enrichedManualPlaces = await enrichPlacesWithGoogleData(manualPlaces, city)
          placesCache.set(cacheKey, enrichedManualPlaces)
          return enrichedManualPlaces
        }
      }
    } else {
      const errorText = await response.text()
      console.log('❌ OpenAI API failed:', response.status, errorText)
    }
  } catch (error) {
    console.error('❌ OpenAI API error:', error)
  }

  console.log('⚠️ OpenAI fallback failed, using hardcoded places')
  return getHardcodedPlaces(city)
}

// Manual extraction fallback when JSON parsing fails
const extractPlacesManually = (content: string, query: string, city: string, limit: number): QlooPlace[] => {
  const places: QlooPlace[] = []
  
  try {
    // Look for name patterns in the content
    const nameMatches = content.match(/"name":\s*"([^"]+)"/g)
    const addressMatches = content.match(/"address":\s*"([^"]+)"/g)
    const ratingMatches = content.match(/"rating":\s*([0-9.]+)/g)
    const explanationMatches = content.match(/"explanation":\s*"([^"]+)"/g)
    
    if (nameMatches && addressMatches) {
      for (let i = 0; i < Math.min(nameMatches.length, limit); i++) {
        const name = nameMatches[i]?.match(/"name":\s*"([^"]+)"/)?.[1]
        const address = addressMatches[i]?.match(/"address":\s*"([^"]+)"/)?.[1]
        const rating = ratingMatches?.[i]?.match(/([0-9.]+)/)?.[1]
        const explanation = explanationMatches?.[i]?.match(/"explanation":\s*"([^"]+)"/)?.[1]
        
        if (name && address) {
          places.push({
            id: `manual-${i}`,
            name,
            address,
            rating: rating ? parseFloat(rating) : 4.5,
            explanation,
            image: getUnsplashImage(query, i)
          })
        }
      }
    }
  } catch (error) {
    console.log('❌ Manual extraction failed:', error)
  }
  
  return places
}

// Get appropriate Unsplash image based on query
const getUnsplashImage = (query: string, index: number): string => {
  const baseImages = [
    'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800', // coffee shop
    'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800', // cafe interior
    'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800', // restaurant
    'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800', // restaurant interior
    'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800'  // food/dining
  ]
  
  // Match query to appropriate image themes
  if (query.toLowerCase().includes('coffee') || query.toLowerCase().includes('cafe')) {
    return [
      'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
      'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800',
      'https://images.unsplash.com/photo-1506619216599-9d16d0903dfd?w=800'
    ][index % 3]
  }
  
  if (query.toLowerCase().includes('book') || query.toLowerCase().includes('vintage')) {
    return [
      'https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800', // bookstore
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800', // library
      'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=800'  // vintage interior
    ][index % 3]
  }
  
  return baseImages[index % baseImages.length]
}

// Hardcoded fallback when everything else fails
const getHardcodedPlaces = (city: string): QlooPlace[] => {
  return [
    {
      id: 'fallback-1',
      name: `Blue Bottle Coffee`,
      address: `Central ${city}`,
      image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
      rating: 4.5
    },
    {
      id: 'fallback-2', 
      name: `Local Artisan Cafe`,
      address: `Downtown ${city}`,
      image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800',
      rating: 4.3
    },
    {
      id: 'fallback-3',
      name: `Specialty Coffee Roasters`,
      address: `Arts District, ${city}`, 
      image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800',
      rating: 4.7
    }
  ]
}

const generateExplanation = async (originalQuery: string, place: any): Promise<string> => {
  // If explanation already exists (from OpenAI-generated places), use it
  if (place.explanation && typeof place.explanation === 'string' && place.explanation.trim().length > 0) {
    console.log(`📝 Using existing explanation for ${place.name}`)
    return place.explanation
  }

  const cacheKey = `${originalQuery}-${place.name}`
  
  if (explanationCache.has(cacheKey)) {
    console.log(`📦 Using cached explanation for ${place.name}`)
    return explanationCache.get(cacheKey)!
  }

  // Skip OpenAI if no API key
  if (!process.env.OPENAI_API_KEY) {
    return 'Culturally similar place with matching vibe and atmosphere.'
  }

  console.log(`🤖 Generating explanation for ${place.name}`)

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

// Enrich places with real Google Places data (photos and addresses)
const enrichPlacesWithGoogleData = async (places: any[], city: string): Promise<QlooPlace[]> => {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.log('⚠️ Google Maps API key not available, using generated data as-is')
    return places.map((place, index) => ({
      id: place.id || `openai-${index}`,
      name: place.name,
      address: place.address,
      rating: place.rating || 4.5,
      explanation: place.explanation || 'Great place matching your taste',
      image: getUnsplashImage('restaurant', index)
    }))
  }

  console.log(`🌍 Enriching ${places.length} places with Google Places data...`)

  const enrichedPlaces = await Promise.all(
    places.map(async (place, index) => {
      try {
        // Search for the place using Google Places Text Search
        const searchQuery = `${place.name} ${city}`
        const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${process.env.GOOGLE_MAPS_API_KEY}`
        
        console.log(`🔍 Searching Google Places for: "${searchQuery}"`)
        
        const response = await fetch(searchUrl)
        if (response.ok) {
          const data = await response.json()
          
          if (data.results && data.results.length > 0) {
            const googlePlace = data.results[0] // Take the first (most relevant) result
            
            // Get real photo if available
            let realImage = getUnsplashImage(place.name.toLowerCase(), index) // fallback
            if (googlePlace.photos && googlePlace.photos.length > 0) {
              const photoReference = googlePlace.photos[0].photo_reference
              realImage = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoReference}&key=${process.env.GOOGLE_MAPS_API_KEY}`
              console.log(`📸 Found real photo for ${place.name}`)
            }
            
            // Get real address
            const realAddress = googlePlace.formatted_address || place.address
            const realRating = googlePlace.rating || place.rating || 4.5
            
            console.log(`✅ Enriched ${place.name} with Google data`)
            
            return {
              id: place.id || `enriched-${index}`,
              name: place.name,
              address: realAddress,
              rating: realRating,
              explanation: place.explanation || 'Great place matching your taste',
              image: realImage
            }
          } else {
            console.log(`❌ No Google Places results for ${place.name}`)
          }
        } else {
          console.log(`❌ Google Places API error for ${place.name}:`, response.status)
        }
      } catch (error) {
        console.log(`❌ Error enriching ${place.name}:`, error)
      }
      
      // Fallback to original data if Google enrichment fails
      return {
        id: place.id || `openai-${index}`,
        name: place.name,
        address: place.address,
        rating: place.rating || 4.5,
        explanation: place.explanation || 'Great place matching your taste',
        image: getUnsplashImage(place.name.toLowerCase(), index)
      }
    })
  )

  return enrichedPlaces
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
    const { type, place_id, query, city, limit = 3 } = body

    if (!city) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'City is required' })
      }
    }

    let places: QlooPlace[] = []
    const searchQuery = query || place_id || ''

    // 🚀 SMART FALLBACK SYSTEM
    console.log('🎯 Starting smart recommendation system...')
    
    // Step 1: Try Qloo API first
    if (type === 'taste' && searchQuery) {
      places = await tryQlooAPI(type, searchQuery, city) || []
    }
    
    // Step 2: If Qloo failed, use OpenAI fallback
    if (places.length === 0) {
      console.log('🤖 Using OpenAI fallback system')
      places = await generatePlacesWithOpenAI(searchQuery, city, limit)
    } else {
      console.log('✅ Using Qloo API results')
      // Enrich Qloo results with Google Places data too
      places = await enrichPlacesWithGoogleData(places, city)
    }

    console.log(`📍 Found ${places.length} places for "${searchQuery}" in ${city}`)

    // Generate explanations only for places that don't have them
    const processedPlaces = await Promise.all(
      places.slice(0, limit).map(async (place) => {
        // Preserve existing explanations from OpenAI or generate new ones
        const explanation = place.explanation && place.explanation.trim().length > 0 
          ? place.explanation 
          : await generateExplanation(searchQuery, place)
        
        return {
          id: place.id,
          name: place.name,
          address: place.address,
          image: place.image,
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
      body: JSON.stringify({
        places: processedPlaces,
        query: searchQuery,
        city,
        source: places.length > 0 && places[0].id.startsWith('qloo-') ? 'qloo' : 'openai-fallback'
      })
    }

  } catch (error) {
    console.error('Handler error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      })
    }
  }
} 