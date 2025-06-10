import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createMessageRoutes } from '../../routes/messages'
import { InMemoryStore } from '../../storage/InMemoryStore'
import { MessageGenerator } from '../../crypto/MessageGenerator'
import { SyncManager } from '../../sync/SyncManager'
import { NetworkSimulator } from '../../network/NetworkSimulator'

describe('Message API Broadcasting', () => {
  let app: express.Application
  let store: InMemoryStore
  let messageGenerator: MessageGenerator
  let syncManager: SyncManager
  let networkSimulator: NetworkSimulator
  let broadcastCalls: any[] = []

  beforeAll(async () => {
    // Initialize components
    store = new InMemoryStore('alice')
    messageGenerator = new MessageGenerator('alice')
    await messageGenerator.initialize()
    networkSimulator = new NetworkSimulator()
    
    // Create sync manager
    syncManager = new SyncManager(
      { deviceId: 'alice', syncInterval: 5000 },
      store,
      networkSimulator,
      messageGenerator
    )
    
    // Track broadcast calls
    const originalBroadcast = syncManager.broadcastNewMessage.bind(syncManager)
    syncManager.broadcastNewMessage = async (event: any, eventId: string) => {
      broadcastCalls.push({ event, eventId })
      return originalBroadcast(event, eventId)
    }
    
    // Create Express app
    app = express()
    app.use(express.json())
    
    // Add middleware to inject dependencies
    app.use((req, res, next) => {
      (req as any).deviceId = 'alice'
      (req as any).syncManager = syncManager
      next()
    })
    
    // Add message routes
    const routes = createMessageRoutes(store, messageGenerator)
    app.use('/api/messages', routes)
  })

  it('should broadcast message when posted to API', async () => {
    const messageContent = 'Test message for broadcast'
    
    // Post message
    const response = await request(app)
      .post('/api/messages')
      .send({ content: messageContent })
      .expect(200)
    
    // Verify response
    expect(response.body).toMatchObject({
      id: expect.any(String),
      author: 'alice',
      content: messageContent,
      timestamp: expect.any(Number)
    })
    
    // Verify broadcast was called
    expect(broadcastCalls).toHaveLength(1)
    expect(broadcastCalls[0].eventId).toBe(response.body.id)
    expect(broadcastCalls[0].event.encrypted).toBeInstanceOf(Uint8Array)
  })

  it('should store message locally before broadcasting', async () => {
    const messageContent = 'Store then broadcast'
    
    // Clear previous calls
    broadcastCalls = []
    
    // Post message
    const response = await request(app)
      .post('/api/messages')
      .send({ content: messageContent })
      .expect(200)
    
    // Check store has the message
    const storedEvent = await store.getEvent(response.body.id)
    expect(storedEvent).toBeDefined()
    expect(storedEvent?.event_id).toBe(response.body.id)
    
    // Decrypt to verify content
    const decrypted = await messageGenerator.decryptMessage(storedEvent!)
    expect(decrypted?.content).toBe(messageContent)
  })

  it('should handle messages with attachments', async () => {
    const messageContent = 'Message with attachment'
    const attachments = [{
      id: 'file-123',
      name: 'test.jpg',
      mimeType: 'image/jpeg',
      size: 1024
    }]
    
    // Clear previous calls
    broadcastCalls = []
    
    // Post message with attachment
    const response = await request(app)
      .post('/api/messages')
      .send({ content: messageContent, attachments })
      .expect(200)
    
    // Verify response includes attachments
    expect(response.body.attachments).toHaveLength(1)
    expect(response.body.attachments[0]).toMatchObject({
      id: 'file-123',
      name: 'test.jpg',
      mimeType: 'image/jpeg',
      size: 1024
    })
    
    // Verify broadcast was called
    expect(broadcastCalls).toHaveLength(1)
  })

  it('should return 400 for missing content', async () => {
    await request(app)
      .post('/api/messages')
      .send({})
      .expect(400)
      .expect(res => {
        expect(res.body.error).toBe('Content is required')
      })
  })
})