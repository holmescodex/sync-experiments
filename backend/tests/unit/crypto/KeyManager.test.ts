import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { KeyManager } from '../../crypto/KeyManager'
import * as fs from 'fs'
import * as path from 'path'

describe('KeyManager', () => {
  const testDeviceId = 'test-device'
  const keysDir = path.join(__dirname, '..', '..', '..', 'keys')

  beforeEach(() => {
    // In orchestrated mode, we test with environment variables when available
    // Otherwise, clean up for isolated testing
    if (!process.env.PRIVATE_KEY && fs.existsSync(keysDir)) {
      fs.rmSync(keysDir, { recursive: true, force: true })
    }
  })

  afterEach(() => {
    // Clean up after tests if we're not using environment keys
    if (!process.env.PRIVATE_KEY && fs.existsSync(keysDir)) {
      fs.rmSync(keysDir, { recursive: true, force: true })
    }
  })

  describe('initialize', () => {
    it('should generate new keys on first run', async () => {
      const keyManager = new KeyManager(testDeviceId)
      await keyManager.initialize()

      const keyPair = keyManager.getKeyPair()
      expect(keyPair.deviceId).toBe(testDeviceId)
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.privateKey.length).toBe(32)
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.publicKey.length).toBe(32)

      // Check that keys were saved to disk
      const privateKeyPath = path.join(keysDir, `${testDeviceId}.key`)
      const publicKeyPath = path.join(keysDir, `${testDeviceId}.pub`)
      expect(fs.existsSync(privateKeyPath)).toBe(true)
      expect(fs.existsSync(publicKeyPath)).toBe(true)
    })

    it('should load existing keys on subsequent runs', async () => {
      const keyManager1 = new KeyManager(testDeviceId)
      await keyManager1.initialize()
      const keyPair1 = keyManager1.getKeyPair()

      // Create new instance and initialize
      const keyManager2 = new KeyManager(testDeviceId)
      await keyManager2.initialize()
      const keyPair2 = keyManager2.getKeyPair()

      // Keys should be the same
      expect(keyPair2.privateKey).toEqual(keyPair1.privateKey)
      expect(keyPair2.publicKey).toEqual(keyPair1.publicKey)
    })
  })

  describe('trusted peers', () => {
    it('should load trusted peers from disk', async () => {
      // Create Alice's keys
      const aliceManager = new KeyManager('alice')
      await aliceManager.initialize()
      const alicePublicKey = aliceManager.getKeyPair().publicKey

      // Create Bob's keys
      const bobManager = new KeyManager('bob')
      await bobManager.initialize()
      const bobPublicKey = bobManager.getKeyPair().publicKey

      // Create Charlie's keys
      const charlieManager = new KeyManager('charlie')
      await charlieManager.initialize()
      
      // Charlie should know about Alice and Bob
      const knownPeers = charlieManager.getKnownPeers()
      expect(knownPeers.size).toBe(2)
      expect(knownPeers.get('alice')).toEqual(alicePublicKey)
      expect(knownPeers.get('bob')).toEqual(bobPublicKey)
      
      // But Charlie shouldn't trust anyone by default
      const trustedPeers = charlieManager.getTrustedPeers()
      expect(trustedPeers.size).toBe(0)
      
      // Now let's have Charlie trust Alice
      charlieManager.trustPeer('alice')
      
      // Check trust again
      const trustedPeersAfter = charlieManager.getTrustedPeers()
      expect(trustedPeersAfter.size).toBe(1)
      expect(trustedPeersAfter.get('alice')).toEqual(alicePublicKey)
    })

    it('should not include self in trusted peers', async () => {
      const keyManager = new KeyManager(testDeviceId)
      await keyManager.initialize()

      const trustedPeers = keyManager.getTrustedPeers()
      expect(trustedPeers.has(testDeviceId)).toBe(false)
    })
  })

  describe('exportPublicKeyBase64', () => {
    it('should export public key as base64', async () => {
      const keyManager = new KeyManager(testDeviceId)
      await keyManager.initialize()

      const base64Key = keyManager.exportPublicKeyBase64()
      expect(base64Key).toMatch(/^[A-Za-z0-9+/]+={0,2}$/) // Valid base64

      // Should be decodable back to original key
      const decoded = Buffer.from(base64Key, 'base64')
      expect(new Uint8Array(decoded)).toEqual(keyManager.getKeyPair().publicKey)
    })
  })

  describe('error handling', () => {
    it('should throw error if not initialized', () => {
      const keyManager = new KeyManager(testDeviceId)
      
      expect(() => keyManager.getKeyPair()).toThrow('KeyManager not initialized')
      expect(() => keyManager.exportPublicKeyBase64()).toThrow('KeyManager not initialized')
    })
  })
})