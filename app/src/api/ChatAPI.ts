/**
 * ChatAPI - Simulated API for chat interfaces to interact with device databases
 * 
 * This API provides a clean interface for chat components to:
 * - Load messages from the database
 * - Receive real-time updates when new messages arrive (via sync or direct)
 * - Send messages through the simulation engine
 * 
 * The API abstracts away the complexity of:
 * - Database encryption/decryption
 * - Event format conversions
 * - Sync vs direct message handling
 */

import type { DeviceDB } from '../storage/device-db'
import type { SimulationEngine } from '../simulation/engine'

export interface ChatMessage {
  id: string
  content: string
  author: string
  timestamp: number
  isOwn: boolean
  attachments?: any[]
}

export interface ChatAPIConfig {
  deviceId: string
  database: DeviceDB
  engine: SimulationEngine
}

export type MessageCallback = (messages: ChatMessage[]) => void
export type NewMessageCallback = (message: ChatMessage) => void

export class ChatAPI {
  private deviceId: string
  private database: DeviceDB
  private engine: SimulationEngine
  private messageCallbacks: Set<MessageCallback> = new Set()
  private newMessageCallbacks: Set<NewMessageCallback> = new Set()
  private lastEventCount = 0
  private pollInterval?: NodeJS.Timeout
  
  constructor(config: ChatAPIConfig) {
    this.deviceId = config.deviceId
    this.database = config.database
    this.engine = config.engine
    
    // Start polling for database changes
    this.startPolling()
  }
  
  /**
   * Load all messages from the database
   */
  async loadMessages(): Promise<ChatMessage[]> {
    const events = await this.database.getAllEvents()
    const messages: ChatMessage[] = []
    
    for (const event of events) {
      try {
        // Decrypt the event payload
        const decrypted = new TextDecoder().decode(event.encrypted)
        const payload = JSON.parse(decrypted)
        
        // Only process message events
        if (payload.type === 'message') {
          messages.push({
            id: event.event_id,
            content: payload.content || '',
            author: payload.author || event.device_id,
            timestamp: event.created_at,
            isOwn: event.device_id === this.deviceId,
            attachments: payload.attachments
          })
        }
      } catch (error) {
        console.warn(`Failed to decrypt event ${event.event_id}:`, error)
      }
    }
    
    // Sort by timestamp
    return messages.sort((a, b) => a.timestamp - b.timestamp)
  }
  
  /**
   * Send a message through the simulation engine
   */
  async sendMessage(content: string, attachments?: any[]): Promise<void> {
    // The engine will handle storing in the database and network transmission
    await this.engine.createMessageEvent(this.deviceId, content)
  }
  
  /**
   * Subscribe to all message updates
   */
  onMessagesUpdate(callback: MessageCallback): () => void {
    this.messageCallbacks.add(callback)
    
    // Immediately send current messages
    this.loadMessages().then(messages => callback(messages))
    
    // Return unsubscribe function
    return () => {
      this.messageCallbacks.delete(callback)
    }
  }
  
  /**
   * Subscribe to new message arrivals only
   */
  onNewMessage(callback: NewMessageCallback): () => void {
    this.newMessageCallbacks.add(callback)
    
    // Return unsubscribe function
    return () => {
      this.newMessageCallbacks.delete(callback)
    }
  }
  
  /**
   * Start polling the database for changes
   * In a real app, this would use WebSockets or EventSource
   */
  private startPolling() {
    // Poll every 500ms for new messages
    this.pollInterval = setInterval(async () => {
      try {
        const events = await this.database.getAllEvents()
        
        // Check if we have new events
        if (events.length > this.lastEventCount) {
          const newEvents = events.slice(this.lastEventCount)
          this.lastEventCount = events.length
          
          // Process new events
          for (const event of newEvents) {
            try {
              const decrypted = new TextDecoder().decode(event.encrypted)
              const payload = JSON.parse(decrypted)
              
              if (payload.type === 'message') {
                const message: ChatMessage = {
                  id: event.event_id,
                  content: payload.content || '',
                  author: payload.author || event.device_id,
                  timestamp: event.created_at,
                  isOwn: event.device_id === this.deviceId,
                  attachments: payload.attachments
                }
                
                // Notify new message callbacks
                this.newMessageCallbacks.forEach(cb => cb(message))
              }
            } catch (error) {
              console.warn(`Failed to process new event:`, error)
            }
          }
          
          // Notify full update callbacks
          if (this.messageCallbacks.size > 0) {
            const allMessages = await this.loadMessages()
            this.messageCallbacks.forEach(cb => cb(allMessages))
          }
        }
      } catch (error) {
        console.error('Polling error:', error)
      }
    }, 500)
  }
  
  /**
   * Clean up resources
   */
  destroy() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval)
    }
    this.messageCallbacks.clear()
    this.newMessageCallbacks.clear()
  }
}

/**
 * Factory function to create ChatAPI instances
 */
export function createChatAPI(
  deviceId: string,
  engine: SimulationEngine
): ChatAPI | null {
  const database = engine.getDeviceDatabase(deviceId)
  if (!database) {
    console.warn(`No database found for device ${deviceId}`)
    return null
  }
  
  return new ChatAPI({
    deviceId,
    database,
    engine
  })
}