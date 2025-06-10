import type { BackendMessage } from '../types/message'

export type Message = BackendMessage

export class MessageAPI {
  constructor(private backendUrl: string) {}

  async sendMessage(content: string, attachments?: any[]): Promise<Message> {
    const response = await fetch(`${this.backendUrl}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content, attachments })
    })

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`)
    }

    return response.json()
  }

  async getMessages(since?: number): Promise<Message[]> {
    const url = since 
      ? `${this.backendUrl}/api/messages?since=${since}`
      : `${this.backendUrl}/api/messages`

    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to get messages: ${response.statusText}`)
    }

    const data = await response.json()
    return data.messages
  }

  async getMessage(id: string): Promise<Message> {
    const response = await fetch(`${this.backendUrl}/api/messages/${id}`)
    
    if (!response.ok) {
      throw new Error(`Failed to get message: ${response.statusText}`)
    }

    return response.json()
  }

  async addReaction(messageId: string, emoji: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/messages/${messageId}/reactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ emoji })
    })

    if (!response.ok) {
      throw new Error(`Failed to add reaction: ${response.statusText}`)
    }
  }

  async removeReaction(messageId: string, emoji: string): Promise<void> {
    const response = await fetch(`${this.backendUrl}/api/messages/${messageId}/reactions/${emoji}`, {
      method: 'DELETE'
    })

    if (!response.ok) {
      throw new Error(`Failed to remove reaction: ${response.statusText}`)
    }
  }
}