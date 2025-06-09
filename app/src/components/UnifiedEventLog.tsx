import type { SimulationEvent } from '../simulation/engine'

interface UnifiedEventLogProps {
  currentTime: number
  upcomingEvents: SimulationEvent[]
  executedEvents: SimulationEvent[]
}

export function UnifiedEventLog({ currentTime, upcomingEvents, executedEvents }: UnifiedEventLogProps) {
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

  const getTimeFromNow = (eventTime: number) => {
    const diff = eventTime - currentTime
    if (diff <= 0) return 'now'
    return `in ${formatTime(diff)}`
  }

  const getTimeAgo = (eventTime: number) => {
    const diff = currentTime - eventTime
    if (diff <= 0) return 'now'
    return `${formatTime(diff)} ago`
  }

  // Combine and sort all events for unified timeline
  const recentExecuted = executedEvents.slice(-20).reverse() // Last 20 executed events
  const upcomingLimited = upcomingEvents.slice(0, 10) // Next 10 upcoming events

  return (
    <div className="unified-event-log">
      <div className="log-header">
        <h3>Event Timeline</h3>
        <div className="current-time-display">
          Current: {formatTime(currentTime)}
        </div>
      </div>
      
      <div className="event-feed">
        {/* Recent executed events */}
        {recentExecuted.map((event, index) => (
          <div key={`executed-${index}`} className="event-item executed">
            <div className="event-timestamp">
              {formatTime(event.simTime)} ({getTimeAgo(event.simTime)})
            </div>
            <div className="event-device-indicator">
              <span className={`device-badge device-${event.deviceId}`}>
                {event.deviceId}
              </span>
            </div>
            <div className="event-message">
              {event.type === 'message' ? event.data.content : `${event.type} event`}
            </div>
            {event.data.simulation_event_id && (
              <div className="event-id">#{event.data.simulation_event_id}</div>
            )}
          </div>
        ))}
        
        {/* Current time marker */}
        <div className="current-time-marker">
          <div className="time-line">
            <span className="time-indicator">← Current Time: {formatTime(currentTime)} →</span>
          </div>
        </div>
        
        {/* Upcoming events */}
        {upcomingLimited.map((event, index) => (
          <div key={`upcoming-${index}`} className="event-item upcoming">
            <div className="event-timestamp">
              {formatTime(event.simTime)} ({getTimeFromNow(event.simTime)})
            </div>
            <div className="event-device-indicator">
              <span className={`device-badge device-${event.deviceId}`}>
                {event.deviceId}
              </span>
            </div>
            <div className="event-message">
              {event.type === 'message' ? event.data.content : `${event.type} event`}
            </div>
            {event.data.simulation_event_id && (
              <div className="event-id">#{event.data.simulation_event_id}</div>
            )}
          </div>
        ))}
        
        {upcomingLimited.length === 0 && recentExecuted.length === 0 && (
          <div className="no-events">
            <p>No events yet. Simulation will generate events automatically.</p>
          </div>
        )}
      </div>
    </div>
  )
}