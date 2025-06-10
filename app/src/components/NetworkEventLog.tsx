import { useState } from 'react'
import type { NetworkEvent, NetworkConfig } from '../network/simulator'

interface NetworkEventLogProps {
  networkEvents: NetworkEvent[]
  networkConfig: NetworkConfig
  networkStats: {
    total: number
    delivered: number
    dropped: number
    deliveryRate: number
    dropRate: number
  }
  onConfigUpdate: (config: Partial<NetworkConfig>) => void
}

export function NetworkEventLog({ 
  networkEvents, 
  networkConfig, 
  networkStats,
  onConfigUpdate 
}: NetworkEventLogProps) {
  const [showBloomEvents, setShowBloomEvents] = useState(false)
  const [showFileEvents, setShowFileEvents] = useState(true)
  const [showMessageEvents, setShowMessageEvents] = useState(true)

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  const filteredEvents = networkEvents.filter(event => {
    if (event.type === 'message' && !showMessageEvents) return false
    if (event.type === 'bloom_filter' && !showBloomEvents) return false
    if (event.type === 'file_chunk' && !showFileEvents) return false
    return true
  })

  // Calculate filtered stats based on visible event types
  const calculateFilteredStats = () => {
    // Group events by ID to get unique events and their final status
    const eventsByID = new Map<string, NetworkEvent>()
    
    // Take the latest status for each event ID, but only for visible types
    for (const event of filteredEvents) {
      const existingEvent = eventsByID.get(event.id)
      if (!existingEvent || event.timestamp >= existingEvent.timestamp) {
        eventsByID.set(event.id, event)
      }
    }
    
    const uniqueEvents = Array.from(eventsByID.values())
    const total = uniqueEvents.length
    const delivered = uniqueEvents.filter(e => e.status === 'delivered').length
    const dropped = uniqueEvents.filter(e => e.status === 'dropped').length
    
    return {
      total,
      delivered,
      dropped,
      deliveryRate: total > 0 ? delivered / total : 0,
      dropRate: total > 0 ? dropped / total : 0
    }
  }

  const filteredStats = calculateFilteredStats()

  const getEventIcon = (type: NetworkEvent['type']) => {
    switch (type) {
      case 'message': return '💬'
      case 'bloom_filter': return '🔍'
      case 'file_chunk': return '📄'
      default: return '📦'
    }
  }

  const getStatusColor = (status: NetworkEvent['status']) => {
    switch (status) {
      case 'sent': return '#007bff'
      case 'delivered': return '#28a745'
      case 'dropped': return '#dc3545'
      default: return '#6c757d'
    }
  }

  const handleConfigChange = (key: keyof NetworkConfig, value: number) => {
    onConfigUpdate({ [key]: value })
  }

  return (
    <div className="network-event-log">
      <div className="section-header">
        <h3>Network Activity</h3>
        <p className="section-description">
          UDP packet simulation between devices. Configure packet loss and latency to test sync behavior.
        </p>
      </div>

      {/* Network Controls */}
      <div className="network-controls">
        <div className="control-group">
          <label>
            Packet Loss Rate
            <div className="control-input">
              <input
                type="range"
                min="0"
                max="100"
                value={networkConfig.packetLossRate * 100}
                onChange={(e) => handleConfigChange('packetLossRate', Number(e.target.value) / 100)}
                className="range-input"
              />
              <span className="control-value">{Math.round(networkConfig.packetLossRate * 100)}%</span>
            </div>
          </label>
        </div>

        <div className="control-group">
          <label>
            Network Latency
            <div className="control-input">
              <input
                type="range"
                min="0"
                max="500"
                value={networkConfig.minLatency}
                onChange={(e) => handleConfigChange('minLatency', Number(e.target.value))}
                className="range-input"
              />
              <span className="control-value">{networkConfig.minLatency}ms</span>
            </div>
          </label>
        </div>

        <div className="control-group">
          <label>
            Jitter
            <div className="control-input">
              <input
                type="range"
                min="0"
                max="100"
                value={networkConfig.jitter}
                onChange={(e) => handleConfigChange('jitter', Number(e.target.value))}
                className="range-input"
              />
              <span className="control-value">{networkConfig.jitter}ms</span>
            </div>
          </label>
        </div>
      </div>

      {/* Network Stats */}
      <div className="network-stats">
        <div className="stat-item">
          <span className="stat-label">Packets</span>
          <span className="stat-value">{networkStats.total}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Delivered</span>
          <span className="stat-value delivered">{networkStats.delivered}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Dropped</span>
          <span className="stat-value dropped">{networkStats.dropped}</span>
        </div>
        <div className="stat-item">
          <span className="stat-label">Success Rate</span>
          <span className="stat-value">{Math.round(networkStats.deliveryRate * 100)}%</span>
        </div>
      </div>

      {/* Event Filters */}
      <div className="event-filters">
        <h4>Event Filters</h4>
        <div className="filter-checkboxes">
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showMessageEvents}
              onChange={(e) => setShowMessageEvents(e.target.checked)}
            />
            <span className="checkbox-label">💬 Messages</span>
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showBloomEvents}
              onChange={(e) => setShowBloomEvents(e.target.checked)}
            />
            <span className="checkbox-label">🔍 Bloom Filters</span>
          </label>
          <label className="filter-checkbox">
            <input
              type="checkbox"
              checked={showFileEvents}
              onChange={(e) => setShowFileEvents(e.target.checked)}
            />
            <span className="checkbox-label">📄 Files</span>
          </label>
        </div>
      </div>

      {/* Network Events List */}
      <div className="network-events">
        <div className="events-header">
          <span>Network Events ({filteredEvents.length})</span>
        </div>
        <div className="events-list">
          {filteredEvents.length === 0 ? (
            <div className="no-events">
              <p>No network events yet</p>
              <small>Events will appear as devices communicate</small>
            </div>
          ) : (
            filteredEvents.slice(0, 50).map((event) => (
              <div key={event.id} className="network-event">
                <div className="event-header">
                  <span className="event-icon">{getEventIcon(event.type)}</span>
                  <span className="event-time">{formatTime(event.timestamp)}</span>
                  <span 
                    className="event-status"
                    style={{ color: getStatusColor(event.status) }}
                  >
                    {event.status}
                  </span>
                </div>
                <div className="event-details">
                  <div className="event-route">
                    <span className={`device-indicator device-${event.sourceDevice}`}>
                      {event.sourceDevice}
                    </span>
                    <span className="route-arrow">→</span>
                    <span className={`device-indicator device-${event.targetDevice}`}>
                      {event.targetDevice}
                    </span>
                  </div>
                  {event.latency && (
                    <div className="event-latency">
                      {Math.round(event.latency)}ms
                    </div>
                  )}
                </div>
                <div className="event-payload">
                  {event.type === 'message' ? (
                    event.payload.content ? (
                      <span className="message-content">
                        "{event.payload.content}"
                      </span>
                    ) : event.payload.encrypted ? (
                      <span className="sync-message">
                        📦 Encrypted event: {event.payload.eventId || 'unknown'}
                      </span>
                    ) : (
                      <span className="technical-payload">
                        message data
                      </span>
                    )
                  ) : event.type === 'bloom_filter' ? (
                    <span className="bloom-details">
                      🌸 Bloom filter: {event.payload.eventCount || 0} events, 
                      {event.payload.filterSize || 0} bytes
                    </span>
                  ) : (
                    <span className="technical-payload">
                      {event.type} data
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}