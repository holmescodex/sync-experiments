import { MessageAPI } from './MessageAPI'
import { ChatAPI } from './ChatAPI'
import { simulationEngineAPI } from './SimulationEngineAPI'
import type { Message, FileAttachment } from '../types/message'

/**
 * Adapter that can use either the backend API or the local ChatAPI
 * This allows gradual migration from local to backend
 */
export class BackendAdapter {
  private messageAPI: MessageAPI | null = null
  private chatAPI: ChatAPI | null = null
  private deviceId: string
  private lastSyncTime: number = 0
  private pollingInterval: NodeJS.Timeout | null = null

  private convertAttachmentForUI(raw: any): FileAttachment {
    const mime = raw.mimeType || raw.mime_type || 'application/octet-stream'
    const isImage = mime.startsWith('image/')
    return {
      id: raw.fileId || raw.id || `att-${Date.now()}`,
      type: isImage ? 'image' : 'document',
      name: raw.fileName || raw.name || 'file',
      size: raw.size || (raw.chunkCount ? raw.chunkCount * 500 : 0),
      url: raw.dataUrl || raw.url,
      mimeType: mime,
      loadingState: 'loaded'
    }
  }

  constructor(deviceId: string, backendUrl?: string, chatAPI?: ChatAPI) {
    this.deviceId = deviceId
    
    if (backendUrl) {
      this.messageAPI = new MessageAPI(backendUrl)
    } else if (chatAPI) {
      this.chatAPI = chatAPI
    } else {
      throw new Error('Either backendUrl or chatAPI must be provided')
    }
  }

  async sendMessage(content: string, attachments?: any[]): Promise<Message | null> {
    // Record to simulation engine (fire and forget)
    simulationEngineAPI.recordEvent({
      type: 'message',
      device: this.deviceId,
      content,
      attachments,
      source: 'manual'
    }).catch(err => {
      console.log('[BackendAdapter] Failed to record to simulation engine:', err)
    })
    
    if (this.messageAPI) {
      // Use backend API - returns the message with real ID
      const message = await this.messageAPI.sendMessage(content, attachments)
      return {
        ...message,
        isOwn: message.author === this.deviceId
      }
    } else if (this.chatAPI) {
      // Use local ChatAPI
      await this.chatAPI.sendMessage(content, attachments)
      return null // ChatAPI doesn't return the message
    }
    
    return null
  }

  async addReaction(messageId: string, emoji: string): Promise<void> {
    if (this.messageAPI) {
      // Use backend API
      await this.messageAPI.addReaction(messageId, emoji)
    } else if (this.chatAPI) {
      // Use local ChatAPI
      await this.chatAPI.addReaction(messageId, emoji)
    }
  }

  async removeReaction(messageId: string, emoji: string): Promise<void> {
    if (this.messageAPI) {
      // Use backend API
      await this.messageAPI.removeReaction(messageId, emoji)
    } else if (this.chatAPI) {
      // Use local ChatAPI
      await this.chatAPI.removeReaction(messageId, emoji)
    }
  }

  async getMessages(): Promise<Message[]> {
    if (this.messageAPI) {
      // Use backend API
      // On first load (lastSyncTime = 0), get all messages. Otherwise get since last sync.
      const sinceTime = this.lastSyncTime === 0 ? undefined : this.lastSyncTime
      console.log(`[BackendAdapter ${this.deviceId}] Fetching messages since ${sinceTime || 'beginning'}`)
      const messages = await this.messageAPI.getMessages(sinceTime)
      console.log(`[BackendAdapter ${this.deviceId}] Received ${messages.length} messages`)
      
      if (messages.length > 0) {
        this.lastSyncTime = Math.max(...messages.map(m => m.timestamp))
        console.log(`[BackendAdapter ${this.deviceId}] Updated lastSyncTime to ${this.lastSyncTime}`)
      }
      
      // Mark messages as own/received and normalize attachments
      return messages.map(msg => {
        const isOwn = msg.author === this.deviceId
        console.log(`[BackendAdapter] Message from ${msg.author}, deviceId=${this.deviceId}, isOwn=${isOwn}`)
        const attachments = Array.isArray(msg.attachments)
          ? msg.attachments.map(a => this.convertAttachmentForUI(a))
          : undefined
        return {
          ...msg,
          attachments,
          isOwn
        }
      })
    } else if (this.chatAPI) {
      // Use local ChatAPI - this returns messages with reactions already included
      const messages = await this.chatAPI.loadMessages()
      return messages.map(msg => ({
        id: msg.id,
        author: msg.author,
        content: msg.content,
        timestamp: msg.timestamp,
        attachments: msg.attachments?.map(a => this.convertAttachmentForUI(a)),
        reactions: msg.reactions,
        isOwn: msg.author === this.deviceId
      }))
    }
    
    return []
  }

  // Start polling for new messages
  startPolling(onNewMessages: (messages: Message[]) => void, interval: number = 1000): void {
    this.stopPolling() // Clear any existing interval
    
    const poll = async () => {
      try {
        const messages = await this.getMessages()
        if (messages.length > 0) {
          onNewMessages(messages)
        }
      } catch (error) {
        console.error('Error polling messages:', error)
      }
    }

    // Initial poll
    poll()
    
    // Set up interval
    this.pollingInterval = setInterval(poll, interval)
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval)
      this.pollingInterval = null
    }
  }

  // Get backend type for debugging
  getBackendType(): 'api' | 'local' {
    return this.messageAPI ? 'api' : 'local'
  }
}