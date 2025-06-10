import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { MessageGenerator } from '../../src/crypto/MessageGenerator'
import { KeyManager } from '../../src/crypto/KeyManager'
import * as fs from 'fs'
import * as path from 'path'

describe('MessageGenerator', () => {
  const deviceId = 'test-device'
  const keysDir = path.join(__dirname, '..', '..', '..', 'keys')

  beforeEach(() => {
    // Clean up keys directory if not using environment variables
    if (!process.env.PRIVATE_KEY) {
      if (fs.existsSync(keysDir)) {
        fs.rmSync(keysDir, { recursive: true, force: true })
      }
      // Create keys directory
      fs.mkdirSync(keysDir, { recursive: true })
    }
  })

  afterEach(() => {
    // Clean up after each test if not using environment keys
    if (!process.env.PRIVATE_KEY && fs.existsSync(keysDir)) {
      fs.rmSync(keysDir, { recursive: true, force: true })
    }
  })

  describe('createMessage', () => {
    it('should create an encrypted message', async () => {
      const generator = new MessageGenerator(deviceId)
      await generator.initialize()

      const content = 'Hello, world!'
      const timestamp = Date.now()
      const message = await generator.createMessage(content, timestamp)

      expect(message.device_id).toBe(deviceId)
      expect(message.created_at).toBe(timestamp)
      expect(message.received_at).toBe(timestamp)
      expect(message.encrypted).toBeInstanceOf(Buffer)
      expect(message.encrypted.length).toBeGreaterThan(0)
    })

    it('should create messages with attachments', async () => {
      const generator = new MessageGenerator(deviceId)
      await generator.initialize()

      const content = 'Message with attachment'
      const timestamp = Date.now()
      const attachments = [{ type: 'image', url: 'test.jpg' }]
      
      const message = await generator.createMessage(content, timestamp, attachments)
      
      // Decrypt to verify attachments were included
      const decrypted = await generator.decryptMessage(message)
      expect(decrypted).toBeDefined()
      expect(decrypted?.attachments).toEqual(attachments)
    })

    it('should throw error if not initialized', async () => {
      const generator = new MessageGenerator(deviceId)
      
      await expect(async () => {
        await generator.createMessage('test', Date.now())
      }).rejects.toThrow('MessageGenerator not initialized')
    })
  })

  describe('decryptMessage', () => {
    it('should decrypt own messages', async () => {
      const generator = new MessageGenerator(deviceId)
      await generator.initialize()

      const content = 'Test message'
      const timestamp = Date.now()
      const message = await generator.createMessage(content, timestamp)

      const decrypted = await generator.decryptMessage(message)

      expect(decrypted).toBeDefined()
      expect(decrypted?.type).toBe('message')
      expect(decrypted?.content).toBe(content)
      expect(decrypted?.timestamp).toBe(timestamp)
      expect(decrypted?.author).toBe(deviceId)
    })

    it('should decrypt messages from trusted peers', async () => {
      // Create two generators
      const aliceGenerator = new MessageGenerator('alice')
      await aliceGenerator.initialize()

      const bobGenerator = new MessageGenerator('bob')
      await bobGenerator.initialize()
      
      // Set up trust relationships
      const aliceKM = new KeyManager('alice')
      await aliceKM.initialize()
      aliceKM.trustPeer('bob')
      
      const bobKM = new KeyManager('bob')
      await bobKM.initialize()
      bobKM.trustPeer('alice')

      // Alice creates a message
      const content = 'Hello from Alice'
      const timestamp = Date.now()
      const message = await aliceGenerator.createMessage(content, timestamp)

      // Bob should be able to decrypt it (after reinitializing to load trust)
      const bobGenerator2 = new MessageGenerator('bob')
      await bobGenerator2.initialize()
      
      const decrypted = await bobGenerator2.decryptMessage(message)

      expect(decrypted).toBeDefined()
      expect(decrypted?.content).toBe(content)
      expect(decrypted?.author).toBe('alice')
    })

    it('should return null for invalid messages', async () => {
      const generator = new MessageGenerator(deviceId)
      await generator.initialize()

      const invalidMessage = {
        encrypted: Buffer.from('invalid data')
      }

      const decrypted = await generator.decryptMessage(invalidMessage)
      expect(decrypted).toBeNull()
    })
  })

  describe('computeEventId', () => {
    it('should generate consistent event IDs', async () => {
      const generator = new MessageGenerator(deviceId)
      await generator.initialize()

      const encrypted = Buffer.from('test data')
      const id1 = generator.computeEventId(encrypted)
      const id2 = generator.computeEventId(encrypted)

      expect(id1).toBe(id2)
      expect(id1).toMatch(/^[a-f0-9]{16}$/) // 8 bytes as hex = 16 chars
    })

    it('should generate different IDs for different data', async () => {
      const generator = new MessageGenerator(deviceId)
      await generator.initialize()

      const id1 = generator.computeEventId(Buffer.from('data1'))
      const id2 = generator.computeEventId(Buffer.from('data2'))

      expect(id1).not.toBe(id2)
    })
  })
})