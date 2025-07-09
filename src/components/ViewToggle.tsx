import { useState } from 'react'

export type ViewMode = 'list' | 'map' | 'split'

interface ViewToggleProps {
  currentView: ViewMode
  onViewChange: (view: ViewMode) => void
  className?: string
}

const ViewToggle = ({ currentView, onViewChange, className = '' }: ViewToggleProps) => {
  return (
    <div className={`inline-flex bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-1 ${className}`}>
      {/* List View */}
      <button
        onClick={() => onViewChange('list')}
        className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
          currentView === 'list'
            ? 'bg-gray-900 text-white shadow-sm'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        aria-label="List view"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
        List
      </button>

      {/* Split View */}
      <button
        onClick={() => onViewChange('split')}
        className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
          currentView === 'split'
            ? 'bg-gray-900 text-white shadow-sm'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        aria-label="Split view"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
        Split
      </button>

      {/* Map View */}
      <button
        onClick={() => onViewChange('map')}
        className={`flex items-center px-3 py-2 rounded-md text-sm font-medium transition-all duration-200 ${
          currentView === 'map'
            ? 'bg-gray-900 text-white shadow-sm'
            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
        }`}
        aria-label="Map view"
      >
        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
        </svg>
        Map
      </button>
    </div>
  )
}

export default ViewToggle 