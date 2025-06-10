/**
 * Core message types shared across the application
 */

export interface MessageReaction {
  emoji: string
  author: string
  timestamp: number
}

export interface FileAttachment {
  id: string
  type: 'image' | 'document' | 'video' | 'audio'
  name: string
  size: number
  url?: string
  mimeType: string
  loadingState?: 'pending' | 'loading' | 'loaded' | 'error'
  loadingProgress?: number
  originalSize?: number
  compressed?: boolean
  compressionRatio?: number
  originalFile?: File // Only used in frontend for upload
}

/**
 * Core message interface used throughout the application
 */
export interface Message {
  id: string
  content: string
  author: string
  timestamp: number
  isOwn?: boolean // True if message was sent by current device
  attachments?: FileAttachment[]
  reactions?: MessageReaction[]
  fromSimulation?: boolean // Legacy field for simulation mode
}

/**
 * Message format used by backend API
 */
export interface BackendMessage {
  id: string
  author: string
  content: string
  timestamp: number
  attachments: any[] // Backend uses generic array
  reactions?: MessageReaction[]
}