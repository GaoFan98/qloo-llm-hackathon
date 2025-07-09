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
    // Improved search strategies with better context and precision
    const searchStrategies = [
      // Strategy 1: Query with business context for better precision
      {
        endpoint: `${QLOO_API_URL}/search`,
        params: new URLSearchParams({
          'query': `${query} restaurants cafes venues ${city}`,
          'limit': '10'
        })
      },
      // Strategy 2: Themed dining/entertainment focus
      {
        endpoint: `${QLOO_API_URL}/search`,
        params: new URLSearchParams({
          'query': `${query} themed restaurant cafe bar ${city}`,
          'limit': '10'
        })
      },
      // Strategy 3: Location-specific dining
      {
        endpoint: `${QLOO_API_URL}/search`,
        params: new URLSearchParams({
          'query': `${city} ${query} dining entertainment`,
          'limit': '10'
        })
      },
      // Strategy 4: Fallback to general restaurants if specific search fails
      {
        endpoint: `${QLOO_API_URL}/search`,
        params: new URLSearchParams({
          'query': `${city} restaurants cafes`,
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
            content: `You are a local dining and entertainment expert for ${city}. Generate exactly ${limit} REAL places that currently exist and operate in ${city}.

CRITICAL REQUIREMENTS:
- ONLY restaurants, cafes, bars, themed dining, entertainment venues, or food-related businesses
- NO fictional places, exhibitions, or temporary events
- NO schools, hospitals, churches, government buildings
- All places must be actual operating businesses you can verify exist
- Focus on places that match the user's taste preference for dining/entertainment

Return ONLY a valid JSON array with this exact format (no extra text):
[
  {
    "id": "unique-id-1",
    "name": "Real Restaurant/Cafe Name",
    "address": "Real street address in ${city}",
    "rating": 4.5,
    "explanation": "Why this dining venue matches the taste (1-2 sentences about food/atmosphere)"
  }
]

NO markdown, NO explanations outside JSON. Real businesses only.`
          },
          {
            role: 'user',
            content: `Find ${limit} REAL restaurants, cafes, bars, or food venues in ${city} that match this taste preference: "${query}". Focus on dining and entertainment only.`
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

// Enhanced relevance checking with positive indicators
const checkBusinessRelevance = (originalPlaceName: string, businessName: string, businessTypes: string[], originalQuery: string): boolean => {
  // Convert to lowercase for comparison - add null checks
  const originalLower = (originalPlaceName || '').toLowerCase()
  const businessLower = (businessName || '').toLowerCase()
  const queryLower = (originalQuery || '').toLowerCase()
  const safeBusinessTypes = businessTypes || []
  
  // CRITICAL: Smart semantic validation to prevent hallucinations (replaces hardcoded approach)
  const relevanceCheck = validateSemanticRelevance(businessName, businessTypes, originalQuery)
  if (!relevanceCheck.isRelevant) {
    console.log(`🚫 Semantic mismatch: ${businessName} doesn't match "${originalQuery}" (${relevanceCheck.reason})`)
    return false
  }
  
  // Positive indicators - prefer appropriate business types
  const businessKeywords = ['restaurant', 'cafe', 'bar', 'bistro', 'eatery', 'diner', 'grill', 'kitchen', 'tavern', 'pub', 'lounge', 'izakaya', 'ramen', 'sushi', 'pizza', 'burger', 'food', 'dining', 'bakery', 'brewery', 'hotel', 'hostel', 'museum', 'gallery', 'theater', 'cinema', 'gym', 'spa', 'shop', 'store', 'market', 'university', 'school', 'library', 'park', 'center', 'studio', 'club', 'venue']
  const entertainmentKeywords = ['theater', 'cinema', 'arcade', 'club', 'karaoke', 'gaming', 'entertainment', 'theme', 'experience', 'gallery', 'museum']
  
  // Check for business indicators
  const hasBusinessIndicators = businessKeywords.some(keyword => businessLower.includes(keyword)) ||
                                safeBusinessTypes.length > 0 // Any Google Places type is a good sign
  
  const hasEntertainmentIndicators = entertainmentKeywords.some(keyword => businessLower.includes(keyword))
  
  // If it has indicators, it's likely legitimate
  if (hasBusinessIndicators || hasEntertainmentIndicators) {
    console.log(`✅ Found relevant venue: ${businessName} (business/entertainment indicators)`)
    return true
  }
  
  // Skip obviously wrong categories only
  const obviouslyWrongKeywords = ['hospital', 'clinic', 'medical', 'doctor', 'dental', 'pharmacy', 'church', 'temple', 'mosque', 'synagogue', 'government', 'city hall', 'embassy', 'school', 'university', 'college']
  
  // Only filter out if query is clearly different category AND business is clearly wrong category
  const queryIsNotMedical = !queryLower.includes('medical') && !queryLower.includes('hospital') && !queryLower.includes('doctor')
  const businessIsMedical = obviouslyWrongKeywords.slice(0, 6).some(keyword => businessLower.includes(keyword))
  
  if (queryIsNotMedical && businessIsMedical) {
    console.log(`🚫 Filtering out medical venue: ${businessName} for non-medical query`)
    return false
  }
  
  // Allow everything else - let semantic validation handle the details
  return true
}

// NEW: General semantic validation (replaces hardcoded cuisine matching)
const validateSemanticRelevance = (businessName: string, businessTypes: string[], originalQuery: string): { isRelevant: boolean, reason?: string } => {
  const businessLower = (businessName || '').toLowerCase()
  const queryLower = (originalQuery || '').toLowerCase()
  const safeBusinessTypes = businessTypes || []
  
  // Extract key concepts from the query
  const queryTokens = queryLower.split(' ').filter(token => token.length > 2)
  const businessTokens = businessLower.split(' ').filter(token => token.length > 2)
  
  // Google Places types mapping to common concepts
  const typeCategories = {
    'food': ['restaurant', 'cafe', 'bar', 'food', 'meal_takeaway', 'bakery', 'meal_delivery'],
    'accommodation': ['lodging', 'hotel', 'hostel', 'guest_house'],
    'education': ['school', 'university', 'library', 'educational_institution'],
    'entertainment': ['amusement_park', 'movie_theater', 'night_club', 'casino', 'bowling_alley'],
    'shopping': ['shopping_mall', 'store', 'clothing_store', 'book_store', 'electronics_store'],
    'health': ['hospital', 'doctor', 'dentist', 'pharmacy', 'health', 'gym'],
    'culture': ['museum', 'art_gallery', 'library', 'cultural_center'],
    'worship': ['church', 'place_of_worship', 'temple', 'mosque', 'synagogue'],
    'transport': ['airport', 'bus_station', 'subway_station', 'train_station'],
    'finance': ['bank', 'atm', 'insurance_agency', 'accounting'],
    'government': ['city_hall', 'local_government_office', 'embassy', 'courthouse']
  }
  
  // Find what category the query is asking for
  let queryCategory = 'general'
  for (const [category, types] of Object.entries(typeCategories)) {
    if (queryTokens.some(token => types.some(type => type.includes(token) || token.includes(type)))) {
      queryCategory = category
      break
    }
  }
  
  // Check if business types match the query category
  if (queryCategory !== 'general') {
    const expectedTypes = typeCategories[queryCategory]
    const businessMatchesCategory = safeBusinessTypes.some(type => expectedTypes.includes(type))
    
    if (!businessMatchesCategory) {
      // Check if business name contains category-relevant keywords
      const nameMatchesCategory = expectedTypes.some(keyword => businessLower.includes(keyword))
      
      if (!nameMatchesCategory) {
        return { 
          isRelevant: false, 
          reason: `business type mismatch - expected ${queryCategory}, got ${safeBusinessTypes.join(', ')}` 
        }
      }
    }
  }
  
  // Check for basic keyword overlap (semantic similarity proxy)
  const commonTokens = queryTokens.filter(qToken => 
    businessTokens.some(bToken => 
      qToken.includes(bToken) || 
      bToken.includes(qToken) ||
      levenshteinDistance(qToken, bToken) <= 2 // Allow for small spelling differences
    )
  )
  
  // If there's some semantic overlap or it's a general query, allow it
  if (commonTokens.length > 0 || queryCategory === 'general') {
    return { isRelevant: true }
  }
  
  // If no obvious connection, be cautious but don't block everything
  return { isRelevant: true } // Default to allowing rather than blocking
}

// Simple Levenshtein distance for fuzzy matching
const levenshteinDistance = (str1: string, str2: string): number => {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
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
  const seenPlaces = new Set<string>() // Track duplicates by name + address
  const maxPlacesToCheck = Math.min(places.length, 15) // Reduce from 50 to 15 to prevent timeouts
  const targetPlaces = Math.min(maxResults, 15) // Cap to 15 max results

  for (let index = 0; index < maxPlacesToCheck && validatedPlaces.length < targetPlaces; index++) {
    const place = places[index]
    
    try {
      // Step 1: Search for the place using Google Places Text Search - make it semantic and dynamic
      const queryTokens = (place.originalQuery || '').toLowerCase().split(' ').filter(token => token.length > 2)
      const contextKeywords = queryTokens.slice(0, 2).join(' ') || 'restaurant' // Use first 2 meaningful words from query
      const searchQuery = `${place.name} ${contextKeywords} ${city}`
      const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&fields=name,formatted_address,rating,user_ratings_total,photos,geometry&key=${process.env.GOOGLE_MAPS_API_KEY}`
      
      console.log(`🔍 Searching Google Places for: "${searchQuery}"`)
      
      // Add timeout to Google API calls
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000) // 3 second timeout
      
      const response = await fetch(searchUrl, { 
        signal: controller.signal,
        headers: {
          'User-Agent': 'QlooTasteDiscovery/1.0'
        }
      })
      clearTimeout(timeoutId)
      
      if (!response.ok) {
        console.log(`❌ Google Places API error for ${place.name}: ${response.status}`)
        continue
      }

      const data = await response.json()

      if (data.results && data.results.length > 0) {
        // Step 2: Find the most relevant result (check only top 2 instead of 3)
        let candidate = null
        
        for (const result of data.results.slice(0, 2)) { // Reduce from 3 to 2
          const address = result.formatted_address || ''
          const cityLower = city.toLowerCase()
          const types = result.types || []
          const businessName = result.name || ''
          const originalPlaceName = place.name || ''
          
          // Step 2a: Geographic validation
          const isInCity = address.toLowerCase().includes(cityLower) || 
                          address.toLowerCase().includes(cityLower.replace(' ', ''))
          
          if (!isInCity) {
            console.log(`📍 Place "${businessName}" not in ${city}, checking next result...`)
            continue
          }
          
          // Step 2b: Relevance validation
          const isRelevant = checkBusinessRelevance(originalPlaceName, businessName, types, place.originalQuery || searchQuery)
          
          if (!isRelevant) {
            continue
          }
          
          // Step 2c: Check for duplicates
          const placeKey = `${businessName}|${address}`
          if (seenPlaces.has(placeKey)) {
            console.log(`🔄 Duplicate detected: ${businessName}, skipping`)
            continue
          }
          
          candidate = result
          seenPlaces.add(placeKey)
          break // Found a good match, stop searching
        }

        if (candidate) {
          // Step 3: Get place photo (with fallback)
          let imageUrl = getUnsplashImage('restaurant', index) // Default fallback
          
          if (candidate.photos && candidate.photos.length > 0) {
            const photoReference = candidate.photos[0].photo_reference
            imageUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photoreference=${photoReference}&key=${process.env.GOOGLE_MAPS_API_KEY}`
          }

          // Step 4: Create enriched place object
          const enrichedPlace: QlooPlace = {
            id: place.id || `google-${candidate.place_id}`,
            name: candidate.name,
            address: candidate.formatted_address,
            rating: candidate.rating || 4.0,
            explanation: place.explanation || 'Great place matching your taste',
            image: imageUrl,
            originalQuery: place.originalQuery || 'restaurants'
          }

          validatedPlaces.push(enrichedPlace)
          console.log(`✅ Validated: ${candidate.name} in ${city}`)
        } else {
          console.log(`❌ Place ${place.name} not in ${city}, skipping`)
        }
      } else {
        console.log(`❌ No Google Places results for: ${place.name}`)
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log(`⏱️ Timeout validating ${place.name}, skipping`)
      } else {
        console.log(`❌ Error validating ${place.name}: ${error.message}`)
      }
      continue // Continue to next place on error
    }
    
    // Add small delay to avoid rate limiting, but only if we're not at the limit
    if (index < maxPlacesToCheck - 1 && validatedPlaces.length < targetPlaces) {
      await new Promise(resolve => setTimeout(resolve, 100)) // Reduce from 200ms to 100ms
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
            content: `You are a local expert. Generate a personalized explanation (1-2 sentences) for why this place matches the user's query.

CRITICAL ANTI-HALLUCINATION RULES:
1. NEVER claim a business offers services/products that aren't clearly indicated in its name
2. NEVER invent specialties, cuisine types, or amenities not obviously present
3. If the business name doesn't clearly indicate it matches the query, focus on:
   - General atmosphere and ambiance
   - Location and accessibility 
   - Likely experience style (casual, upscale, cozy, etc.)
   - Cultural area or neighborhood vibe

EXAMPLES OF WHAT TO AVOID:
- Don't claim "Owl Cafe" serves Vietnamese food
- Don't claim "Shisha Bar" has Vietnamese cuisine
- Don't claim a generic cafe specializes in something specific
- Don't invent amenities, services, or specialties

BE HONEST about uncertainty. If unclear, focus on atmosphere and general appeal.`
          },
          {
            role: 'user',
            content: `The user wants "${originalQuery}" and you're recommending "${place.name}". Explain why this place might appeal to someone with this preference, being EXTREMELY careful not to invent connections that aren't clearly supported by the business name. Focus on atmosphere, location, or general dining experience.`
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