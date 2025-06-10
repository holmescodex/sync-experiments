import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react'
import { BackendAdapter } from '../api/BackendAdapter'
import { EmojiPicker } from './EmojiPicker'
import type { Message, FileAttachment } from '../types/message'

// Utility function for formatting file sizes
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

interface ChatInterfaceProps {
  deviceId: string
  currentSimTime: number
  syncStatus?: { isSynced: boolean, syncPercentage: number }
  imageAttachmentPercentage: number
  onManualMessage: (deviceId: string, content: string, attachments?: FileAttachment[]) => void
  backendAdapter?: BackendAdapter
  databaseStats?: { eventCount: number, syncPercentage: number }
  isOnline?: boolean
  onToggleOnline?: (deviceId: string, isOnline: boolean) => void
}

export interface ChatInterfaceRef {
  handleSimulationMessage: (content: string, attachments?: any[]) => void
}

export const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(
  ({ deviceId, currentSimTime, syncStatus, imageAttachmentPercentage, onManualMessage, backendAdapter, databaseStats, isOnline = true, onToggleOnline }, ref) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [inputValue, setInputValue] = useState('')
    const [selectedFiles, setSelectedFiles] = useState<FileAttachment[]>([])
    const [showEmojiPicker, setShowEmojiPicker] = useState(false)
    const [emojiPickerMessageId, setEmojiPickerMessageId] = useState<string | null>(null)
    const [emojiPickerPosition, setEmojiPickerPosition] = useState<{ x: number, y: number } | undefined>()
    const fileInputRef = useRef<HTMLInputElement>(null)
    const messagesContainerRef = useRef<HTMLDivElement>(null)

    // Subscribe to backend message updates
    useEffect(() => {
      if (!backendAdapter) return
      
      // Poll backend for messages
      backendAdapter.startPolling((newMessages) => {
        setMessages(prevMessages => {
          // Convert backend messages to our Message format
          const convertedMessages: Message[] = newMessages.map(msg => ({
            id: msg.id,
            content: msg.content,
            timestamp: msg.timestamp,
            isOwn: msg.isOwn,
            author: msg.author,
            fromSimulation: false,
            attachments: msg.attachments,
            reactions: msg.reactions
          }))
          
          // Create a map of all messages by ID for efficient lookup
          const messageMap = new Map<string, Message>()
          
          // Add existing messages to map
          prevMessages.forEach(msg => {
            messageMap.set(msg.id, msg)
          })
          
          // Update or add new messages (this will update reactions)
          convertedMessages.forEach(msg => {
            messageMap.set(msg.id, msg)
          })
          
          // Return all messages sorted by timestamp
          return Array.from(messageMap.values()).sort((a, b) => a.timestamp - b.timestamp)
        })
      })
      
      return () => {
        backendAdapter.stopPolling()
      }
    }, [backendAdapter])

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
          attachments: uiAttachments,
          isOwn: true, // Simulation messages from this device are also "own" messages
          author: deviceId
        }
        setMessages(prev => [...prev, newMessage])
      }
    }))

    const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = event.target.files
      if (!files) return

      // Convert files to attachments
      const newAttachments: FileAttachment[] = Array.from(files).map(file => ({
        id: `file-${Date.now()}-${Math.random()}`,
        type: file.type.startsWith('image/') ? 'image' : 'document',
        name: file.name,
        size: file.size,
        originalSize: file.size,
        url: URL.createObjectURL(file),
        mimeType: file.type,
        loadingState: 'loaded' as const,
        compressed: false,
        originalFile: file
      }))

      setSelectedFiles(prev => [...prev, ...newAttachments])
      
      // Clear the input
      if (event.target) {
        event.target.value = ''
      }
    }

    const removeFile = (fileId: string) => {
      setSelectedFiles(prev => prev.filter(f => f.id !== fileId))
    }

    const handleSendMessage = async () => {
      if (!inputValue.trim() && selectedFiles.length === 0) {
        return
      }
      
      const content = inputValue.trim()
      const files = selectedFiles.length > 0 ? selectedFiles : undefined
      
      try {
        if (backendAdapter) {
          // Immediately add message to local state (optimistic update)
          const tempId = `temp-${Date.now()}-${Math.random()}`
          const optimisticMessage: Message = {
            id: tempId,
            content,
            timestamp: Date.now(),
            isOwn: true,
            author: deviceId,
            attachments: files
          }
          setMessages(prev => [...prev, optimisticMessage])
          
          // Send to backend and get the real message with ID
          const sentMessage = await backendAdapter.sendMessage(content, files)
          
          if (sentMessage) {
            // Replace the temporary message with the real one
            setMessages(prev => prev.map(msg => 
              msg.id === tempId 
                ? { ...sentMessage, attachments: files } 
                : msg
            ))
          }
        } else {
          // Fallback: notify parent for simulation timeline
          onManualMessage(deviceId, content, files)
        }
        
        setInputValue('')
        setSelectedFiles([])
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
      if (emojiPickerMessageId && backendAdapter) {
        await backendAdapter.addReaction(emojiPickerMessageId, emoji)
      }
      setShowEmojiPicker(false)
      setEmojiPickerMessageId(null)
    }

    const handleReactionClick = async (messageId: string, emoji: string, hasReacted: boolean) => {
      if (backendAdapter) {
        if (hasReacted) {
          await backendAdapter.removeReaction(messageId, emoji)
        } else {
          await backendAdapter.addReaction(messageId, emoji)
        }
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