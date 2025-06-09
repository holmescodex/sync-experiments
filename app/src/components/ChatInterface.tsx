import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'

interface Message {
  id: string
  content: string
  timestamp: number
  fromSimulation?: boolean
}

interface ChatInterfaceProps {
  deviceId: string
  currentSimTime: number
  syncStatus?: { isSynced: boolean, syncPercentage: number }
  onManualMessage: (deviceId: string, content: string) => void
}

export interface ChatInterfaceRef {
  handleSimulationMessage: (content: string) => void
}

export const ChatInterface = forwardRef<ChatInterfaceRef, ChatInterfaceProps>(
  ({ deviceId, currentSimTime, syncStatus, onManualMessage }, ref) => {
    const [messages, setMessages] = useState<Message[]>([])
    const [inputValue, setInputValue] = useState('')

    useImperativeHandle(ref, () => ({
      handleSimulationMessage: (content: string) => {
        const newMessage: Message = {
          id: `sim-${Date.now()}-${Math.random()}`,
          content,
          timestamp: currentSimTime,
          fromSimulation: true
        }
        setMessages(prev => [...prev, newMessage])
      }
    }))

    const handleSendMessage = () => {
      if (!inputValue.trim()) return
      
      // Only notify the parent - don't add message locally
      // The message will come back through the simulation engine
      onManualMessage(deviceId, inputValue.trim())
      setInputValue('')
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
            </div>
          </div>
        </div>
        
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="no-messages">
              <p>No messages yet</p>
              <small>Messages will appear here as they are generated or sent</small>
            </div>
          ) : (
            messages.map((message) => (
              <div 
                key={message.id} 
                className="message sent"
              >
                <div className="message-bubble">
                  <div className="message-content">{message.content}</div>
                  <div className="message-time">
                    {formatTime(message.timestamp)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="chat-input">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Type a message as ${deviceId}...`}
            className="message-input"
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputValue.trim()}
            className="send-button"
          >
            Send
          </button>
        </div>
      </div>
    )
  }
)