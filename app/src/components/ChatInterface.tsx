import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react'
import type { ChatAPI, ChatMessage } from '../api/ChatAPI'

interface FileAttachment {
  id: string
  type: 'image' | 'document' | 'video' | 'audio'
  name: string
  size: number
  url?: string
  contentId?: string
  mimeType: string
  loadingState?: 'pending' | 'loading' | 'loaded' | 'error'
  loadingProgress?: number
}

interface Message {
  id: string
  content: string
  timestamp: number
  fromSimulation?: boolean
  attachments?: FileAttachment[]
  isOwn?: boolean
  author?: string
}

interface ChatInterfaceProps {
  deviceId: string
  currentSimTime: number
  syncStatus?: { isSynced: boolean, syncPercentage: number }
  imageAttachmentPercentage: number
  onManualMessage: (deviceId: string, content: string, attachments?: FileAttachment[]) => void
  chatAPI?: ChatAPI | null
  databaseStats?: { eventCount: number, syncPercentage: number }
}

export interface ChatInterfaceRef {
  handleSimulationMessage: (content: string) => void
}

export const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(
  ({ deviceId, currentSimTime, syncStatus, imageAttachmentPercentage, onManualMessage, chatAPI, databaseStats }, ref) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [inputValue, setInputValue] = useState('')
    const [selectedFiles, setSelectedFiles] = useState<FileAttachment[]>([])
    const fileInputRef = useRef<HTMLInputElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)

    // Subscribe to ChatAPI updates
    useEffect(() => {
      if (!chatAPI) return
      
      // Subscribe to all message updates
      const unsubscribe = chatAPI.onMessagesUpdate((apiMessages: ChatMessage[]) => {
        // Convert ChatAPI messages to our Message format
        const convertedMessages: Message[] = apiMessages.map(msg => ({
          id: msg.id,
          content: msg.content,
          timestamp: msg.timestamp,
          isOwn: msg.isOwn,
          author: msg.author,
          fromSimulation: !msg.isOwn,
          attachments: msg.attachments
        }))
        setMessages(convertedMessages)
      })
      
      return () => {
        unsubscribe()
      }
    }, [chatAPI])

    // Auto-scroll to bottom when messages change
    useEffect(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
    }, [messages])

    useImperativeHandle(ref, () => ({
      handleSimulationMessage: (content: string) => {
        // Demo: Sometimes add random test images to simulation messages
        const shouldHaveAttachment = Math.random() < (imageAttachmentPercentage / 100)
        let attachments: FileAttachment[] | undefined
        
        if (shouldHaveAttachment && content.length > 10) {
          const testImages = ['landscape.jpg', 'portrait.jpg', 'abstract.jpg', 'diagram.png', 'small.jpg']
          const randomImage = testImages[Math.floor(Math.random() * testImages.length)]
          attachments = [{
            id: `demo-${Date.now()}`,
            type: 'image',
            name: randomImage,
            size: Math.floor(Math.random() * 50000) + 10000, // Random size between 10-60KB
            url: `/test-images/${randomImage}`,
            mimeType: randomImage.endsWith('.png') ? 'image/png' : 'image/jpeg',
            loadingState: 'loaded'
          }]
        }
        
        const newMessage: Message = {
          id: `sim-${Date.now()}-${Math.random()}`,
          content,
          timestamp: currentSimTime,
          fromSimulation: true,
          attachments
        }
        setMessages(prev => [...prev, newMessage])
      }
    }))

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files) return

      const newAttachments: FileAttachment[] = Array.from(files).map(file => ({
        id: `file-${Date.now()}-${Math.random()}`,
        type: file.type.startsWith('image/') ? 'image' : 'document',
        name: file.name,
        size: file.size,
        url: `/test-images/${getTestImageForFile(file)}`, // Placeholder URL
        mimeType: file.type,
        loadingState: 'loaded'
      }))

      setSelectedFiles(prev => [...prev, ...newAttachments])
      
      // Clear the input
      if (event.target) {
        event.target.value = ''
      }
    }

    const getTestImageForFile = (file: File): string => {
      // For demo purposes, map to our test images based on file characteristics
      if (file.size > 50000) return 'abstract.jpg'
      if (file.name.toLowerCase().includes('landscape')) return 'landscape.jpg'
      if (file.name.toLowerCase().includes('portrait')) return 'portrait.jpg'
      if (file.name.toLowerCase().includes('diagram')) return 'diagram.png'
      return 'small.jpg'
    }

    const removeFile = (fileId: string) => {
      setSelectedFiles(prev => prev.filter(f => f.id !== fileId))
    }

    const handleSendMessage = () => {
      if (!inputValue.trim() && selectedFiles.length === 0) return
      
      // Only notify the parent - don't add message locally
      // The message will come back through the simulation engine
      onManualMessage(deviceId, inputValue.trim(), selectedFiles.length > 0 ? selectedFiles : undefined)
      setInputValue('')
      setSelectedFiles([])
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSendMessage()
      }
    }

    const formatTime = (ms: number) => {
      const date = new Date(Date.now() - 1000000 + ms) // Fake timestamp for display
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }

    return (
      <div className="chat-interface" data-testid={`chat-${deviceId}`}>
        <div className="chat-header">
          <div className="device-avatar">
            <span className={`avatar device-${deviceId}`}>
              {deviceId.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="device-info">
            <h4>{deviceId}</h4>
            <div className="status-indicators">
              <span className="status-indicator online">● Online</span>
              {syncStatus && (
                <span 
                  className={`status-indicator sync ${syncStatus.isSynced ? 'synced' : 'syncing'}`}
                  data-testid="sync-indicator"
                >
                  {syncStatus.isSynced ? '● Synced' : `● Syncing (${syncStatus.syncPercentage}%)`}
                </span>
              )}
              <span className="status-indicator messages">
                {messages.length} messages
              </span>
            </div>
          </div>
        </div>
        
        <div className="chat-messages" ref={messagesContainerRef}>
          {messages.length === 0 ? (
            <div className="no-messages">
              <p>No messages yet</p>
              <small>Messages will appear here as they are generated or sent</small>
            </div>
          ) : (
            messages.map((message) => (
              <div 
                key={message.id} 
                className={`message ${message.isOwn ? 'sent' : 'received'}`}
              >
                <div className="message-bubble">
                  {message.content && (
                    <div className="message-content">{message.content}</div>
                  )}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="message-attachments">
                      {message.attachments.map((attachment) => (
                        <div key={attachment.id} className="attachment">
                          {attachment.type === 'image' && attachment.loadingState === 'loaded' && (
                            <div className="image-attachment">
                              <img 
                                src={attachment.url} 
                                alt={attachment.name}
                                className="attachment-image"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none'
                                  const nextEl = e.currentTarget.nextElementSibling as HTMLElement
                                  if (nextEl) nextEl.style.display = 'block'
                                }}
                              />
                              <div className="image-error" style={{display: 'none'}}>
                                <span>📷 {attachment.name}</span>
                                <small>{Math.round(attachment.size / 1024)}KB</small>
                              </div>
                            </div>
                          )}
                          {attachment.type === 'image' && attachment.loadingState === 'loading' && (
                            <div className="image-loading">
                              <div className="loading-spinner"></div>
                              <span>Loading {attachment.name}...</span>
                              {attachment.loadingProgress && (
                                <div className="progress-bar">
                                  <div 
                                    className="progress-fill" 
                                    style={{width: `${attachment.loadingProgress}%`}}
                                  ></div>
                                </div>
                              )}
                            </div>
                          )}
                          {attachment.type !== 'image' && (
                            <div className="file-attachment">
                              <span className="file-icon">📄</span>
                              <div className="file-info">
                                <span className="file-name">{attachment.name}</span>
                                <small className="file-size">{Math.round(attachment.size / 1024)}KB</small>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="message-time">
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        {selectedFiles.length > 0 && (
          <div className="file-preview">
            <div className="file-preview-header">
              <span>Attachments ({selectedFiles.length})</span>
            </div>
            <div className="file-preview-list">
              {selectedFiles.map((file) => (
                <div key={file.id} className="file-preview-item">
                  {file.type === 'image' && (
                    <img 
                      src={file.url} 
                      alt={file.name}
                      className="file-preview-image"
                    />
                  )}
                  <div className="file-preview-info">
                    <span className="file-preview-name">{file.name}</span>
                    <small className="file-preview-size">{Math.round(file.size / 1024)}KB</small>
                  </div>
                  <button 
                    className="file-remove-btn"
                    onClick={() => removeFile(file.id)}
                    title="Remove file"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="chat-input">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            accept="image/*,.pdf,.doc,.docx,.txt"
            style={{ display: 'none' }}
          />
          <div className="input-container">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={`Type a message as ${deviceId}...`}
              className="message-input"
            />
            <button
              className="attach-button-inline"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              type="button"
            >
              📎
            </button>
          </div>
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim() && selectedFiles.length === 0}
            className="send-button"
          >
            Send
          </button>
        </div>
        
        {/* Database Activity Panel */}
        {databaseStats && (
          <div className="database-activity">
            <div className="db-stat">
              <span className="db-icon">💾</span>
              <span className="db-label">Events:</span>
              <span className="db-value">{databaseStats.eventCount}</span>
            </div>
            <div className="db-stat">
              <span className="db-icon">🔄</span>
              <span className="db-label">Sync:</span>
              <span className="db-value">{databaseStats.syncPercentage}%</span>
            </div>
          </div>
        )}
      </div>
    )
  }
)