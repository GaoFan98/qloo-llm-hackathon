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
  explanation?: string
  originalQuery: string
}

interface RequestBody {
  type: 'similar' | 'taste'
  place_id?: string
  query?: string
  city: string
  limit: number
}

// Qloo API configuration
const QLOO_API_URL = process.env.QLOO_API_URL || 'https://hackathon.api.qloo.com'
const QLOO_API_KEY = process.env.QLOO_API_KEY

// Helper function to call Qloo API
async function callQlooAPI(query: string, city: string, type: 'taste' | 'similar' = 'taste') {
  if (!QLOO_API_KEY) {
    throw new Error('Qloo API key not configured')
  }

  console.log('🔄 Trying Qloo API:', type, 'query:', query, 'city:', city)
  console.log('Using API URL:', QLOO_API_URL)

  try {
    // Simplified search strategies that work with Qloo's actual data
    const searchStrategies = [
      // Strategy 1: Simple query with taste preference
      {
        endpoint: `${QLOO_API_URL}/search`,
        params: new URLSearchParams({
          'query': query,
          'limit': '10'
        })
      },
      // Strategy 2: Add city for location context
      {
        endpoint: `${QLOO_API_URL}/search`,
        params: new URLSearchParams({
          'query': `${query} ${city}`,
          'limit': '10'
        })
      },
      // Strategy 3: Try with restaurants keyword
      {
        endpoint: `${QLOO_API_URL}/search`,
        params: new URLSearchParams({
          'query': `${city} restaurants`,
          'limit': '10'
        })
      }
    ]

    for (let i = 0; i < searchStrategies.length; i++) {
      const strategy = searchStrategies[i]
      const url = `${strategy.endpoint}?${strategy.params.toString()}`
      
      console.log(`🌐 Qloo API URL (Strategy ${i + 1}):`, url)

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Api-Key': QLOO_API_KEY,
          'Content-Type': 'application/json'
        }
      })

      console.log(`📡 Qloo API Response status (Strategy ${i + 1}):`, response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.log(`❌ Qloo API Error (Strategy ${i + 1}):`, errorText)
        continue // Try next strategy
      }

      const data = await response.json()
      
      // Qloo API returns {"results": [...]}, not direct array
      const entities = data.results || []
      const resultCount = entities.length
      
      console.log(`📊 Qloo API Strategy ${i + 1} found:`, resultCount, 'results')
      
      if (resultCount > 0) {
        console.log(`✅ Qloo API Success with Strategy ${i + 1}! Found`, resultCount, 'results')
        
        // Filter to relevant entities (places, destinations, localities with addresses)
        const relevantPlaces = entities.filter(entity => {
          const types = entity.types || []
          const hasAddress = entity.properties?.address || entity.disambiguation
          
          return (
            types.includes('urn:entity:place') ||
            types.includes('urn:entity:destination') ||
            types.includes('urn:entity:locality')
          ) && hasAddress
        })
        
        console.log(`🏪 Filtered to ${relevantPlaces.length} relevant places`)
        
        if (relevantPlaces.length > 0) {
          return { results: { entities: relevantPlaces } } // Convert to expected format
        }
      }
    }

    // If all strategies return 0 results
    console.log('⚠️ All Qloo search strategies returned 0 results')
    return { results: { entities: [] } }

  } catch (error) {
    console.error('❌ Qloo API call failed:', error)
    throw error
  }
}

// Convert Qloo API response to our format
function convertQlooResponse(qlooData: any, query: string, city: string) {
  if (!qlooData.results?.entities) {
    return []
  }

  return qlooData.results.entities.map((entity: any, index: number) => ({
    id: entity.entity_id || `qloo-${index}`,
    name: entity.name || 'Unknown Place',
    address: entity.properties?.address || entity.disambiguation || `${city}`,
    rating: entity.properties?.business_rating || 4.5,
    image: entity.properties?.image?.url || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80',
    explanation: entity.properties?.description || 'A culturally similar place with matching vibe and atmosphere.',
    originalQuery: query // Pass the original query for better processing
  }))
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
    return getHardcodedPlaces(city, query)
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
        return getHardcodedPlaces(city, query)
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
          const enrichedPlaces = await enrichPlacesWithGoogleData(places.slice(0, limit), city, limit)
          
          // Add original query to each place
          const placesWithQuery = enrichedPlaces.map(place => ({
            ...place,
            originalQuery: query
          }))
          
          placesCache.set(cacheKey, placesWithQuery)
          console.log(`🎯 Final result: ${placesWithQuery.length} enriched places ready`)
          return placesWithQuery
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
          const enrichedManualPlaces = await enrichPlacesWithGoogleData(manualPlaces, city, limit)
          const manualPlacesWithQuery = enrichedManualPlaces.map(place => ({
            ...place,
            originalQuery: query
          }))
          placesCache.set(cacheKey, manualPlacesWithQuery)
          return manualPlacesWithQuery
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
  return getHardcodedPlaces(city, query)
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
            image: getUnsplashImage(query, i),
            originalQuery: query
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
const getHardcodedPlaces = (city: string, query: string = 'restaurants'): QlooPlace[] => {
  return [
    {
      id: 'fallback-1',
      name: `Blue Bottle Coffee`,
      address: `Central ${city}`,
      image: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800',
      rating: 4.5,
      originalQuery: query
    },
    {
      id: 'fallback-2', 
      name: `Local Artisan Cafe`,
      address: `Downtown ${city}`,
      image: 'https://images.unsplash.com/photo-1554118811-1e0d58224f24?w=800',
      rating: 4.3,
      originalQuery: query
    },
    {
      id: 'fallback-3',
      name: `Specialty Coffee Roasters`,
      address: `Arts District, ${city}`, 
      image: 'https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=800',
      rating: 4.7,
      originalQuery: query
    }
  ]
}

// Enrich places with real Google Places data (photos and addresses)
const enrichPlacesWithGoogleData = async (places: any[], city: string, maxResults: number = 50): Promise<QlooPlace[]> => {
  if (!process.env.GOOGLE_MAPS_API_KEY) {
    console.log('⚠️ Google Maps API key not available, using generated data as-is')
    return places.slice(0, maxResults).map((place, index) => ({
      id: place.id || `openai-${index}`,
      name: place.name,
      address: place.address,
      rating: place.rating || 4.5,
      explanation: place.explanation || 'Great place matching your taste',
      image: getUnsplashImage('restaurant', index),
      originalQuery: place.originalQuery || 'restaurants'
    }))
  }

  console.log(`🌍 Enriching ${places.length} places with Google Places data...`)

  const validatedPlaces: QlooPlace[] = []
  const maxPlacesToCheck = Math.min(places.length, 50) // Check up to 50 places to avoid timeouts
  const targetPlaces = maxResults // Use the requested limit, but don't stop early

  for (let index = 0; index < maxPlacesToCheck; index++) {
    const place = places[index]
    
    try {
      // Step 1: Search for the place using Google Places Text Search
      const searchQuery = `${place.name} ${city}`
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&fields=name,formatted_address,rating,user_ratings_total,photos,geometry&key=${process.env.GOOGLE_MAPS_API_KEY}`
      
      console.log(`🔍 Searching Google Places for: "${searchQuery}"`)
      
      // Add timeout to Google API call
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 5000) // 5 second timeout
      
      const response = await fetch(searchUrl, { 
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      })
      clearTimeout(timeoutId)
      
      if (response.ok) {
        const data = await response.json()
        
        if (data.results && data.results.length > 0) {
          // Step 2: Validate geographic proximity (check only first result for speed)
          const candidate = data.results[0]
          const address = candidate.formatted_address || ''
          const cityLower = city.toLowerCase()
          
          // More flexible city matching
          if (address.toLowerCase().includes(cityLower) || 
              address.toLowerCase().includes(cityLower.replace(' ', '')) ||
              candidate.name.toLowerCase().includes(cityLower)) {
            
            console.log(`✅ Found valid place in ${city}: ${candidate.name}`)
            
            // Step 3: Extract real data
            let realImage = getUnsplashImage(place.name.toLowerCase(), index)
            if (candidate.photos && candidate.photos.length > 0) {
              const photoReference = candidate.photos[0].photo_reference
              realImage = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoReference}&key=${process.env.GOOGLE_MAPS_API_KEY}`
              console.log(`📸 Found real photo for ${candidate.name}`)
            }
            
            const realAddress = candidate.formatted_address
            const googleRating = candidate.rating || place.rating || 4.5
            
            validatedPlaces.push({
              id: place.id || `validated-${index}`,
              name: candidate.name,
              address: realAddress,
              rating: googleRating,
              explanation: place.explanation || 'Great place matching your taste',
              image: realImage,
              originalQuery: place.originalQuery || 'restaurants'
            })
            
            console.log(`✅ Validated and enriched ${candidate.name} in ${city}`)
          } else {
            console.log(`❌ Place ${place.name} not in ${city}, skipping`)
          }
        }
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log(`⏰ Google Places API timeout for ${place.name}`)
      } else {
        console.log(`❌ Error validating ${place.name}:`, error.message)
      }
      continue // Skip this place and try the next one
    }
  }

  // Step 4: If we don't have any validated places, fill with OpenAI-generated places
  if (validatedPlaces.length === 0) {
    console.log(`⚠️ Found 0 validated places in ${city}, generating places with OpenAI`)
    
    try {
      const openaiPlaces = await generatePlacesWithOpenAI(
        places[0]?.originalQuery || 'restaurants', 
        city, 
        Math.min(maxResults, 10) // Keep OpenAI reasonable
      )
      validatedPlaces.push(...openaiPlaces)
    } catch (error) {
      console.log(`❌ OpenAI fallback failed, using hardcoded places`)
      const hardcodedPlaces = getHardcodedPlaces(city, places[0]?.originalQuery || 'restaurants')
      validatedPlaces.push(...hardcodedPlaces.slice(0, 3))
    }
  }

  console.log(`🎯 Returning ${validatedPlaces.length} enriched places (requested: ${maxResults})`)
  return validatedPlaces // Return all validated places, no slicing
}

// Generate better explanations using OpenAI
const generateExplanation = async (originalQuery: string, place: any): Promise<string> => {
  const cacheKey = `${originalQuery}-${place.name}-enhanced`
  
  if (explanationCache.has(cacheKey)) {
    console.log(`📦 Using cached enhanced explanation for ${place.name}`)
    return explanationCache.get(cacheKey)!
  }

  // Skip OpenAI if no API key
  if (!process.env.OPENAI_API_KEY) {
    return place.explanation || `Perfect for someone seeking "${originalQuery}" with its authentic flavors and welcoming atmosphere.`
  }

  console.log(`🤖 Generating enhanced explanation for ${place.name}`)

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
            content: `You are a local food expert. Generate a personalized explanation (1-2 sentences) for why this place matches the user's taste query. Focus on specific aspects like cuisine type, atmosphere, cultural elements, ingredients, cooking style, or dining experience that align with their preferences. Be specific and engaging, avoiding generic phrases.`
          },
          {
            role: 'user',
            content: `The user wants "${originalQuery}" and you're recommending "${place.name}". Explain specifically why this place matches their taste - what makes it perfect for someone with this preference? Focus on taste, atmosphere, style, or cultural similarities.`
          }
        ],
        max_tokens: 80,
        temperature: 0.7
      })
    })

    if (response.ok) {
      const data = await response.json()
      const explanation = data.choices[0]?.message?.content?.trim() || `Perfect for "${originalQuery}" lovers with its authentic style and flavors.`
      
      explanationCache.set(cacheKey, explanation)
      return explanation
    }
  } catch (error) {
    console.error('OpenAI API error:', error)
  }

  return place.explanation || `Perfect for "${originalQuery}" enthusiasts with its authentic approach and vibrant atmosphere.`
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
    const { type, place_id, query, city, limit = 50 } = body // Increase default limit

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
      try {
        console.log('🔄 Attempting Qloo API...')
        const qlooData = await callQlooAPI(searchQuery, city, 'taste')
        const qlooPlaces = convertQlooResponse(qlooData, searchQuery, city)
        
        if (qlooPlaces.length > 0) {
          console.log(`✅ Qloo API Success! Got ${qlooPlaces.length} places`)
          places = await enrichPlacesWithGoogleData(qlooPlaces, city, limit)
        } else {
          console.log('⚠️ Qloo API returned no results, falling back to OpenAI')
        }
      } catch (error) {
        console.log('❌ Qloo API failed, falling back to OpenAI:', error.message)
      }
    }
    
    // Handle similar places (place_id based searches)
    if (type === 'similar' && searchQuery) {
      try {
        console.log('🔄 Attempting Qloo API for similar places...')
        const qlooData = await callQlooAPI(searchQuery, city, 'similar')
        const qlooPlaces = convertQlooResponse(qlooData, searchQuery, city)
        
        if (qlooPlaces.length > 0) {
          console.log(`✅ Qloo API Success! Got ${qlooPlaces.length} similar places`)
          places = await enrichPlacesWithGoogleData(qlooPlaces, city, limit)
        } else {
          console.log('⚠️ Qloo API returned no similar places, falling back to OpenAI')
        }
      } catch (error) {
        console.log('❌ Qloo API failed for similar places, falling back to OpenAI:', error.message)
      }
    }
    
    // Step 2: If Qloo failed or returned no results, use OpenAI fallback
    if (places.length === 0) {
      console.log('🤖 Using OpenAI fallback system')
      places = await generatePlacesWithOpenAI(searchQuery, city, Math.min(limit, 10)) // Keep OpenAI reasonable
    }

    console.log(`🎯 Final result: ${places.length} enriched places ready`)
    console.log(`📍 Found ${places.length} places for "${searchQuery}" in ${city}`)

    // Generate explanations for all places (no limit)
    const processedPlaces = await Promise.all(
      places.map(async (place) => {
        // Always generate personalized explanations with OpenAI instead of using generic fallbacks
        const explanation = await generateExplanation(searchQuery, place)
        
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

    // Detect source based on place characteristics
    const isQlooSource = places.length > 0 && (
      // Check if any place has explanation mentioning Qloo
      places.some(place => place.explanation?.includes("Qloo's Taste AI™")) ||
      // Check if any place ID looks like a UUID (Qloo entity ID format)
      places.some(place => place.id && /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(place.id))
    )

    // Generate overall explanation for the search results
    let overallExplanation = '';
    if (processedPlaces.length > 0) {
      if (isQlooSource) {
        overallExplanation = `Based on your taste for "${searchQuery}", these places in ${city} share similar cultural vibes, atmospheres, and style preferences.`;
      } else {
        overallExplanation = `These ${city} establishments match your preference for "${searchQuery}" with similar ambience, cultural elements, and dining experiences.`;
      }
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
        places: processedPlaces,
        query: searchQuery,
        city,
        source: isQlooSource ? 'qloo' : 'openai-fallback',
        explanation: overallExplanation
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