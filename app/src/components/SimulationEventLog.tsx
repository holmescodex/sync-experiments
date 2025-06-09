import type { SimulationEvent } from '../simulation/engine'

interface SimulationEventLogProps {
  currentTime: number
  upcomingEvents: SimulationEvent[]
  executedEvents: SimulationEvent[]
}

export function SimulationEventLog({ currentTime, upcomingEvents, executedEvents }: SimulationEventLogProps) {
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

  const recentExecuted = executedEvents
    .slice(-10) // Last 10 executed events
    .reverse() // Most recent first

  return (
    <div className="simulation-event-log">
      <h3>Simulation Event Timeline</h3>
      
      <div className="timeline-sections">
        <div className="executed-events">
          <h4>Recent Events ({recentExecuted.length})</h4>
          <div className="event-list">
            {recentExecuted.length === 0 ? (
              <p className="no-events">No events executed yet</p>
            ) : (
              recentExecuted.map((event, index) => (
                <div key={`executed-${index}`} className="timeline-event executed">
                  <div className="event-time">
                    {formatTime(event.simTime)} ({getTimeAgo(event.simTime)})
                  </div>
                  <div className="event-device">
                    Device {event.deviceId}
                  </div>
                  <div className="event-content">
                    {event.type === 'message' ? event.data.content : `${event.type} event`}
                  </div>
                  {event.data.simulation_event_id && (
                    <div className="event-id">#{event.data.simulation_event_id}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
        
        <div className="current-time">
          <div className="time-marker">
            <strong>Current Time: {formatTime(currentTime)}</strong>
          </div>
        </div>
        
        <div className="upcoming-events">
          <h4>Upcoming Events ({upcomingEvents.length})</h4>
          <div className="event-list">
            {upcomingEvents.length === 0 ? (
              <p className="no-events">No upcoming events scheduled</p>
            ) : (
              upcomingEvents.slice(0, 10).map((event, index) => (
                <div key={`upcoming-${index}`} className="timeline-event upcoming">
                  <div className="event-time">
                    {formatTime(event.simTime)} ({getTimeFromNow(event.simTime)})
                  </div>
                  <div className="event-device">
                    Device {event.deviceId}
                  </div>
                  <div className="event-content">
                    {event.type === 'message' ? event.data.content : `${event.type} event`}
                  </div>
                  {event.data.simulation_event_id && (
                    <div className="event-id">#{event.data.simulation_event_id}</div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  )
}