import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createMessageRoutes } from '../../routes/messages'
import { InMemoryStore } from '../../storage/InMemoryStore'
import { MessageGenerator } from '../../crypto/MessageGenerator'
import * as fs from 'fs'
import * as path from 'path'

describe('Messages API', () => {
  let app: express.Application
  let store: InMemoryStore
  let messageGenerator: MessageGenerator
  const keysDir = path.join(__dirname, '..', '..', '..', 'keys')

  beforeAll(async () => {
    // Clean up keys directory
    if (fs.existsSync(keysDir)) {
      fs.rmSync(keysDir, { recursive: true, force: true })
    }

    // Initialize store and message generator
    store = new InMemoryStore('test-device')
    messageGenerator = new MessageGenerator('test-device')
    await messageGenerator.initialize()

    // Create Express app with routes
    app = express()
    app.use(express.json())
    
    // Add device ID middleware
    app.use((req, res, next) => {
      (req as any).deviceId = 'test-device'
      next()
    })
    
    // Create and add message routes
    const messageRoutes = createMessageRoutes(store, messageGenerator)
    app.use('/api/messages', messageRoutes)
  })

  afterAll(() => {
    // Clean up after all tests
    if (fs.existsSync(keysDir)) {
      fs.rmSync(keysDir, { recursive: true, force: true })
    }
  })

  describe('POST /api/messages', () => {
    it('should create a new message', async () => {
      const response = await request(app)
        .post('/api/messages')
        .send({ content: 'Hello, world!' })
        .expect(200)

      expect(response.body).toHaveProperty('id')
      expect(response.body.author).toBe('test-device')
      expect(response.body.content).toBe('Hello, world!')
      expect(response.body).toHaveProperty('timestamp')
      expect(response.body.attachments).toEqual([])
    })

    it('should create a message with attachments', async () => {
      const attachments = [{ type: 'image', url: 'test.jpg' }]
      
      const response = await request(app)
        .post('/api/messages')
        .send({ content: 'Message with attachment', attachments })
        .expect(200)

      expect(response.body.content).toBe('Message with attachment')
      expect(response.body.attachments).toEqual(attachments)
    })

    it('should return 400 if content is missing', async () => {
      const response = await request(app)
        .post('/api/messages')
        .send({})
        .expect(400)

      expect(response.body.error).toBe('Content is required')
    })

    it('should handle special characters in content', async () => {
      const specialContent = 'Hello! Special chars: @#$%^&*(){}[]<>?'
      
      const response = await request(app)
        .post('/api/messages')
        .send({ content: specialContent })
        .expect(200)

      expect(response.body.content).toBe(specialContent)
    })
  })

  describe('GET /api/messages', () => {
    beforeEach(async () => {
      // Create some test messages
      await request(app)
        .post('/api/messages')
        .send({ content: 'Message 1' })
      
      await request(app)
        .post('/api/messages')
        .send({ content: 'Message 2' })
      
      await request(app)
        .post('/api/messages')
        .send({ content: 'Message 3' })
    })

    it('should return all messages', async () => {
      const response = await request(app)
        .get('/api/messages')
        .expect(200)

      expect(response.body.messages).toBeInstanceOf(Array)
      expect(response.body.messages.length).toBeGreaterThanOrEqual(3)
      
      const contents = response.body.messages.map((m: any) => m.content)
      expect(contents).toContain('Message 1')
      expect(contents).toContain('Message 2')
      expect(contents).toContain('Message 3')
    })

    it('should filter messages by timestamp', async () => {
      const beforeTimestamp = Date.now()
      
      // Wait a bit and create a new message
      await new Promise(resolve => setTimeout(resolve, 10))
      
      await request(app)
        .post('/api/messages')
        .send({ content: 'New message' })

      const response = await request(app)
        .get(`/api/messages?since=${beforeTimestamp}`)
        .expect(200) // TODO: I'm not sure this is how we want the API to work. I think we want to fetch last N messages instead of since timestamp and use offsets the way the telegram API does.

      expect(response.body.messages).toBeInstanceOf(Array)
      expect(response.body.messages.length).toBeGreaterThanOrEqual(1)
      
      const newMessage = response.body.messages.find((m: any) => m.content === 'New message')
      expect(newMessage).toBeDefined()
    })
  })

  describe('GET /api/messages/:id', () => {
    it('should return a specific message', async () => {
      // Create a message
      const createResponse = await request(app)
        .post('/api/messages')
        .send({ content: 'Find me!' })
        .expect(200)

      const messageId = createResponse.body.id

      // Get the message by ID
      const getResponse = await request(app)
        .get(`/api/messages/${messageId}`)
        .expect(200)

      expect(getResponse.body.id).toBe(messageId)
      expect(getResponse.body.content).toBe('Find me!')
      expect(getResponse.body.author).toBe('test-device')
    })

    it('should return 404 for non-existent message', async () => {
      const response = await request(app)
        .get('/api/messages/nonexistent')
        .expect(404)

      expect(response.body.error).toBe('Message not found')
    })
  })

  describe('Multiple devices', () => {
    it('should isolate messages between devices', async () => {
      // Create separate stores and generators for each device
      const aliceStore = new InMemoryStore('alice')
      const aliceGenerator = new MessageGenerator('alice')
      await aliceGenerator.initialize()
      
      const bobStore = new InMemoryStore('bob')
      const bobGenerator = new MessageGenerator('bob')
      await bobGenerator.initialize()
      
      // Create app instances for different devices TODO: do we orchestrate the ports and keys of each device here? How realistic is this test? 
      const aliceApp = express()
      aliceApp.use(express.json())
      aliceApp.use((req, res, next) => {
        (req as any).deviceId = 'alice'
        next()
      })
      const aliceRoutes = createMessageRoutes(aliceStore, aliceGenerator)
      aliceApp.use('/api/messages', aliceRoutes)

      const bobApp = express()
      bobApp.use(express.json())
      bobApp.use((req, res, next) => {
        (req as any).deviceId = 'bob'
        next()
      })
      const bobRoutes = createMessageRoutes(bobStore, bobGenerator)
      bobApp.use('/api/messages', bobRoutes)

      // Alice sends a message
      await request(aliceApp)
        .post('/api/messages')
        .send({ content: 'Message from Alice' })
        .expect(200)

      // Bob sends a message
      await request(bobApp)
        .post('/api/messages')
        .send({ content: 'Message from Bob' })
        .expect(200)

      // Get Alice's messages
      const aliceMessages = await request(aliceApp)
        .get('/api/messages')
        .expect(200)

      // Get Bob's messages
      const bobMessages = await request(bobApp)
        .get('/api/messages')
        .expect(200)

      // Each should only see their own messages TODO: I think we only want to test this when one or both is offline. Once they are online we *want* them to sync.
      const aliceContents = aliceMessages.body.messages.map((m: any) => m.content)
      const bobContents = bobMessages.body.messages.map((m: any) => m.content)

      expect(aliceContents).toContain('Message from Alice')
      expect(aliceContents).not.toContain('Message from Bob')

      expect(bobContents).toContain('Message from Bob')
      expect(bobContents).not.toContain('Message from Alice')

      // TODO: Where will we test to make sure their messages do sync with each other via network service, once they are both online? 
    })
  })
})