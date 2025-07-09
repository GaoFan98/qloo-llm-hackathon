import { Place } from '../types'

interface ResultCardProps {
  place: Place
}

export default function ResultCard({ place }: ResultCardProps) {
  const handleCardClick = () => {
    // Create Google Maps search URL using place name and address
    const searchQuery = `${place.name} ${place.address}`.trim()
    const encodedQuery = encodeURIComponent(searchQuery)
    const googleMapsUrl = `https://www.google.com/maps/search/${encodedQuery}`
    
    // Open Google Maps in a new tab
    window.open(googleMapsUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div 
      className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-all duration-200 cursor-pointer hover:scale-[1.02] active:scale-[0.98] h-[450px] flex flex-col"
      onClick={handleCardClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          handleCardClick()
        }
      }}
      aria-label={`View ${place.name} on Google Maps`}
    >
      {/* Fixed Image Section - 180px height */}
      {place.image && (
        <div className="h-[180px] w-full bg-gray-200 dark:bg-gray-700 flex-shrink-0 overflow-hidden">
          <img
            src={place.image}
            alt={place.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement
              target.style.display = 'none'
            }}
          />
        </div>
      )}
      
      {/* Content Section - Remaining space */}
      <div className="p-4 flex flex-col flex-1 min-h-0">
        {/* Header Section - Fixed height */}
        <div className="flex items-start justify-between mb-3 h-[50px]">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex-1 line-clamp-2 pr-2">
            {place.name}
          </h3>
          <div className="flex-shrink-0 ml-2 mt-1">
            <svg className="w-4 h-4 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </div>
        </div>
        
        {/* Address Section - Fixed height */}
        <div className="mb-3 h-[32px]">
          <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
            {place.address}
          </p>
        </div>
        
        {/* Description Section - Fixed height with scroll on hover */}
        {place.explanation && (
          <div className="flex-1 mb-3 min-h-0">
            <div className="h-full overflow-hidden hover:overflow-y-auto transition-all duration-200 pr-1 hover:pr-0">
              <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                {place.explanation}
              </p>
            </div>
          </div>
        )}
        
        {/* Footer Section - Fixed height */}
        <div className="mt-auto pt-3">
          {/* Rating/Distance Row */}
          <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400 mb-3 h-[16px]">
            {place.rating && place.rating > 0 && (
              <span className="flex items-center">
                <svg className="w-3 h-3 mr-1 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                {place.rating.toFixed(1)}
                {place.reviewCount && place.reviewCount > 0 && (
                  <span className="ml-1">({place.reviewCount.toLocaleString()})</span>
                )}
              </span>
            )}
            
            {place.distance && (
              <span>
                {place.distance < 1000 
                  ? `${Math.round(place.distance)}m away`
                  : `${(place.distance / 1000).toFixed(1)}km away`
                }
              </span>
            )}
          </div>
          
          {/* Click hint - Fixed height */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-700 h-[32px]">
            <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center">
              <svg className="w-3 h-3 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Click to view on Google Maps
            </p>
          </div>
        </div>
      </div>
    </div>
  )
} 