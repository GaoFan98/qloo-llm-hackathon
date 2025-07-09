import { useState, useRef, useEffect, ReactNode } from 'react'

interface ResizablePanelProps {
  leftPanel: ReactNode
  rightPanel: ReactNode
  defaultLeftWidth?: number
  minLeftWidth?: number
  maxLeftWidth?: number
  className?: string
}

const ResizablePanel = ({ 
  leftPanel, 
  rightPanel, 
  defaultLeftWidth = 50, 
  minLeftWidth = 30, 
  maxLeftWidth = 70,
  className = ''
}: ResizablePanelProps) => {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth)
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragStartRef = useRef({ x: 0, startWidth: 0 })

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    setIsDragging(true)
    dragStartRef.current = {
      x: e.clientX,
      startWidth: leftWidth
    }
  }

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging || !containerRef.current) return

      const containerWidth = containerRef.current.offsetWidth
      const deltaX = e.clientX - dragStartRef.current.x
      const deltaPercentage = (deltaX / containerWidth) * 100
      const newLeftWidth = dragStartRef.current.startWidth + deltaPercentage

      // Clamp between min and max values
      const clampedWidth = Math.max(minLeftWidth, Math.min(maxLeftWidth, newLeftWidth))
      setLeftWidth(clampedWidth)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
    }

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [isDragging, minLeftWidth, maxLeftWidth])

  // Prevent text selection during drag
  useEffect(() => {
    if (isDragging) {
      document.body.style.userSelect = 'none'
      document.body.style.cursor = 'col-resize'
    } else {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }

    return () => {
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
    }
  }, [isDragging])

  return (
    <div 
      ref={containerRef}
      className={`flex h-full relative ${className}`}
    >
      {/* Left Panel */}
      <div 
        className="flex-shrink-0 overflow-hidden"
        style={{ width: `${leftWidth}%` }}
      >
        {leftPanel}
      </div>

      {/* Resize Handle */}
      <div
        className={`flex-shrink-0 w-1 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 cursor-col-resize transition-colors relative group ${
          isDragging ? 'bg-blue-500' : ''
        }`}
        onMouseDown={handleMouseDown}
      >
        {/* Visual indicator */}
        <div className="absolute inset-y-0 left-1/2 transform -translate-x-1/2 w-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-full h-full bg-blue-500 rounded-full"></div>
        </div>
        
        {/* Grip dots */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex flex-col space-y-1">
            <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
            <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
          </div>
        </div>
      </div>

      {/* Right Panel */}
      <div 
        className="flex-1 overflow-hidden"
        style={{ width: `${100 - leftWidth}%` }}
      >
        {rightPanel}
      </div>

      {/* Overlay during drag for smooth interaction */}
      {isDragging && (
        <div className="absolute inset-0 z-50 cursor-col-resize" />
      )}
    </div>
  )
}

export default ResizablePanel 