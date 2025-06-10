import { describe, it, expect, beforeEach } from 'vitest'
import { EventCrypto } from '../../crypto/EventCrypto'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { randomBytes } from 'crypto'

// Initialize sha512 for the ed25519 library
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

describe('EventCrypto', () => {
  let deviceId: string
  let privateKey: Uint8Array
  let publicKey: Uint8Array
  let knownPeers: Map<string, Uint8Array>
  let trustedPeers: Map<string, Uint8Array>
  let communityPSK: string
  let eventCrypto: EventCrypto

  beforeEach(async () => {
    deviceId = 'test-device'
    privateKey = randomBytes(32)
    publicKey = await ed.getPublicKey(privateKey)
    knownPeers = new Map()
    trustedPeers = new Map()
    communityPSK = 'test-community-psk'
    
    eventCrypto = new EventCrypto(deviceId, privateKey, publicKey, knownPeers, trustedPeers, communityPSK)
  })

  describe('signAndEncryptEvent', () => {
    it('should sign and encrypt an event', async () => {
      const eventData = {
        type: 'message',
        content: 'Hello world',
        timestamp: Date.now(),
        author: deviceId
      }

      const encrypted = await eventCrypto.signAndEncryptEvent(eventData)

      expect(encrypted).toBeDefined()
      expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array)
      expect(encrypted.nonce).toBeInstanceOf(Uint8Array)
      expect(encrypted.nonce.length).toBe(12) // AES-GCM nonce is 12 bytes
    })

    it('should produce different ciphertext for same data', async () => {
      const eventData = {
        type: 'message',
        content: 'Hello world',
        timestamp: Date.now(),
        author: deviceId
      }

      const encrypted1 = await eventCrypto.signAndEncryptEvent(eventData)
      const encrypted2 = await eventCrypto.signAndEncryptEvent(eventData)

      // Nonces should be different
      expect(Buffer.from(encrypted1.nonce).toString('hex')).not.toBe(
        Buffer.from(encrypted2.nonce).toString('hex')
      )
      
      // Ciphertexts should be different (due to different nonces)
      expect(Buffer.from(encrypted1.ciphertext).toString('hex')).not.toBe(
        Buffer.from(encrypted2.ciphertext).toString('hex')
      )
    })
  })

  describe('decryptAndVerifyEvent', () => {
    it('should decrypt and verify a valid event', async () => {
      const eventData = {
        type: 'message',
        content: 'Hello world',
        timestamp: Date.now(),
        author: deviceId
      }

      // Add ourselves to known and trusted peers
      knownPeers.set(deviceId, publicKey)
      knownPeers.set(deviceId, publicKey)
      trustedPeers.set(deviceId, publicKey)

      const encrypted = await eventCrypto.signAndEncryptEvent(eventData)
      const decrypted = await eventCrypto.decryptAndVerifyEvent(encrypted)

      expect(decrypted).toBeDefined()
      expect(decrypted?.payload).toEqual(eventData)
      expect(decrypted?.signature).toBeInstanceOf(Uint8Array)
      expect(decrypted?.author).toBe(deviceId)
    })

    it('should reject event from untrusted peer', async () => {
      // Create a different device that's not trusted
      const untrustedDeviceId = 'untrusted-device'
      const untrustedPrivateKey = randomBytes(32)
      const untrustedPublicKey = await ed.getPublicKey(untrustedPrivateKey)
      
      const untrustedCrypto = new EventCrypto(
        untrustedDeviceId,
        untrustedPrivateKey,
        untrustedPublicKey,
        new Map(), // Empty known peers
        new Map(), // Empty trusted peers
        communityPSK
      )
      
      // Add untrusted device to our known peers (but not trusted)
      knownPeers.set(untrustedDeviceId, untrustedPublicKey)
      
      const eventData = {
        type: 'message',
        content: 'Hello world',
        timestamp: Date.now(),
        author: untrustedDeviceId
      }

      // Untrusted device creates an event
      const encrypted = await untrustedCrypto.signAndEncryptEvent(eventData)
      
      // Our device tries to verify it (untrusted device is not in our trusted peers)
      const decrypted = await eventCrypto.decryptAndVerifyEvent(encrypted)

      expect(decrypted).toBeNull()
    })

    it('should reject event with tampered ciphertext', async () => {
      const eventData = {
        type: 'message',
        content: 'Hello world',
        timestamp: Date.now(),
        author: deviceId
      }

      knownPeers.set(deviceId, publicKey)
      trustedPeers.set(deviceId, publicKey)

      const encrypted = await eventCrypto.signAndEncryptEvent(eventData)
      
      // Tamper with the ciphertext
      encrypted.ciphertext[0] = encrypted.ciphertext[0] ^ 0xFF

      const decrypted = await eventCrypto.decryptAndVerifyEvent(encrypted)

      expect(decrypted).toBeNull()
    })

    it('should reject event with wrong PSK', async () => {
      const eventData = {
        type: 'message',
        content: 'Hello world',
        timestamp: Date.now(),
        author: deviceId
      }

      knownPeers.set(deviceId, publicKey)
      trustedPeers.set(deviceId, publicKey)

      const encrypted = await eventCrypto.signAndEncryptEvent(eventData)
      
      // Create new crypto instance with different PSK
      const wrongCrypto = new EventCrypto(
        deviceId,
        privateKey,
        publicKey,
        knownPeers,
        trustedPeers,
        'wrong-psk'
      )

      const decrypted = await wrongCrypto.decryptAndVerifyEvent(encrypted)

      expect(decrypted).toBeNull()
    })
  })

  describe('buffer conversion', () => {
    it('should convert encrypted event to buffer and back', async () => {
      const eventData = {
        type: 'message',
        content: 'Hello world',
        timestamp: Date.now(),
        author: deviceId
      }

      const encrypted = await eventCrypto.signAndEncryptEvent(eventData)
      const buffer = EventCrypto.encryptedEventToBuffer(encrypted)
      const restored = EventCrypto.bufferToEncryptedEvent(buffer)

      expect(restored.ciphertext).toEqual(encrypted.ciphertext)
      expect(restored.nonce).toEqual(encrypted.nonce)
    })
  })
})