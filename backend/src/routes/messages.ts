import { Router } from 'express'
import { MessageGenerator } from '../crypto/MessageGenerator'
import { InMemoryStore } from '../storage/InMemoryStore'

export function createMessageRoutes(store: InMemoryStore, messageGenerator: MessageGenerator) {
  const router = Router()

  // Send a message
  router.post('/', async (req, res) => {
    const deviceId = (req as any).deviceId
    const { content, attachments, noBroadcast } = req.body

    if (!content) {
      return res.status(400).json({ error: 'Content is required' })
    }

    // Create encrypted message event
    const timestamp = Date.now()
    const event = await messageGenerator.createMessage(content, timestamp, attachments)
    const eventId = messageGenerator.computeEventId(event.encrypted)

    // Store the event
    await store.storeEvent(event, eventId)

    // Broadcast through sync manager if available
    // Check for DISABLE_MESSAGE_BROADCAST env var or noBroadcast flag
    const disableBroadcast = process.env.DISABLE_MESSAGE_BROADCAST === 'true' || noBroadcast
    const syncManager = (req as any).syncManager
    if (syncManager && !disableBroadcast) {
      await syncManager.broadcastNewMessage(event, eventId)
      console.log(`[Messages] Broadcasting message ${eventId} through sync`)
    } else if (disableBroadcast) {
      console.log(`[Messages] Broadcast disabled for message ${eventId} - will sync via bloom filter only`)
    }

    // Return the created message
    const decrypted = await messageGenerator.decryptMessage(event)
    if (!decrypted) {
      return res.status(500).json({ error: 'Failed to decrypt message' })
    }
    
    res.json({
      id: eventId,
      author: decrypted.author,
      content: decrypted.content,
      timestamp: decrypted.timestamp,
      attachments: decrypted.attachments || []
    })
  })

  // Get messages
  router.get('/', async (req, res) => {
    const deviceId = (req as any).deviceId
    const since = req.query.since ? parseInt(req.query.since as string) : 0

    // Get all events since timestamp (messages and reactions)
    const events = await store.getAllEventsSince(since)

    // First pass: decrypt messages
    const messages = new Map<string, any>()
    const reactions = new Map<string, any[]>()
    
    for (const event of events) {
      const decrypted = await messageGenerator.decryptEvent(event)
      if (decrypted) {
        if (decrypted.type === 'message') {
          messages.set(event.event_id, {
            id: event.event_id,
            author: decrypted.author,
            content: decrypted.content,
            timestamp: decrypted.timestamp,
            attachments: decrypted.attachments || [],
            reactions: []
          })
        } else if (decrypted.type === 'reaction') {
          const messageReactions = reactions.get(decrypted.messageId) || []
          if (decrypted.remove) {
            // Remove reaction
            const idx = messageReactions.findIndex(
              r => r.emoji === decrypted.emoji && r.author === decrypted.author
            )
            if (idx >= 0) {
              messageReactions.splice(idx, 1)
            }
          } else {
            // Add reaction
            messageReactions.push({
              emoji: decrypted.emoji,
              author: decrypted.author,
              timestamp: decrypted.timestamp
            })
          }
          reactions.set(decrypted.messageId, messageReactions)
        }
      }
    }
    
    // Second pass: attach reactions to messages
    for (const [messageId, messageReactions] of reactions) {
      const message = messages.get(messageId)
      if (message) {
        message.reactions = messageReactions
      }
    }

    res.json({ messages: Array.from(messages.values()) })
  })

  // Get a specific message
  router.get('/:id', async (req, res) => {
    const deviceId = (req as any).deviceId
    const { id } = req.params

    const event = await store.getEvent(id)
    if (!event) {
      return res.status(404).json({ error: 'Message not found' })
    }

    const decrypted = await messageGenerator.decryptMessage(event)
    if (!decrypted) {
      return res.status(500).json({ error: 'Failed to decrypt message' })
    }
    
    res.json({
      id: event.event_id,
      author: decrypted.author,
      content: decrypted.content,
      timestamp: decrypted.timestamp,
      attachments: decrypted.attachments || []
    })
  })

  // Add reaction to a message
  router.post('/:id/reactions', async (req, res) => {
    const deviceId = (req as any).deviceId
    const { id: messageId } = req.params
    const { emoji } = req.body
    
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' })
    }
  
    // Check if message exists
    const messageEvent = await store.getEvent(messageId)
    if (!messageEvent) {
      return res.status(404).json({ error: 'Message not found' })
    }
    
    // Create reaction event
    const timestamp = Date.now()
    const reactionPayload = {
      type: 'reaction',
      messageId,
      emoji,
      author: deviceId,
      timestamp,
      remove: false
    }
    
    const event = await messageGenerator.createEvent(reactionPayload, timestamp)
    const eventId = messageGenerator.computeEventId(event.encrypted)
  
    // Store the event
    await store.storeEvent(event, eventId)
    
    // Broadcast through sync manager if available
    const syncManager = (req as any).syncManager
    if (syncManager) {
      await syncManager.broadcastNewMessage(event, eventId)
      console.log(`[Messages] Broadcasting reaction ${eventId} through sync`)
    }
    
    res.json({ success: true, eventId })
  })

  // Remove reaction from a message
  router.delete('/:id/reactions/:emoji', async (req, res) => {
    const deviceId = (req as any).deviceId
    const { id: messageId, emoji } = req.params
    
    // Check if message exists
    const messageEvent = await store.getEvent(messageId)
    if (!messageEvent) {
      return res.status(404).json({ error: 'Message not found' })
    }
    
    // Create reaction removal event
    const timestamp = Date.now()
    const reactionPayload = {
      type: 'reaction',
      messageId,
      emoji,
      author: deviceId,
      timestamp,
      remove: true
    }
    
    const event = await messageGenerator.createEvent(reactionPayload, timestamp)
    const eventId = messageGenerator.computeEventId(event.encrypted)
  
    // Store the event
    await store.storeEvent(event, eventId)
    
    // Broadcast through sync manager if available
    const syncManager = (req as any).syncManager
    if (syncManager) {
      await syncManager.broadcastNewMessage(event, eventId)
      console.log(`[Messages] Broadcasting reaction removal ${eventId} through sync`)
    }
    
    res.json({ success: true, eventId })
  })

  // Clear all messages
  router.delete('/clear', async (req, res) => {
    const deviceId = (req as any).deviceId
    
    // Clear the store
    await store.clear()
    
    console.log(`[Messages] Cleared all messages for ${deviceId}`)
    
    res.json({ success: true, message: `Cleared all messages for ${deviceId}` })
  })
  
  return router
}