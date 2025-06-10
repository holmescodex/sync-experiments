import React from 'react'

interface SimulationControlsProps {
  currentTime: number
  isRunning: boolean
  speedMultiplier: number
  onPause: () => void
  onResume: () => void
  onSetSpeed: (speed: number) => void
  onReset: () => void
}

const SPEED_OPTIONS = [
  { value: 0.5, label: '0.5x' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 5, label: '5x' },
  { value: 10, label: '10x' },
  { value: 50, label: '50x' },
  { value: 100, label: '100x' }
]

export function SimulationControls({
  currentTime,
  isRunning,
  speedMultiplier,
  onPause,
  onResume,
  onSetSpeed,
  onReset
}: SimulationControlsProps) {

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  return (
    <div className="simulation-controls-content">
      <div className="time-display">
        <span className="time-label">Simulation Time:</span>
        <span className="time-value">{formatTime(currentTime)}</span>
      </div>
      
      <div className="control-row">
        <div className="playback-controls">
          {isRunning ? (
            <button 
              onClick={onPause} 
              className="control-btn pause-btn"
              data-testid="play-pause-button"
              title="Pause simulation"
            >
              ⏸ Pause
            </button>
          ) : (
            <button 
              onClick={onResume} 
              className="control-btn play-btn"
              data-testid="play-pause-button"
              title="Resume simulation"
            >
              ▶ Resume
            </button>
          )}
          
          <button 
            onClick={onReset} 
            className="control-btn reset-btn"
            data-testid="reset-button"
            title="Reset simulation to beginning"
          >
            ↻
          </button>
        </div>
        
        <div className="speed-controls">
          <label className="speed-label" title="Adjust simulation playback speed">
            Speed:
          </label>
          <select
            value={speedMultiplier}
            onChange={(e) => onSetSpeed(parseFloat(e.target.value))}
            className="speed-select"
            title={`Current speed: ${speedMultiplier}x`}
          >
            {SPEED_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  )
}