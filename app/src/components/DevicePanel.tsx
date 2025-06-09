import { useState, useEffect, useImperativeHandle, forwardRef } from 'react'
import { DeviceDB, type Event } from '../storage/device-db'
import { MessageGenerator } from '../simulation/message-generator'

interface DevicePanelProps {
  deviceId: string
  currentSimTime: number
  onManualMessage?: (deviceId: string, content: string) => void
}

export interface DevicePanelRef {
  handleSimulationMessage: (content: string) => Promise<void>
}

export const DevicePanel = forwardRef<DevicePanelRef, DevicePanelProps>(
  ({ deviceId, currentSimTime, onManualMessage }, ref) => {
  const [db, setDb] = useState<DeviceDB | null>(null)
  const [generator, setGenerator] = useState<MessageGenerator | null>(null)
  const [events, setEvents] = useState<Event[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    const initializeDevice = async () => {
      const deviceDB = new DeviceDB(deviceId)
      const messageGen = new MessageGenerator(deviceId)
      
      await deviceDB.initialize()
      setDb(deviceDB)
      setGenerator(messageGen)
      setIsInitialized(true)
      
      // Load existing events
      const existingEvents = await deviceDB.getAllEvents()
      setEvents(existingEvents)
    }
    
    initializeDevice()
  }, [deviceId])

  const handleSendMessage = async () => {
    if (!messageInput.trim()) return
    
    // Add to simulation timeline first (this will eventually trigger device storage)
    if (onManualMessage) {
      onManualMessage(deviceId, messageInput)
    }
    
    setMessageInput('')
  }

  // Method to handle messages from simulation events
  const handleSimulationMessage = async (content: string) => {
    if (!db || !generator) return
    
    // Create encrypted message event
    const event = generator.createMessage(content, currentSimTime)
    
    // Store in device database
    await db.insertEvent(event)
    
    // Update UI
    const updatedEvents = await db.getAllEvents()
    setEvents(updatedEvents)
  }

  // Expose method for parent to call when simulation events occur
  useImperativeHandle(ref, () => ({
    handleSimulationMessage
  }), [handleSimulationMessage])

  const decryptAndDisplayMessage = (event: Event) => {
    if (!generator) return 'Decrypting...'
    
    try {
      const decrypted = generator.decryptMessage(event)
      return `${decrypted.content} (at ${decrypted.timestamp})`
    } catch (error) {
      return 'Failed to decrypt'
    }
  }

  if (!isInitialized) {
    return (
      <div className="device-panel loading">
        <h3>Device {deviceId}</h3>
        <p>Initializing...</p>
      </div>
    )
  }

  return (
    <div className="device-panel">
      <h3>Device {deviceId}</h3>
      
      <div className="device-status">
        <p>Simulation Time: {currentSimTime}ms</p>
        <p>Events: {events.length}</p>
      </div>
      
      <div className="message-input">
        <input
          type="text"
          value={messageInput}
          onChange={(e) => setMessageInput(e.target.value)}
          placeholder="Type a message..."
          onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
        />
        <button onClick={handleSendMessage} disabled={!messageInput.trim()}>
          Send
        </button>
      </div>
      
      <div className="event-list">
        <h4>Events ({events.length})</h4>
        <div className="events">
          {events.map((event, index) => (
            <div key={index} className="event">
              <div className="event-meta">
                <span>From: {event.device_id}</span>
                <span>Created: {event.created_at}ms</span>
                <span>Received: {event.received_at}ms</span>
              </div>
              <div className="event-content">
                {decryptAndDisplayMessage(event)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})