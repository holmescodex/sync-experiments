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
import { FileChunkHandler, type FileMessageAttachment } from '../files/FileChunkHandler'
import type { NetworkSimulator } from '../network/simulator'

export interface ChatMessage {
  id: string
  content: string
  author: string
  timestamp: number
  isOwn: boolean
  attachments?: FileMessageAttachment[]
  reactions?: MessageReaction[]
}

export interface MessageReaction {
  emoji: string
  author: string
  timestamp: number
}

export interface ChatAPIConfig {
  deviceId: string
  database: DeviceDB
  engine: SimulationEngine
  networkSimulator: NetworkSimulator
}

export type MessageCallback = (messages: ChatMessage[]) => void
export type NewMessageCallback = (message: ChatMessage) => void

export class ChatAPI {
  private deviceId: string
  private database: DeviceDB
  private engine: SimulationEngine
  private fileChunkHandler: FileChunkHandler
  private messageCallbacks: Set<MessageCallback> = new Set()
  private newMessageCallbacks: Set<NewMessageCallback> = new Set()
  private lastEventCount = 0
  private pollInterval?: NodeJS.Timeout
  
  constructor(config: ChatAPIConfig) {
    this.deviceId = config.deviceId
    this.database = config.database
    this.engine = config.engine
    
    // Initialize file chunk handler
    this.fileChunkHandler = new FileChunkHandler(
      config.deviceId,
      config.database,
      config.networkSimulator
    )
    
    // Start polling for database changes
    this.startPolling()
  }
  
  /**
   * Load all messages from the database
   */
  async loadMessages(): Promise<ChatMessage[]> {
    const events = await this.database.getAllEvents()
    const messages: Map<string, ChatMessage> = new Map()
    const reactions: Map<string, MessageReaction[]> = new Map()
    
    for (const event of events) {
      try {
        // Decrypt the event payload
        const decrypted = new TextDecoder().decode(event.encrypted)
        const payload = JSON.parse(decrypted)
        
        // Process message events
        if (payload.type === 'message') {
          messages.set(event.event_id, {
            id: event.event_id,
            content: payload.content || '',
            author: payload.author || event.device_id,
            timestamp: event.created_at,
            isOwn: event.device_id === this.deviceId,
            attachments: payload.attachments,
            reactions: []
          })
        }
        // Process reaction events
        else if (payload.type === 'reaction') {
          const messageReactions = reactions.get(payload.messageId) || []
          
          if (payload.remove) {
            // Remove reaction
            const index = messageReactions.findIndex(
              r => r.emoji === payload.emoji && r.author === (payload.author || event.device_id)
            )
            if (index >= 0) {
              messageReactions.splice(index, 1)
            }
          } else {
            // Add reaction
            messageReactions.push({
              emoji: payload.emoji,
              author: payload.author || event.device_id,
              timestamp: event.created_at
            })
          }
          
          reactions.set(payload.messageId, messageReactions)
        }
      } catch (error) {
        console.warn(`Failed to decrypt event ${event.event_id}:`, error)
      }
    }
    
    // Attach reactions to messages
    for (const [messageId, messageReactions] of reactions) {
      const message = messages.get(messageId)
      if (message) {
        message.reactions = messageReactions
      }
    }
    
    // Sort by timestamp and return
    return Array.from(messages.values()).sort((a, b) => a.timestamp - b.timestamp)
  }
  
  /**
   * Send a message through the simulation engine
   */
  async sendMessage(content: string, attachments?: FileMessageAttachment[]): Promise<void> {
    // The engine will handle storing in the database and network transmission
    await this.engine.createMessageEvent(this.deviceId, content, undefined, attachments)
  }
  
  /**
   * Add a reaction to a message
   */
  async addReaction(messageId: string, emoji: string): Promise<void> {
    // Create a reaction event
    await this.engine.createReactionEvent(this.deviceId, messageId, emoji)
  }
  
  /**
   * Remove a reaction from a message
   */
  async removeReaction(messageId: string, emoji: string): Promise<void> {
    // Create a reaction removal event
    await this.engine.createReactionEvent(this.deviceId, messageId, emoji, true)
  }
  
  /**
   * Upload a file and get attachment metadata
   */
  async uploadFile(fileData: Uint8Array, mimeType: string, fileName?: string): Promise<FileMessageAttachment> {
    return await this.fileChunkHandler.uploadFile(fileData, mimeType, fileName)
  }

  /**
   * Send a message with file attachments - handles upload + message creation
   */
  async sendMessageWithFiles(content: string, files: File[]): Promise<void> {
    const attachments: FileMessageAttachment[] = []
    
    // Upload each file and get attachment metadata
    for (const file of files) {
      const fileData = new Uint8Array(await file.arrayBuffer())
      const attachment = await this.uploadFile(fileData, file.type, file.name)
      attachments.push(attachment)
    }
    
    // Send message with all attachments
    await this.sendMessage(content, attachments)
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
    // Poll every 500ms for new messages and reactions
    this.pollInterval = setInterval(async () => {
      try {
        const events = await this.database.getAllEvents()
        
        // Check if we have new events (including reactions)
        if (events.length > this.lastEventCount) {
          const newEvents = events.slice(this.lastEventCount)
          this.lastEventCount = events.length
          
          // Check if any new events are reactions or messages
          let hasNewMessage = false
          let hasNewReaction = false
          
          // Process new events
          for (const event of newEvents) {
            try {
              const decrypted = new TextDecoder().decode(event.encrypted)
              const payload = JSON.parse(decrypted)
              
              if (payload.type === 'message') {
                hasNewMessage = true
                const message: ChatMessage = {
                  id: event.event_id,
                  content: payload.content || '',
                  author: payload.author || event.device_id,
                  timestamp: event.created_at,
                  isOwn: event.device_id === this.deviceId,
                  attachments: payload.attachments
                }
                
                // Handle file attachments if present
                if (payload.attachments && payload.attachments.length > 0) {
                  for (const attachment of payload.attachments) {
                    await this.fileChunkHandler.handleFileAttachment(attachment)
                  }
                }
                
                // Notify new message callbacks
                this.newMessageCallbacks.forEach(cb => cb(message))
              } else if (payload.type === 'reaction') {
                hasNewReaction = true
                // Reactions will be processed when we reload all messages
              } else if (payload.type === 'file_chunk') {
                // Handle file chunk events
                const chunkData = Buffer.from(payload.chunkData, 'base64')
                await this.fileChunkHandler.handleChunkEvent({
                  type: 'file_chunk',
                  prfTag: payload.prfTag,
                  encryptedData: new Uint8Array(chunkData),
                  timestamp: payload.timestamp
                })
              }
            } catch (error) {
              console.warn(`Failed to process new event:`, error)
            }
          }
          
          // Always notify full update callbacks when we have new events
          // This ensures reactions are properly displayed
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
  
  const networkSimulator = engine.getNetworkSimulator()
  
  return new ChatAPI({
    deviceId,
    database,
    engine,
    networkSimulator
  })
}