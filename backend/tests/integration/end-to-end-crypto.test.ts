import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'
import express from 'express'
import { createMessageRoutes } from '../../routes/messages'
import { KeyManager } from '../../crypto/KeyManager'
import { MessageGenerator } from '../../crypto/MessageGenerator'
import { EventCrypto } from '../../crypto/EventCrypto'
import { CachedBloomFilter } from '../../sync/CachedBloomFilter'
import { InMemoryStore } from '../../storage/InMemoryStore'
import * as fs from 'fs'
import * as path from 'path'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'

// Initialize sha512 for the ed25519 library
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

describe('End-to-End Crypto Integration', () => {
  const keysDir = path.join(__dirname, '..', '..', '..', 'keys')
  let aliceApp: express.Application
  let bobApp: express.Application
  let aliceKeyManager: KeyManager
  let bobKeyManager: KeyManager
  let aliceStore: InMemoryStore
  let bobStore: InMemoryStore
  let aliceGenerator: MessageGenerator
  let bobGenerator: MessageGenerator

  beforeAll(async () => {
    // Clean up keys directory if not using orchestrated environment variables
    if (!process.env.PRIVATE_KEY && fs.existsSync(keysDir)) {
      fs.rmSync(keysDir, { recursive: true, force: true })
      fs.mkdirSync(keysDir, { recursive: true })
    }

    // Initialize stores and generators
    aliceStore = new InMemoryStore('alice')
    bobStore = new InMemoryStore('bob')
    
    aliceGenerator = new MessageGenerator('alice')
    await aliceGenerator.initialize()
    
    bobGenerator = new MessageGenerator('bob')
    await bobGenerator.initialize()
    
    // Get key managers from generators
    aliceKeyManager = (aliceGenerator as any).keyManager
    bobKeyManager = (bobGenerator as any).keyManager
    
    // Set up keys manually only if not using environment variables
    if (!process.env.PRIVATE_KEY) {
      // Set up peer relationships first, then trust
      const alicePublicKey = aliceKeyManager.getKeyPair().publicKey
      const bobPublicKey = bobKeyManager.getKeyPair().publicKey
      
      aliceKeyManager.addPeerPublicKey('bob', bobPublicKey)
      bobKeyManager.addPeerPublicKey('alice', alicePublicKey)
      
      
      // Now trust the peers
      aliceKeyManager.trustPeer('bob')
      bobKeyManager.trustPeer('alice')
    }
    // In orchestrated mode, keys and trust are set up via environment variables

    // Create Express apps for Alice and Bob
    aliceApp = express()
    aliceApp.use(express.json())
    aliceApp.use((req, res, next) => {
      (req as any).deviceId = 'alice'
      next()
    })
    const aliceRoutes = createMessageRoutes(aliceStore, aliceGenerator)
    aliceApp.use('/api/messages', aliceRoutes)

    bobApp = express()
    bobApp.use(express.json())
    bobApp.use((req, res, next) => {
      (req as any).deviceId = 'bob'
      next()
    })
    const bobRoutes = createMessageRoutes(bobStore, bobGenerator)
    bobApp.use('/api/messages', bobRoutes)
  })

  afterAll(() => {
    // Clean up keys if not using environment variables
    if (!process.env.PRIVATE_KEY && fs.existsSync(keysDir)) {
      fs.rmSync(keysDir, { recursive: true, force: true })
    }
  })

  describe('Full encryption workflow', () => {
    it('should encrypt messages end-to-end between Alice and Bob', async () => {
      // Alice sends a message
      const aliceResponse = await request(aliceApp)
        .post('/api/messages')
        .send({ content: 'Hello Bob, this is encrypted!' })
        .expect(200)

      expect(aliceResponse.body.author).toBe('alice')
      expect(aliceResponse.body.content).toBe('Hello Bob, this is encrypted!')
      
      // Bob sends a message
      const bobResponse = await request(bobApp)
        .post('/api/messages')
        .send({ content: 'Hi Alice, got your encrypted message!' })
        .expect(200)

      expect(bobResponse.body.author).toBe('bob')
      expect(bobResponse.body.content).toBe('Hi Alice, got your encrypted message!')
    })

    it('should verify message signatures and encryption at low level', async () => {
      // Create message generators
      const aliceGenerator = new MessageGenerator('alice')
      await aliceGenerator.initialize()
      
      const bobGenerator = new MessageGenerator('bob')
      await bobGenerator.initialize()

      // Alice creates a message
      const content = 'Test message for crypto verification'
      const timestamp = Date.now()
      const aliceMessage = await aliceGenerator.createMessage(content, timestamp)

      // Verify the message is encrypted
      expect(aliceMessage.encrypted).toBeInstanceOf(Buffer)
      expect(aliceMessage.encrypted.length).toBeGreaterThan(50) // Should be encrypted data

      // Bob should be able to decrypt it (after loading Alice's public key)
      const bobGenerator2 = new MessageGenerator('bob')
      await bobGenerator2.initialize() // This loads Alice's public key
      
      const decrypted = await bobGenerator2.decryptMessage(aliceMessage)
      expect(decrypted).toBeDefined()
      expect(decrypted?.content).toBe(content)
      expect(decrypted?.author).toBe('alice')
      expect(decrypted?.timestamp).toBe(timestamp)
    })

    it('should handle bloom filters with signatures', async () => {
      // Alice creates a bloom filter with some events
      const aliceKeyPair = aliceKeyManager.getKeyPair()
      const aliceBF = new CachedBloomFilter('alice', aliceKeyPair.privateKey)
      
      // Add some event IDs
      aliceBF.add('event-1')
      aliceBF.add('event-2')
      aliceBF.add('event-3')
      
      // Sign the bloom filter
      const signed = await aliceBF.sign()
      expect(signed).toBeDefined()
      expect(signed?.deviceId).toBe('alice')
      
      // Bob verifies Alice's bloom filter
      const isValid = await CachedBloomFilter.verify(
        signed!, 
        aliceKeyPair.publicKey
      )
      expect(isValid).toBe(true)
      
      // Bob can use the verified bloom filter
      const bobBF = CachedBloomFilter.fromSigned(signed!)
      expect(bobBF.contains('event-1')).toBe(true)
      expect(bobBF.contains('event-2')).toBe(true)
      expect(bobBF.contains('event-3')).toBe(true)
      expect(bobBF.contains('event-4')).toBe(false)
    })

    it('should demonstrate full sync scenario with crypto', async () => {
      // Initialize crypto components
      const aliceKeyPair = aliceKeyManager.getKeyPair()
      const bobKeyPair = bobKeyManager.getKeyPair()
      
      const aliceCrypto = new EventCrypto(
        'alice',
        aliceKeyPair.privateKey,
        aliceKeyPair.publicKey,
        aliceKeyManager.getKnownPeers(),
        aliceKeyManager.getTrustedPeers(),
        'test-community-psk'
      )
      
      const bobCrypto = new EventCrypto(
        'bob',
        bobKeyPair.privateKey,
        bobKeyPair.publicKey,
        bobKeyManager.getKnownPeers(),
        bobKeyManager.getTrustedPeers(),
        'test-community-psk'
      )
      
      // Alice creates some events
      const events = []
      for (let i = 0; i < 5; i++) {
        const event = {
          type: 'message',
          content: `Message ${i}`,
          timestamp: Date.now() + i,
          author: 'alice'
        }
        const encrypted = await aliceCrypto.signAndEncryptEvent(event)
        events.push(encrypted)
      }
      
      // Alice creates bloom filter of her events
      const aliceBF = new CachedBloomFilter('alice', aliceKeyPair.privateKey)
      for (let i = 0; i < events.length; i++) {
        aliceBF.add(`alice-event-${i}`)
      }
      
      // Alice signs her bloom filter
      const signedBF = await aliceBF.sign()
      expect(signedBF).toBeDefined()
      
      // Bob receives and verifies the bloom filter
      const verified = await CachedBloomFilter.verify(signedBF!, aliceKeyPair.publicKey)
      expect(verified).toBe(true)
      
      // Bob checks which events he needs
      const bobBF = new CachedBloomFilter('bob')
      bobBF.add('alice-event-0') // Bob already has event 0
      bobBF.add('alice-event-2') // Bob already has event 2
      
      // Bob determines missing events
      const aliceEvents = CachedBloomFilter.fromSigned(signedBF!)
      const missingEvents = []
      for (let i = 0; i < 5; i++) {
        const eventId = `alice-event-${i}`
        if (aliceEvents.contains(eventId) && !bobBF.contains(eventId)) {
          missingEvents.push(i)
        }
      }
      
      expect(missingEvents).toEqual([1, 3, 4]) // Bob is missing events 1, 3, 4
      
      // Bob receives and decrypts missing events
      for (const index of missingEvents) {
        const decrypted = await bobCrypto.decryptAndVerifyEvent(events[index])
        expect(decrypted).toBeDefined()
        expect(decrypted?.payload.content).toBe(`Message ${index}`)
        expect(decrypted?.author).toBe('alice')
      }
    })
  })

  describe('Security properties', () => {
    it('should reject messages from untrusted devices', async () => {
      // Create a separate keys directory for this test
      const testKeysDir = path.join(__dirname, '..', '..', '..', 'test-keys-untrusted')
      if (fs.existsSync(testKeysDir)) {
        fs.rmSync(testKeysDir, { recursive: true, force: true })
      }
      fs.mkdirSync(testKeysDir, { recursive: true })
      
      // Create Alice first with only Bob as trusted
      const alicePrivateKey = new Uint8Array(32)
      alicePrivateKey.fill(1)
      const alicePublicKey = await ed.getPublicKey(alicePrivateKey)
      
      const bobPrivateKey = new Uint8Array(32)
      bobPrivateKey.fill(2)
      const bobPublicKey = await ed.getPublicKey(bobPrivateKey)
      
      // Create Eve's keys separately (not in trusted peers)
      const evePrivateKey = new Uint8Array(32)
      evePrivateKey.fill(3)
      const evePublicKey = await ed.getPublicKey(evePrivateKey)
      
      // Create crypto instances with explicit trust relationships
      const aliceCrypto = new EventCrypto(
        'alice',
        alicePrivateKey,
        alicePublicKey,
        new Map([['bob', bobPublicKey], ['eve', evePublicKey]]), // Known peers
        new Map([['bob', bobPublicKey]]), // Only Bob is trusted
        'test-community-psk'
      )
      
      const eveCrypto = new EventCrypto(
        'eve',
        evePrivateKey,
        evePublicKey,
        new Map(), // Empty known peers
        new Map(), // Empty trusted peers
        'test-community-psk'
      )
      
      // Eve creates a message
      const eveEvent = {
        type: 'message',
        content: 'Malicious message',
        timestamp: Date.now(),
        author: 'eve'
      }
      const encrypted = await eveCrypto.signAndEncryptEvent(eveEvent)
      
      // Alice tries to decrypt Eve's message (Eve is not in Alice's trusted peers)
      const decrypted = await aliceCrypto.decryptAndVerifyEvent(encrypted)
      expect(decrypted).toBeNull() // Should fail because Eve is not trusted
      
      // Clean up test directory
      fs.rmSync(testKeysDir, { recursive: true, force: true })
    })

    it('should detect tampered messages', async () => {
      const aliceGenerator = new MessageGenerator('alice')
      await aliceGenerator.initialize()
      
      // Alice creates a message
      const message = await aliceGenerator.createMessage('Original message', Date.now())
      
      // Tamper with the encrypted data
      message.encrypted[10] = message.encrypted[10] ^ 0xFF
      
      // Bob tries to decrypt the tampered message
      const bobGenerator = new MessageGenerator('bob')
      await bobGenerator.initialize()
      
      const decrypted = await bobGenerator.decryptMessage(message)
      expect(decrypted).toBeNull() // Should fail due to tampering
    })

    it('should ensure messages cannot be decrypted with wrong PSK', async () => {
      // Create Alice with custom PSK
      const aliceKeyPair = aliceKeyManager.getKeyPair()
      const aliceCrypto = new EventCrypto(
        'alice',
        aliceKeyPair.privateKey,
        aliceKeyPair.publicKey,
        new Map(),
        new Map(),
        'alice-special-psk'
      )
      
      // Alice creates an event
      const event = {
        type: 'message',
        content: 'Secret message',
        timestamp: Date.now(),
        author: 'alice'
      }
      const encrypted = await aliceCrypto.signAndEncryptEvent(event)
      
      // Bob tries to decrypt with different PSK
      const bobKeyPair = bobKeyManager.getKeyPair()
      const bobCrypto = new EventCrypto(
        'bob',
        bobKeyPair.privateKey,
        bobKeyPair.publicKey,
        new Map([['alice', aliceKeyPair.publicKey]]),
        new Map([['alice', aliceKeyPair.publicKey]]),
        'bob-different-psk'
      )
      
      const decrypted = await bobCrypto.decryptAndVerifyEvent(encrypted)
      expect(decrypted).toBeNull() // Should fail due to wrong PSK
    })
  })
})