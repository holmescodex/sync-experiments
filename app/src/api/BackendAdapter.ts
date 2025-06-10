import { MessageAPI } from './MessageAPI'
import { ChatAPI } from './ChatAPI'

export interface Message {
  id: string
  author: string
  content: string
  timestamp: number
  attachments?: any[]
  isOwn?: boolean
}

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

  async sendMessage(content: string, attachments?: any[]): Promise<void> {
    if (this.messageAPI) {
      // Use backend API
      await this.messageAPI.sendMessage(content, attachments)
    } else if (this.chatAPI) {
      // Use local ChatAPI
      await this.chatAPI.sendMessage(content, attachments)
    }
  }

  async getMessages(): Promise<Message[]> {
    if (this.messageAPI) {
      // Use backend API
      const messages = await this.messageAPI.getMessages(this.lastSyncTime)
      if (messages.length > 0) {
        this.lastSyncTime = Math.max(...messages.map(m => m.timestamp))
      }
      
      // Mark messages as own/received
      return messages.map(msg => ({
        ...msg,
        isOwn: msg.author === this.deviceId
      }))
    } else if (this.chatAPI) {
      // Use local ChatAPI
      const messages = await this.chatAPI.getMessages()
      return messages.map(msg => ({
        id: msg.id,
        author: msg.author,
        content: msg.content,
        timestamp: msg.timestamp,
        attachments: msg.attachments,
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