import { describe, it, expect, beforeEach } from 'vitest'
import { CachedBloomFilter } from '../../sync/CachedBloomFilter'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { randomBytes } from 'crypto'

// Initialize sha512 for the ed25519 library
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

describe('CachedBloomFilter', () => {
  let deviceId: string
  let privateKey: Uint8Array
  let publicKey: Uint8Array

  beforeEach(async () => {
    deviceId = 'test-device'
    privateKey = randomBytes(32)
    publicKey = await ed.getPublicKey(privateKey)
  })

  describe('basic operations', () => {
    it('should add and check event IDs', () => {
      const bf = new CachedBloomFilter(deviceId)
      
      const eventId1 = 'event-1'
      const eventId2 = 'event-2'
      const eventId3 = 'event-3'
      
      // Initially should not contain anything
      expect(bf.contains(eventId1)).toBe(false)
      expect(bf.contains(eventId2)).toBe(false)
      
      // Add event IDs
      bf.add(eventId1)
      bf.add(eventId2)
      
      // Should now contain added IDs
      expect(bf.contains(eventId1)).toBe(true)
      expect(bf.contains(eventId2)).toBe(true)
      
      // Should not contain unadded ID
      expect(bf.contains(eventId3)).toBe(false)
    })

    it('should track event count', () => {
      const bf = new CachedBloomFilter(deviceId)
      
      const data1 = bf.getData()
      expect(data1.eventCount).toBe(0)
      
      bf.add('event-1')
      bf.add('event-2')
      bf.add('event-3')
      
      const data2 = bf.getData()
      expect(data2.eventCount).toBe(3)
    })

    it('should update timestamp on add', async () => {
      const bf = new CachedBloomFilter(deviceId)
      
      const initialTime = bf.getData().timestamp
      
      // Wait a bit and add an event
      await new Promise(resolve => setTimeout(resolve, 10))
      bf.add('event-1')
      
      const newTime = bf.getData().timestamp
      expect(newTime).toBeGreaterThan(initialTime)
    })
  })

  describe('signing and verification', () => {
    it('should sign bloom filter when private key available', async () => {
      const bf = new CachedBloomFilter(deviceId, privateKey)
      
      bf.add('event-1')
      bf.add('event-2')
      
      const signed = await bf.sign()
      
      expect(signed).toBeDefined()
      expect(signed?.deviceId).toBe(deviceId)
      expect(signed?.signature).toBeInstanceOf(Uint8Array)
      expect(signed?.data.eventCount).toBe(2)
    })

    it('should return null when signing without private key', async () => {
      const bf = new CachedBloomFilter(deviceId) // No private key
      
      bf.add('event-1')
      
      const signed = await bf.sign()
      expect(signed).toBeNull()
    })

    it('should verify valid signature', async () => {
      const bf = new CachedBloomFilter(deviceId, privateKey)
      
      bf.add('event-1')
      bf.add('event-2')
      
      const signed = await bf.sign()
      expect(signed).toBeDefined()
      
      const isValid = await CachedBloomFilter.verify(signed!, publicKey)
      expect(isValid).toBe(true)
    })

    it('should reject invalid signature', async () => {
      const bf = new CachedBloomFilter(deviceId, privateKey)
      
      bf.add('event-1')
      
      const signed = await bf.sign()
      expect(signed).toBeDefined()
      
      // Tamper with the signature
      signed!.signature[0] = signed!.signature[0] ^ 0xFF
      
      const isValid = await CachedBloomFilter.verify(signed!, publicKey)
      expect(isValid).toBe(false)
    })

    it('should reject signature with wrong public key', async () => {
      const bf = new CachedBloomFilter(deviceId, privateKey)
      
      bf.add('event-1')
      
      const signed = await bf.sign()
      expect(signed).toBeDefined()
      
      // Use different public key
      const wrongPrivateKey = randomBytes(32)
      const wrongPublicKey = await ed.getPublicKey(wrongPrivateKey)
      
      const isValid = await CachedBloomFilter.verify(signed!, wrongPublicKey)
      expect(isValid).toBe(false)
    })
  })

  describe('fromSigned', () => {
    it('should recreate bloom filter from signed data', async () => {
      const bf = new CachedBloomFilter(deviceId, privateKey)
      
      bf.add('event-1')
      bf.add('event-2')
      bf.add('event-3')
      
      const signed = await bf.sign()
      expect(signed).toBeDefined()
      
      // Create new bloom filter from signed data
      const bf2 = CachedBloomFilter.fromSigned(signed!)
      
      // Should contain same events
      expect(bf2.contains('event-1')).toBe(true)
      expect(bf2.contains('event-2')).toBe(true)
      expect(bf2.contains('event-3')).toBe(true)
      expect(bf2.contains('event-4')).toBe(false)
      
      // Should have same metadata
      const data2 = bf2.getData()
      expect(data2.eventCount).toBe(3)
      expect(data2.timestamp).toBe(signed!.data.timestamp)
    })
  })

  describe('merge', () => {
    it('should merge two bloom filters', () => {
      const bf1 = new CachedBloomFilter('device1')
      const bf2 = new CachedBloomFilter('device2')
      
      // Add different events to each
      bf1.add('event-1')
      bf1.add('event-2')
      
      bf2.add('event-3')
      bf2.add('event-4')
      
      // Merge bf2 into bf1
      bf1.merge(bf2)
      
      // bf1 should now contain all events
      expect(bf1.contains('event-1')).toBe(true)
      expect(bf1.contains('event-2')).toBe(true)
      expect(bf1.contains('event-3')).toBe(true)
      expect(bf1.contains('event-4')).toBe(true)
      
      // Event count should be sum
      expect(bf1.getData().eventCount).toBe(4)
    })

    it('should handle overlapping events in merge', () => {
      const bf1 = new CachedBloomFilter('device1')
      const bf2 = new CachedBloomFilter('device2')
      
      // Add some overlapping events
      bf1.add('event-1')
      bf1.add('event-2')
      
      bf2.add('event-2') // Overlap
      bf2.add('event-3')
      
      // Merge bf2 into bf1
      bf1.merge(bf2)
      
      // Should contain all unique events
      expect(bf1.contains('event-1')).toBe(true)
      expect(bf1.contains('event-2')).toBe(true)
      expect(bf1.contains('event-3')).toBe(true)
      
      // Event count is sum (not deduplicated)
      expect(bf1.getData().eventCount).toBe(4)
    })
  })

  describe('false positive rate', () => {
    it('should estimate false positive rate', () => {
      const bf = new CachedBloomFilter(deviceId)
      
      // Empty filter should have 0% false positive rate
      expect(bf.estimateFalsePositiveRate()).toBe(0)
      
      // Add some events
      for (let i = 0; i < 100; i++) {
        bf.add(`event-${i}`)
      }
      
      const fpr = bf.estimateFalsePositiveRate()
      expect(fpr).toBeGreaterThan(0)
      expect(fpr).toBeLessThan(0.01) // Should be less than 1% for 100 items
    })

    it('should increase false positive rate with more items', () => {
      const bf = new CachedBloomFilter(deviceId)
      
      // Add 100 events
      for (let i = 0; i < 100; i++) {
        bf.add(`event-${i}`)
      }
      const fpr1 = bf.estimateFalsePositiveRate()
      
      // Add 900 more events
      for (let i = 100; i < 1000; i++) {
        bf.add(`event-${i}`)
      }
      const fpr2 = bf.estimateFalsePositiveRate()
      
      // False positive rate should increase
      expect(fpr2).toBeGreaterThan(fpr1)
    })
  })

  describe('clear', () => {
    it('should clear the filter', () => {
      const bf = new CachedBloomFilter(deviceId)
      
      // Add some events
      bf.add('event-1')
      bf.add('event-2')
      bf.add('event-3')
      
      expect(bf.contains('event-1')).toBe(true)
      expect(bf.getData().eventCount).toBe(3)
      
      // Clear the filter
      bf.clear()
      
      // Should not contain any events
      expect(bf.contains('event-1')).toBe(false)
      expect(bf.contains('event-2')).toBe(false)
      expect(bf.contains('event-3')).toBe(false)
      expect(bf.getData().eventCount).toBe(0)
    })
  })
})