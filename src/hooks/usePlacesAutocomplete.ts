import { useState, useCallback } from 'react'

interface PlaceSuggestion {
  place_id: string
  description: string
  structured_formatting?: {
    main_text: string
    secondary_text: string
  }
}

export const usePlacesAutocomplete = () => {
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchSuggestions = useCallback(async (input: string, city?: string) => {
    if (!input.trim()) {
      setSuggestions([])
      return
    }

    setIsLoading(true)
    
    try {
      // Use the parsePlace function to get autocomplete suggestions
      const response = await fetch('http://localhost:8888/.netlify/functions/parsePlace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          type: 'autocomplete',
          input: input.trim(),
          city: city?.trim()
        })
      })

      if (response.ok) {
        const data = await response.json()
        setSuggestions(data.predictions || [])
      } else {
        console.error('Autocomplete API error:', response.status)
        setSuggestions([])
      }
    } catch (error) {
      console.error('Error fetching autocomplete suggestions:', error)
      setSuggestions([])
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearSuggestions = useCallback(() => {
    setSuggestions([])
    setIsLoading(false)
  }, [])

  return {
    suggestions,
    isLoading,
    fetchSuggestions,
    clearSuggestions
  }
} 