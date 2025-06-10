import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react'
import type { ChatAPI, ChatMessage } from '../api/ChatAPI'
import { BackendAdapter } from '../api/BackendAdapter'
import { EmojiPicker } from './EmojiPicker'
// Image compression moved to backend

// Utility function for formatting file sizes
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

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
  originalSize?: number
  compressed?: boolean
  compressionRatio?: number
  originalFile?: File // Store the original File object for sending
}

interface Message {
  id: string
  content: string
  timestamp: number
  fromSimulation?: boolean
  attachments?: FileAttachment[]
  isOwn?: boolean
  author?: string
  reactions?: Array<{
    emoji: string
    author: string
    timestamp: number
  }>
}

interface ChatInterfaceProps {
  deviceId: string
  currentSimTime: number
  syncStatus?: { isSynced: boolean, syncPercentage: number }
  imageAttachmentPercentage: number
  onManualMessage: (deviceId: string, content: string, attachments?: FileAttachment[]) => void
  chatAPI?: ChatAPI | null
  backendAdapter?: BackendAdapter
  databaseStats?: { eventCount: number, syncPercentage: number }
  isOnline?: boolean
  onToggleOnline?: (deviceId: string, isOnline: boolean) => void
}

export interface ChatInterfaceRef {
  handleSimulationMessage: (content: string, attachments?: any[]) => void
}

export const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(
  ({ deviceId, currentSimTime, syncStatus, imageAttachmentPercentage, onManualMessage, chatAPI, backendAdapter, databaseStats, isOnline = true, onToggleOnline }, ref) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [inputValue, setInputValue] = useState('')
    const [selectedFiles, setSelectedFiles] = useState<FileAttachment[]>([])
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null)
    const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ x: number, y: number } | undefined>()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)

    // Subscribe to ChatAPI updates
    useEffect(() => {
      // Use backend adapter if available, otherwise fall back to chatAPI
      if (backendAdapter) {
        // Poll backend for messages
        backendAdapter.startPolling((newMessages) => {
          setMessages(prevMessages => {
            // Merge new messages, avoiding duplicates
            const existingIds = new Set(prevMessages.map(m => m.id))
            const uniqueNewMessages = newMessages.filter(m => !existingIds.has(m.id))
            return [...prevMessages, ...uniqueNewMessages]
          })
        })
        
        return () => {
          backendAdapter.stopPolling()
        }
      } else if (chatAPI) {
        // Use local chatAPI
        const unsubscribe = chatAPI.onMessagesUpdate((apiMessages: ChatMessage[]) => {
          // Convert ChatAPI messages to our Message format
          const convertedMessages: Message[] = apiMessages.map(msg => ({
            id: msg.id,
            content: msg.content,
            timestamp: msg.timestamp,
            isOwn: msg.isOwn,
            author: msg.author,
            fromSimulation: !msg.isOwn,
            attachments: msg.attachments?.map(att => ({
              id: `api-${att.fileId}`,
              type: att.mimeType?.startsWith('image/') ? 'image' as const : 'document' as const,
              name: att.fileName || 'file',
              size: Math.round(att.chunkCount * 500), // Estimate from chunk count
              url: `/test-images/${att.fileName}`, // For demo
              mimeType: att.mimeType || 'application/octet-stream',
              loadingState: 'loaded' as const
            })),
            reactions: msg.reactions
          }))
        setMessages(convertedMessages)
      })
      
      return () => {
        unsubscribe()
      }
    }
    }, [chatAPI, backendAdapter])

    // Auto-scroll to bottom when messages change
    useEffect(() => {
      if (messagesContainerRef.current) {
        messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
      }
    }, [messages])

    useImperativeHandle(ref, () => ({
      handleSimulationMessage: (content: string, attachments?: any[]) => {
        // Convert simulation engine attachments to UI format
        let uiAttachments: FileAttachment[] | undefined
        
        if (attachments && attachments.length > 0) {
          uiAttachments = attachments.map(att => ({
            id: `sim-${Date.now()}-${Math.random()}`,
            type: att.mimeType?.startsWith('image/') ? 'image' as const : 'document' as const,
            name: att.fileName || 'file',
            size: Math.round(att.chunkCount * 500), // Estimate size from chunk count
            url: `/test-images/${att.fileName}`, // For demo, use test image path
            mimeType: att.mimeType || 'application/octet-stream',
            loadingState: 'loaded' as const
          }))
        }
        
        const newMessage: Message = {
          id: `sim-${Date.now()}-${Math.random()}`,
          content,
          timestamp: currentSimTime,
          fromSimulation: true,
          attachments: uiAttachments
        }
        setMessages(prev => [...prev, newMessage])
      }
    }))

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files) return

      // Convert files to attachments with compression
      const newAttachments: FileAttachment[] = []
      
      for (const file of Array.from(files)) {
        const attachment: FileAttachment = {
          id: `file-${Date.now()}-${Math.random()}`,
          type: file.type.startsWith('image/') ? 'image' : 'document',
          name: file.name,
          size: file.size,
          originalSize: file.size,
          url: URL.createObjectURL(file),
          mimeType: file.type,
          loadingState: 'loading',
          compressed: false,
          originalFile: file // Store the original File object
        }
        
        newAttachments.push(attachment)
        
        // File processing moved to backend - just mark as loaded
        try {
          // TODO: Send file to backend for compression and processing
          attachment.loadingState = 'loaded'
          
          // Trigger re-render
          setSelectedFiles(prev => [...prev])
          
        } catch (error) {
          console.error('Error processing file:', error)
          attachment.loadingState = 'error'
          setSelectedFiles(prev => [...prev])
        }
      }

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

    const handleSendMessage = async () => {
      console.log('[ChatInterface] handleSendMessage called', { inputValue, selectedFilesCount: selectedFiles.length })
      
      if (!inputValue.trim() && selectedFiles.length === 0) {
        console.log('[ChatInterface] No content or files, returning early')
        return
      }
      
      const content = inputValue.trim()
      const files = selectedFiles.length > 0 ? selectedFiles : undefined
      
      console.log('[ChatInterface] Preparing to send', { content, hasFiles: !!files, chatAPI: !!chatAPI, backendAdapter: !!backendAdapter })
      
      try {
        // Priority: ChatAPI > BackendAdapter > Simulation Engine
        if (chatAPI && selectedFiles.length > 0) {
          console.log('[ChatInterface] Using ChatAPI path with files')
          // Use the original File objects directly
          const actualFiles: File[] = selectedFiles
            .map(attachment => attachment.originalFile)
            .filter((file): file is File => file !== undefined)
          
          console.log('[ChatInterface] Converted to actualFiles:', actualFiles.length)
          
          await chatAPI.sendMessageWithFiles(content, actualFiles)
          console.log('[ChatInterface] ChatAPI.sendMessageWithFiles completed')
          
          // Also add to simulation timeline for visualization
          console.log('[ChatInterface] Calling onManualMessage for timeline')
          onManualMessage(deviceId, content, files)
        } else if (chatAPI) {
          console.log('[ChatInterface] Using ChatAPI path without files')
          await chatAPI.sendMessage(content)
        } else if (backendAdapter) {
          console.log('[ChatInterface] Using BackendAdapter path')
          await backendAdapter.sendMessage(content, files)
        } else {
          console.log('[ChatInterface] Using fallback simulation engine path')
          // Fallback to simulation engine
          onManualMessage(deviceId, content, files)
        }
        
        console.log('[ChatInterface] Clearing input and files')
        setInputValue('')
        setSelectedFiles([])
        console.log('[ChatInterface] Message sending completed successfully')
      } catch (error) {
        console.error('[ChatInterface] Failed to send message:', error)
      }
    }

    const handleKeyPress = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSendMessage()
      }
    }

    const handleAddReaction = (messageId: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const rect = (e.target as HTMLElement).getBoundingClientRect()
      setEmojiPickerMessageId(messageId)
      setEmojiPickerPosition({ x: rect.left, y: rect.bottom + 5 })
      setShowEmojiPicker(true)
    }

    const handleEmojiSelect = async (emoji: string) => {
      if (emojiPickerMessageId && chatAPI) {
        await chatAPI.addReaction(emojiPickerMessageId, emoji)
      }
      setShowEmojiPicker(false)
      setEmojiPickerMessageId(null)
    }

    const handleReactionClick = async (messageId: string, emoji: string, hasReacted: boolean) => {
      if (!chatAPI) return
      
      if (hasReacted) {
        await chatAPI.removeReaction(messageId, emoji)
      } else {
        await chatAPI.addReaction(messageId, emoji)
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
              <span className={`status-indicator ${isOnline ? 'online' : 'offline'}`}>
                ● {isOnline ? 'Online' : 'Offline'}
              </span>
              {syncStatus && isOnline && (
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
                {!message.isOwn && message.author && (
                  <div className="message-author">{message.author}</div>
                )}
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
                  {(message.reactions && message.reactions.length > 0) && (
                    <div className="message-reactions">
                      {Object.entries(
                        message.reactions.reduce((acc, reaction) => {
                          if (!acc[reaction.emoji]) acc[reaction.emoji] = []
                          acc[reaction.emoji].push(reaction.author)
                          return acc
                        }, {} as Record<string, string[]>)
                      ).map(([emoji, authors]) => {
                        const hasReacted = authors.includes(deviceId)
                        return (
                          <button
                            key={emoji}
                            className={`reaction-badge ${hasReacted ? 'own' : ''}`}
                            onClick={() => handleReactionClick(message.id, emoji, hasReacted)}
                          >
                            <span>{emoji}</span>
                            <span className="reaction-count">{authors.length}</span>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                <button
                  className="add-reaction-button"
                  onClick={(e) => handleAddReaction(message.id, e)}
                  title="Add reaction"
                >
                  😊
                </button>
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
                    <div className="file-preview-details">
                      <small className="file-preview-size">
                        {formatFileSize(file.size)}
                        {file.compressed && file.originalSize && (
                          <span className="compression-info">
                            {' '}(was {formatFileSize(file.originalSize)})
                          </span>
                        )}
                      </small>
                      {file.loadingState === 'loading' && (
                        <small className="compression-status">Compressing...</small>
                      )}
                      {file.compressed && file.compressionRatio && (
                        <small className="compression-status">
                          Compressed {Math.round((1 - file.compressionRatio) * 100)}%
                        </small>
                      )}
                    </div>
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
            aria-label="Send message"
          >
            Send
          </button>
        </div>
        
        {/* Database Activity Panel */}
        {databaseStats && (
          <div className="database-activity">
            <div className="db-stats">
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
            {onToggleOnline && (
              <div className="online-toggle">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={isOnline}
                    onChange={(e) => onToggleOnline(deviceId, e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                </label>
                <span className="toggle-label">{isOnline ? 'Online' : 'Offline'}</span>
              </div>
            )}
          </div>
        )}
        
        {showEmojiPicker && (
          <EmojiPicker
            onEmojiSelect={handleEmojiSelect}
            onClose={() => {
              setShowEmojiPicker(false)
              setEmojiPickerMessageId(null)
            }}
            position={emojiPickerPosition}
          />
        )}
      </div>
    )
  }
)