import { useEffect, useState } from 'react'

interface ConsoleEntry {
  type: 'error' | 'warn'
  message: string
  timestamp: number
  stack?: string
}

export function DevConsoleMonitor() {
  const [entries, setEntries] = useState<ConsoleEntry[]>([])
  const [isMinimized, setIsMinimized] = useState(true)

  useEffect(() => {
    // Only run in development
    if (process.env.NODE_ENV !== 'development') {
      return
    }

    const originalError = console.error
    const originalWarn = console.warn
    
    // Patterns to ignore
    const ignorePatterns = [
      /Download the React DevTools/,
      /ReactDOM.render is no longer supported/,
      /Consider adding an error boundary/,
    ]
    
    const shouldIgnore = (msg: string) => 
      ignorePatterns.some(pattern => pattern.test(msg))

    // Override console.error
    console.error = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')
      
      if (!shouldIgnore(message)) {
        setEntries(prev => [...prev, {
          type: 'error',
          message,
          timestamp: Date.now(),
          stack: new Error().stack
        }].slice(-10)) // Keep last 10 entries
      }
      
      originalError.apply(console, args)
    }

    // Override console.warn
    console.warn = (...args) => {
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ')
      
      if (!shouldIgnore(message)) {
        setEntries(prev => [...prev, {
          type: 'warn',
          message,
          timestamp: Date.now()
        }].slice(-10))
      }
      
      originalWarn.apply(console, args)
    }

    // Cleanup
    return () => {
      console.error = originalError
      console.warn = originalWarn
    }
  }, [])

  // Don't render in production
  if (process.env.NODE_ENV !== 'development') {
    return null
  }

  const errorCount = entries.filter(e => e.type === 'error').length
  const warnCount = entries.filter(e => e.type === 'warn').length

  return (
    <div style={{
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      backgroundColor: '#1a1a1a',
      color: '#fff',
      borderRadius: '8px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: 9999,
      fontFamily: 'monospace',
      fontSize: '12px',
      maxWidth: '400px',
      maxHeight: isMinimized ? '40px' : '300px',
      overflow: 'hidden',
      transition: 'all 0.3s ease'
    }}>
      <div 
        onClick={() => setIsMinimized(!isMinimized)}
        style={{
          padding: '10px',
          backgroundColor: errorCount > 0 ? '#c41e3a' : warnCount > 0 ? '#ff9800' : '#2196f3',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <span>
          Console Monitor: {errorCount} errors, {warnCount} warnings
        </span>
        <span>{isMinimized ? '▲' : '▼'}</span>
      </div>
      
      {!isMinimized && (
        <div style={{
          padding: '10px',
          maxHeight: '250px',
          overflowY: 'auto'
        }}>
          {entries.length === 0 ? (
            <div style={{ color: '#888' }}>No console errors detected</div>
          ) : (
            entries.map((entry, index) => (
              <div 
                key={index}
                style={{
                  marginBottom: '10px',
                  padding: '8px',
                  backgroundColor: entry.type === 'error' ? 'rgba(196, 30, 58, 0.2)' : 'rgba(255, 152, 0, 0.2)',
                  borderRadius: '4px',
                  borderLeft: `3px solid ${entry.type === 'error' ? '#c41e3a' : '#ff9800'}`
                }}
              >
                <div style={{ 
                  fontWeight: 'bold',
                  marginBottom: '4px',
                  color: entry.type === 'error' ? '#ff6b6b' : '#ffd93d'
                }}>
                  [{entry.type.toUpperCase()}] {new Date(entry.timestamp).toLocaleTimeString()}
                </div>
                <div style={{ 
                  wordBreak: 'break-word',
                  whiteSpace: 'pre-wrap'
                }}>
                  {entry.message}
                </div>
              </div>
            ))
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              setEntries([])
            }}
            style={{
              marginTop: '10px',
              padding: '5px 10px',
              backgroundColor: '#444',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}