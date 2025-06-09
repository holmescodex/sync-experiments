import { useState } from 'react'

interface SimulationControlsProps {
  currentTime: number
  isRunning: boolean
  speedMultiplier: number
  onPause: () => void
  onResume: () => void
  onSetSpeed: (speed: number) => void
  onReset: () => void
}

export function SimulationControls({
  currentTime,
  isRunning,
  speedMultiplier,
  onPause,
  onResume,
  onSetSpeed,
  onReset
}: SimulationControlsProps) {
  const [speedInput, setSpeedInput] = useState(speedMultiplier.toString())

  const handleSpeedChange = () => {
    const newSpeed = parseFloat(speedInput)
    if (!isNaN(newSpeed) && newSpeed > 0) {
      onSetSpeed(newSpeed)
    }
  }

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
    <div className="simulation-controls">
      <h2>Simulation Controls</h2>
      
      <div className="time-display">
        <h3>Simulation Time: {formatTime(currentTime)}</h3>
        <p>Raw: {currentTime}ms</p>
      </div>
      
      <div className="playback-controls">
        {isRunning ? (
          <button onClick={onPause} className="pause-btn">
            ⏸️ Pause
          </button>
        ) : (
          <button onClick={onResume} className="play-btn">
            ▶️ Play
          </button>
        )}
        
        <button onClick={onReset} className="reset-btn">
          🔄 Reset
        </button>
      </div>
      
      <div className="speed-controls">
        <label>
          Speed Multiplier:
          <input
            type="number"
            min="0.1"
            max="1000"
            step="0.1"
            value={speedInput}
            onChange={(e) => setSpeedInput(e.target.value)}
            onBlur={handleSpeedChange}
            onKeyPress={(e) => e.key === 'Enter' && handleSpeedChange()}
          />
        </label>
        <span>Current: {speedMultiplier}x</span>
      </div>
      
      <div className="presets">
        <button onClick={() => onSetSpeed(1)}>1x</button>
        <button onClick={() => onSetSpeed(10)}>10x</button>
        <button onClick={() => onSetSpeed(100)}>100x</button>
        <button onClick={() => onSetSpeed(1000)}>1000x</button>
      </div>
      
      <div className="status">
        <p>Status: {isRunning ? '🟢 Running' : '🔴 Paused'}</p>
      </div>
    </div>
  )
}