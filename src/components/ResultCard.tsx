import { Place } from '../types'

interface ResultCardProps {
  place: Place
}

export default function ResultCard({ place }: ResultCardProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow">
      {place.image && (
        <div className="aspect-video w-full bg-gray-200 dark:bg-gray-700">
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
      
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {place.name}
        </h3>
        
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          {place.address}
        </p>
        
        {place.explanation && (
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
            {place.explanation}
          </p>
        )}
        
        <div className="flex items-center mt-3 space-x-4 text-xs text-gray-500 dark:text-gray-400">
          {place.rating && (
            <span className="flex items-center">
              <svg className="w-3 h-3 mr-1 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              {place.rating.toFixed(1)}
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
      </div>
    </div>
  )
} 