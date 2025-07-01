import { useState, useEffect } from 'react'

export function useQueryParam(key: string, defaultValue: string = '') {
  const [value, setValue] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get(key) || defaultValue
  })

  const updateValue = (newValue: string) => {
    setValue(newValue)
    const url = new URL(window.location.href)
    if (newValue) {
      url.searchParams.set(key, newValue)
    } else {
      url.searchParams.delete(key)
    }
    window.history.replaceState({}, '', url.toString())
  }

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search)
      setValue(params.get(key) || defaultValue)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [key, defaultValue])

  return [value, updateValue] as const
} 