import type { SimulationEvent, DeviceFrequency } from '../simulation/engine'
import { SimulationControls } from './SimulationControls'

interface EventLogWithControlsProps {
  currentTime: number
  upcomingEvents: SimulationEvent[]
  executedEvents: SimulationEvent[]
  frequencies: DeviceFrequency[]
  onUpdateFrequencies: (frequencies: DeviceFrequency[]) => void
  isRunning: boolean
  speedMultiplier: number
  onPause: () => void
  onResume: () => void
  onSetSpeed: (speed: number) => void
  onReset: () => void
}

export function EventLogWithControls({ 
  currentTime, 
  upcomingEvents, 
  executedEvents, 
  frequencies, 
  onUpdateFrequencies,
  isRunning,
  speedMultiplier,
  onPause,
  onResume,
  onSetSpeed,
  onReset
}: EventLogWithControlsProps) {
  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const getTimeFromNow = (eventTime: number) => {
    const diff = eventTime - currentTime
    if (diff <= 0) return 'now'
    return `+${formatTime(diff)}`
  }

  const getTimeAgo = (eventTime: number) => {
    const diff = currentTime - eventTime
    if (diff <= 0) return 'now'
    return `-${formatTime(diff)}`
  }

  const handleFrequencyChange = (deviceId: string, messagesPerHour: number) => {
    const updated = frequencies.map(freq => 
      freq.deviceId === deviceId 
        ? { ...freq, messagesPerHour }
        : freq
    )
    onUpdateFrequencies(updated)
  }

  const handleToggle = (deviceId: string, enabled: boolean) => {
    const updated = frequencies.map(freq => 
      freq.deviceId === deviceId 
        ? { ...freq, enabled }
        : freq
    )
    onUpdateFrequencies(updated)
  }

  // Combine and sort all events for unified timeline
  const recentExecuted = executedEvents.slice(-15).reverse()
  const upcomingLimited = upcomingEvents.slice(0, 8)

  return (
    <div className="event-log-with-controls">
      <div className="section-header">
        <h3>Event Timeline & Generation</h3>
        <p className="section-description">
          Watch automatic message generation in real-time. Adjust frequency or disable generation per device.
        </p>
      </div>
      
      <div className="simulation-controls-section">
        <SimulationControls
          currentTime={currentTime}
          isRunning={isRunning}
          speedMultiplier={speedMultiplier}
          onPause={onPause}
          onResume={onResume}
          onSetSpeed={onSetSpeed}
          onReset={onReset}
        />
      </div>
      
      <div className="generation-controls">
        <div className="control-row">
          {frequencies.map(freq => (
            <div key={freq.deviceId} className="device-control">
              <label className="device-toggle">
                <input
                  type="checkbox"
                  checked={freq.enabled}
                  onChange={(e) => handleToggle(freq.deviceId, e.target.checked)}
                />
                <span className={`device-label device-${freq.deviceId}`}>
                  {freq.deviceId}
                </span>
              </label>
              <div className="frequency-control">
                <input
                  type="number"
                  min="0"
                  max="3600"
                  value={freq.messagesPerHour}
                  onChange={(e) => handleFrequencyChange(freq.deviceId, Number(e.target.value))}
                  disabled={!freq.enabled}
                  className="freq-input"
                />
                <span className="freq-unit">msg/hr</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="timeline-display">
        <div className="timeline-header">
          <span className="current-time-badge">
            Current: {formatTime(currentTime)}
          </span>
        </div>
        
        <div className="event-timeline" data-testid="event-timeline">
          {/* Recent executed events */}
          {recentExecuted.map((event, index) => (
            <div key={`executed-${index}`} className="timeline-event executed" data-testid="executed-event">
              <div className="event-time">{getTimeAgo(event.simTime)}</div>
              <div className="event-content">
                <span className={`device-indicator device-${event.deviceId}`}>
                  {event.deviceId}
                </span>
                <span className="event-message">
                  {event.type === 'message' ? event.data.content : `${event.type} event`}
                </span>
              </div>
            </div>
          ))}
          
          {/* Current time marker */}
          <div className="timeline-marker">
            <div className="marker-line"></div>
            <span className="marker-label">NOW</span>
          </div>
          
          {/* Upcoming events */}
          {upcomingLimited.map((event, index) => (
            <div key={`upcoming-${index}`} className="timeline-event upcoming" data-testid="upcoming-event">
              <div className="event-time">{getTimeFromNow(event.simTime)}</div>
              <div className="event-content">
                <span className={`device-indicator device-${event.deviceId}`}>
                  {event.deviceId}
                </span>
                <span className="event-message">
                  {event.type === 'message' ? event.data.content : `${event.type} event`}
                </span>
              </div>
            </div>
          ))}
          
          {upcomingLimited.length === 0 && recentExecuted.length === 0 && (
            <div className="no-events">
              <p>No events yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}