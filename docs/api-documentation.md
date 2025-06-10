# Chat API Documentation

The ChatAPI provides a clean interface for chat components to interact with device databases and receive real-time updates about messages.

## Overview

The ChatAPI abstracts away the complexity of:
- Database encryption/decryption
- Event format conversions
- Sync vs direct message handling
- Real-time updates when new messages arrive

## Core Interface

```typescript
interface ChatAPI {
  // Load all messages from the database
  loadMessages(): Promise<ChatMessage[]>
  
  // Send a message (stores in DB and triggers sync)
  sendMessage(content: string, attachments?: any[]): Promise<void>
  
  // Subscribe to message updates (returns unsubscribe function)
  onMessagesUpdate(callback: (messages: ChatMessage[]) => void): () => void
  onNewMessage(callback: (message: ChatMessage) => void): () => void
  
  // Clean up resources
  destroy(): void
}

interface ChatMessage {
  id: string
  content: string
  author: string
  timestamp: number
  isOwn: boolean
  attachments?: any[]
}
```

## Key Features

### Real-time Updates
- Polls database for changes every 500ms
- Detects new messages from both local sends and sync arrivals
- Notifies subscribers of both individual new messages and full message list updates

### Message Decryption
- Automatically decrypts stored events
- Filters to only show message-type events
- Handles decryption errors gracefully

### Clean Separation
- Chat UI doesn't need to know about databases or sync mechanisms
- API handles all database interactions
- Simple message-based interface

### Bidirectional Display
- Messages marked with `isOwn: true` for sent messages
- Messages marked with `isOwn: false` for received messages
- UI can style them differently (sent vs received)

## Usage Example

```typescript
// Create API instance
const api = createChatAPI(deviceId, engine)

// Subscribe to all message updates
const unsubscribe = api.onMessagesUpdate((messages) => {
  // Update UI with all messages
  setMessages(messages)
})

// Subscribe to new messages only
const unsubNewMsg = api.onNewMessage((message) => {
  // Show notification for new message
  showNotification(`New message from ${message.author}`)
})

// Send a message
await api.sendMessage("Hello world!")

// Cleanup when done
api.destroy()
```

## Integration with Chat Interface

The ChatInterface component integrates with ChatAPI:

```typescript
// In ChatInterface component
useEffect(() => {
  if (!chatAPI) return
  
  const unsubscribe = chatAPI.onMessagesUpdate((apiMessages) => {
    // Convert to UI message format
    const uiMessages = apiMessages.map(msg => ({
      id: msg.id,
      content: msg.content,
      timestamp: msg.timestamp,
      isOwn: msg.isOwn,
      author: msg.author
    }))
    setMessages(uiMessages)
  })
  
  return () => unsubscribe()
}, [chatAPI])
```

## Implementation Details

### Polling Mechanism
In a real application, this would use WebSockets or Server-Sent Events. For the simulation:
- Polls every 500ms
- Tracks last known event count
- Only processes new events
- Efficient for simulation purposes

### Error Handling
- Gracefully handles decryption failures
- Logs warnings for debugging
- Continues processing other events

### Future Enhancements
- WebSocket support for real apps
- Batch message sending
- Message editing/deletion
- Read receipts
- Typing indicators