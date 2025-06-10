import { useState, useEffect } from 'react'
import type { DeviceDB } from '../storage/device-db'
import type { SyncManager } from '../sync/SyncManager'

interface DevicePanelProps {
  deviceId: string
  database?: DeviceDB
  syncManager?: SyncManager
}

export function DevicePanel({ deviceId, database, syncManager }: DevicePanelProps) {
  const [eventCount, setEventCount] = useState(0)
  const [recentEvents, setRecentEvents] = useState<any[]>([])
  const [syncStatus, setSyncStatus] = useState<any>(null)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    const updateStats = async () => {
      if (!database) {
        console.log(`[DevicePanel] No database for ${deviceId}`)
        return
      }

      try {
        // Get all events to count them
        const allEvents = await database.getAllEvents()
        setEventCount(allEvents.length)
        
        if (allEvents.length > 0) {
          console.log(`[DevicePanel] ${deviceId} has ${allEvents.length} events`)
        }

        // Get last 5 events
        const recent = allEvents.slice(-5).reverse()
        
        // Try to decrypt event content for display
        const eventsWithContent = recent.map(event => {
          try {
            const decrypted = new TextDecoder().decode(event.encrypted)
            const payload = JSON.parse(decrypted)
            return {
              ...event,
              content: payload.content || payload.type || 'unknown',
              author: payload.author || event.device_id
            }
          } catch {
            return {
              ...event,
              content: 'encrypted',
              author: event.device_id
            }
          }
        })
        
        setRecentEvents(eventsWithContent)
      } catch (error) {
        console.warn(`Failed to get stats for ${deviceId}:`, error)
      }

      if (syncManager) {
        setSyncStatus(syncManager.getSyncStatus())
      }
    }

    // Update immediately
    updateStats()

    // Then update every second
    const interval = setInterval(updateStats, 1000)
    return () => clearInterval(interval)
  }, [deviceId, database, syncManager])

  const formatTime = (ms: number) => {
    const date = new Date(ms)
    return date.toLocaleTimeString('en-US', { 
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  }

  const exportDatabase = async () => {
    if (!database) return
    
    try {
      const allEvents = await database.getAllEvents()
      const data = {
        deviceId,
        eventCount: allEvents.length,
        events: allEvents.map(e => ({
          event_id: e.event_id,
          device_id: e.device_id,
          created_at: e.created_at,
          received_at: e.received_at,
          encrypted_size: e.encrypted.length
        }))
      }
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${deviceId}-events-${Date.now()}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export database:', error)
    }
  }

  return (
    <div className={`device-panel ${expanded ? 'expanded' : ''}`}>
      <div className="device-header" onClick={() => setExpanded(!expanded)}>
        <h4>{deviceId.charAt(0).toUpperCase() + deviceId.slice(1)}'s Device</h4>
        <div className="device-stats">
          <span className="event-count">{eventCount} events</span>
          {syncStatus && (
            <span className={`sync-indicator ${syncStatus.isSynced ? 'synced' : 'syncing'}`}>
              {syncStatus.syncPercentage.toFixed(0)}% synced
            </span>
          )}
          <button className="expand-btn">{expanded ? '▼' : '▶'}</button>
        </div>
      </div>
      
      {expanded && (
        <div className="device-details">
          <div className="sync-info">
            <h5>Sync Status</h5>
            {syncStatus ? (
              <div className="sync-details">
                <p>Strategy: {syncStatus.strategy || 'bloom-filter'}</p>
                <p>Known Events: {syncStatus.knownEvents}</p>
                <p>Total Events: {syncStatus.totalEvents}</p>
                <p>Sync %: {syncStatus.syncPercentage.toFixed(1)}%</p>
              </div>
            ) : (
              <p>No sync manager</p>
            )}
          </div>

          <div className="recent-events">
            <h5>Recent Events in Database</h5>
            {recentEvents.length === 0 ? (
              <p className="no-events">No events yet</p>
            ) : (
              <ul className="event-list">
                {recentEvents.map((event) => (
                  <li key={event.event_id} className="event-item">
                    <span className="event-id">{event.event_id.substring(0, 8)}...</span>
                    <span className="event-author">{event.author}:</span>
                    <span className="event-content">"{event.content}"</span>
                    <span className="event-time">{formatTime(event.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="device-actions">
            <button onClick={exportDatabase} className="export-btn">
              📥 Export Database
            </button>
          </div>
        </div>
      )}
    </div>
  )
}