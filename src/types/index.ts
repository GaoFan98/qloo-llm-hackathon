export interface Place {
  id: string
  name: string
  address: string
  image?: string
  explanation?: string
  distance?: number
  rating?: number
}

export interface QlooSimilarResponse {
  data: Array<{
    id: string
    name: string
    address: string
    image?: string
    rating?: number
    distance?: number
  }>
}

export interface QlooTasteVector {
  taste_vector: number[]
}

export interface QlooRecommendationsResponse {
  data: Array<{
    id: string
    name: string
    address: string
    image?: string
    rating?: number
    distance?: number
  }>
}

export interface GooglePlacesResult {
  place_id: string
  name: string
  formatted_address: string
  photos?: Array<{
    photo_reference: string
  }>
}

export interface SearchParams {
  query: string
  city: string
  isPlaceId: boolean
} 