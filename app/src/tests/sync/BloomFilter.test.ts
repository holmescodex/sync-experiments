import { describe, test, expect, beforeEach } from 'vitest'
import { BloomFilter, CumulativeBloomFilter, PeerKnowledge } from '../../sync/BloomFilter'

describe('BloomFilter', () => {
  test('creates UDP-safe filter with fixed 500-byte target', () => {
    const filter = BloomFilter.createUDPOptimal()
    expect(filter.sizeInBytes()).toBeLessThan(500)
    expect(filter.sizeInBytes()).toBeGreaterThan(100) // Reasonable minimum size
  })

  test('adds and tests event IDs correctly', () => {
    const filter = new BloomFilter(1000, 0.01)
    
    filter.add('event-123')
    filter.add('event-456')
    
    expect(filter.test('event-123')).toBe(true)
    expect(filter.test('event-456')).toBe(true)
    expect(filter.test('event-789')).toBe(false) // With high probability
  })

  test('serializes and deserializes correctly', () => {
    const filter = new BloomFilter(1000, 0.01)
    filter.add('event-1')
    filter.add('event-2')
    
    const serialized = filter.serialize()
    expect(serialized).toBeInstanceOf(Uint8Array)
    expect(serialized.length).toBeGreaterThan(6) // Has header
    
    const deserialized = BloomFilter.deserialize(serialized)
    expect(deserialized.test('event-1')).toBe(true)
    expect(deserialized.test('event-2')).toBe(true)
    expect(deserialized.test('event-3')).toBe(false)
  })

  test('merges filters with OR operation', () => {
    const filter1 = new BloomFilter(1000, 0.01)
    const filter2 = new BloomFilter(1000, 0.01)
    
    filter1.add('event-1')
    filter1.add('event-2')
    
    filter2.add('event-2')
    filter2.add('event-3')
    
    const merged = BloomFilter.merge(filter1, filter2)
    expect(merged.test('event-1')).toBe(true)
    expect(merged.test('event-2')).toBe(true)
    expect(merged.test('event-3')).toBe(true)
  })

  test('handles degraded accuracy for large datasets gracefully', () => {
    const filter = new BloomFilter(1000, 0.03) // UDP-optimal parameters
    
    // Add way more events than optimal (5K events)
    for (let i = 0; i < 5000; i++) {
      filter.add(`event-${i}`)
    }
    
    // Should still work, but with higher false positive rate
    let falsePositives = 0
    for (let i = 5000; i < 5100; i++) { // Test 100 unknown events
      if (filter.test(`unknown-${i}`)) {
        falsePositives++
      }
    }
    
    const fpRate = falsePositives / 100
    expect(fpRate).toBeLessThan(0.95) // Should be <95% even when overloaded
    expect(fpRate).toBeGreaterThan(0.10) // But higher than optimal 3%
  })
})

describe('CumulativeBloomFilter', () => {
  test('maintains ALL events ever seen', () => {
    const bloom = new CumulativeBloomFilter()
    
    // Add reasonable number of events for UDP-sized filter
    for (let i = 0; i < 2000; i++) {
      bloom.add(`event-${i}`)
    }
    
    // All should still be present (may have false positives, but no false negatives)
    for (let i = 0; i < 2000; i++) {
      expect(bloom.test(`event-${i}`)).toBe(true)
    }
  })

  test('provides transmission filter under 500 bytes', () => {
    const bloom = new CumulativeBloomFilter()
    
    // Add events within optimal range
    for (let i = 0; i < 800; i++) {
      bloom.add(`event-${i}`)
    }
    
    const transmissionFilter = bloom.getFilterForTransmission()
    expect(transmissionFilter.sizeInBytes()).toBeLessThan(500)
  })

  test('tracks event count accurately', () => {
    const bloom = new CumulativeBloomFilter()
    
    expect(bloom.getEventCount()).toBe(0)
    
    bloom.add('event-1')
    bloom.add('event-2')
    bloom.add('event-3')
    
    expect(bloom.getEventCount()).toBe(3)
  })

  test('estimates false positive rate degradation', () => {
    const bloom = new CumulativeBloomFilter()
    
    // Optimal range (updated for new parameters)
    for (let i = 0; i < 800; i++) {
      bloom.add(`event-${i}`)
    }
    expect(bloom.getEstimatedFPR()).toBe(0.01)
    
    // Acceptable degradation
    for (let i = 800; i < 15000; i++) {
      bloom.add(`event-${i}`)
    }
    expect(bloom.getEstimatedFPR()).toBe(0.05)
    
    // High but manageable
    for (let i = 15000; i < 60000; i++) {
      bloom.add(`event-${i}`)
    }
    expect(bloom.getEstimatedFPR()).toBe(0.20)
  })
})

describe('PeerKnowledge', () => {
  let knowledge: PeerKnowledge

  beforeEach(() => {
    knowledge = new PeerKnowledge()
  })

  test('starts with no peer knowledge', () => {
    expect(knowledge.getKnownPeers()).toHaveLength(0)
    expect(knowledge.shouldSendEvent('alice', 'event-1')).toBe(true)
  })

  test('updates peer knowledge from Bloom filters', () => {
    const filter = new BloomFilter(1000, 0.01)
    filter.add('event-1')
    filter.add('event-2')
    
    knowledge.updatePeer('alice', filter)
    
    expect(knowledge.getKnownPeers()).toContain('alice')
  })

  test('composes peer knowledge over multiple rounds', () => {
    // Round 1: Peer sends partial filter
    const round1 = new BloomFilter(1000, 0.03)
    round1.add('event-1')
    round1.add('event-2')
    knowledge.updatePeer('alice', round1)
    
    expect(knowledge.shouldSendEvent('alice', 'event-1')).toBe(false)
    expect(knowledge.shouldSendEvent('alice', 'event-3')).toBe(true)
    
    // Round 2: Peer sends updated filter with more events
    const round2 = new BloomFilter(1000, 0.03)
    round2.add('event-1') // Still has old events
    round2.add('event-2') 
    round2.add('event-3') // Plus new events
    round2.add('event-4')
    knowledge.updatePeer('alice', round2)
    
    // Knowledge should improve (though simplified implementation for Phase 2)
    expect(knowledge.shouldSendEvent('alice', 'event-1')).toBe(false)
    expect(knowledge.shouldSendEvent('alice', 'event-2')).toBe(false)
  })

  test('handles multiple peers independently', () => {
    const aliceFilter = new BloomFilter(1000, 0.01)
    aliceFilter.add('event-1')
    aliceFilter.add('event-2')
    
    const bobFilter = new BloomFilter(1000, 0.01)
    bobFilter.add('event-2')
    bobFilter.add('event-3')
    
    knowledge.updatePeer('alice', aliceFilter)
    knowledge.updatePeer('bob', bobFilter)
    
    expect(knowledge.getKnownPeers()).toHaveLength(2)
    expect(knowledge.getKnownPeers()).toContain('alice')
    expect(knowledge.getKnownPeers()).toContain('bob')
  })
})