import { describe, test, expect, beforeEach } from 'vitest'
import { EventScanQueue } from '../../sync/EventScanQueue'
import { BloomFilter } from '../../sync/BloomFilter'
import type { Event } from '../../storage/device-db'

describe('EventScanQueue', () => {
  let scanQueue: EventScanQueue
  let mockEvents: Event[]

  beforeEach(() => {
    scanQueue = new EventScanQueue()
    
    // Create mock events with different timestamps
    const now = Date.now()
    mockEvents = [
      { event_id: 'event-1', device_id: 'alice', created_at: now - 30000, received_at: now - 30000, encrypted: new Uint8Array([1, 2, 3]) }, // 30s ago (recent)
      { event_id: 'event-2', device_id: 'bob', created_at: now - 45000, received_at: now - 45000, encrypted: new Uint8Array([4, 5, 6]) }, // 45s ago (recent)
      { event_id: 'event-3', device_id: 'alice', created_at: now - 120000, received_at: now - 120000, encrypted: new Uint8Array([7, 8, 9]) }, // 2 min ago (older)
      { event_id: 'event-4', device_id: 'bob', created_at: now - 300000, received_at: now - 300000, encrypted: new Uint8Array([10, 11, 12]) }, // 5 min ago (older)
      { event_id: 'event-5', device_id: 'alice', created_at: now - 600000, received_at: now - 600000, encrypted: new Uint8Array([13, 14, 15]) }, // 10 min ago (older)
    ]
  })

  test('categorizes events into recent vs older correctly', () => {
    scanQueue.updateFromDatabase(mockEvents)
    const stats = scanQueue.getStats()
    
    expect(stats.totalEvents).toBe(5)
    expect(stats.recentEvents).toBe(2) // Events from last minute
    expect(stats.olderEventsCursor).toBe(0)
  })

  test('prioritizes recent events first', async () => {
    scanQueue.updateFromDatabase(mockEvents)
    
    // Empty peer filter (peer has no events)
    const emptyFilter = new BloomFilter(1000, 0.01)
    
    const eventsToSend = await scanQueue.getEventsToSend('peer-1', emptyFilter, {
      recentEventsBatch: 10,
      olderEventsBatch: 2,
      maxEventsPerRound: 3
    })
    
    // Should get 2 recent events + 1 older event (limited by maxEventsPerRound)
    expect(eventsToSend).toHaveLength(3)
    
    // First two should be recent events (newest first)
    expect(eventsToSend[0].event_id).toBe('event-1') // Most recent
    expect(eventsToSend[1].event_id).toBe('event-2') // Second most recent
    
    // Third should be from older events
    expect(['event-3', 'event-4', 'event-5']).toContain(eventsToSend[2].event_id)
  })

  test('implements round-robin scanning for older events', async () => {
    scanQueue.updateFromDatabase(mockEvents)
    
    const emptyFilter = new BloomFilter(1000, 0.01)
    
    // Debug: Check how many older events we have
    const stats = scanQueue.getStats()
    const olderEventCount = stats.totalEvents - stats.recentEvents
    expect(olderEventCount).toBe(3) // Should be 3 older events (3, 4, 5)
    
    // First scan - get first batch of older events
    const firstScan = await scanQueue.getEventsToSend('peer-1', emptyFilter, {
      recentEventsBatch: 0, // Skip recent events for this test
      olderEventsBatch: 2, // Get 2 older events
      maxEventsPerRound: 5
    })
    
    expect(firstScan).toHaveLength(2) // Gets first 2 older events
    
    // Second scan - cursor should have advanced, should get remaining 1 event
    const secondScan = await scanQueue.getEventsToSend('peer-1', emptyFilter, {
      recentEventsBatch: 0,
      olderEventsBatch: 2, // Ask for 2 more
      maxEventsPerRound: 5
    })
    
    // Cursor is now at position 2, asking for 2 events wraps around and gets 1 + wrap to 1 = 2 total
    expect(secondScan).toHaveLength(2) 
    
    // Third scan - should wrap around to beginning  
    const thirdScan = await scanQueue.getEventsToSend('peer-1', emptyFilter, {
      recentEventsBatch: 0,
      olderEventsBatch: 2,
      maxEventsPerRound: 5
    })
    
    expect(thirdScan).toHaveLength(2) // Wrapped around to beginning, gets 2 again
  })

  test('respects peer bloom filter to avoid sending known events', async () => {
    scanQueue.updateFromDatabase(mockEvents)
    
    // Peer already has event-1 and event-3
    const peerFilter = new BloomFilter(1000, 0.01)
    peerFilter.add('event-1')
    peerFilter.add('event-3')
    
    const eventsToSend = await scanQueue.getEventsToSend('peer-1', peerFilter, {
      recentEventsBatch: 10,
      olderEventsBatch: 10,
      maxEventsPerRound: 10
    })
    
    // Should only get events peer doesn't have
    const sentEventIds = eventsToSend.map(e => e.event_id)
    expect(sentEventIds).not.toContain('event-1')
    expect(sentEventIds).not.toContain('event-3')
    expect(sentEventIds).toContain('event-2') // Recent event peer doesn't have
  })

  test('respects maxEventsPerRound limit for UDP safety', async () => {
    scanQueue.updateFromDatabase(mockEvents)
    
    const emptyFilter = new BloomFilter(1000, 0.01)
    
    const eventsToSend = await scanQueue.getEventsToSend('peer-1', emptyFilter, {
      recentEventsBatch: 50,  // High batch sizes
      olderEventsBatch: 50,
      maxEventsPerRound: 2    // But strict UDP limit
    })
    
    expect(eventsToSend).toHaveLength(2) // Should never exceed UDP limit
  })

  test('handles empty database gracefully', async () => {
    scanQueue.updateFromDatabase([])
    
    const emptyFilter = new BloomFilter(1000, 0.01)
    
    const eventsToSend = await scanQueue.getEventsToSend('peer-1', emptyFilter, {
      recentEventsBatch: 10,
      olderEventsBatch: 10,
      maxEventsPerRound: 10
    })
    
    expect(eventsToSend).toHaveLength(0)
    
    const stats = scanQueue.getStats()
    expect(stats.totalEvents).toBe(0)
    expect(stats.recentEvents).toBe(0)
  })

  test('reset clears all state', () => {
    scanQueue.updateFromDatabase(mockEvents)
    
    let stats = scanQueue.getStats()
    expect(stats.totalEvents).toBeGreaterThan(0)
    
    scanQueue.reset()
    
    stats = scanQueue.getStats()
    expect(stats.totalEvents).toBe(0)
    expect(stats.recentEvents).toBe(0)
    expect(stats.olderEventsCursor).toBe(0)
    expect(stats.lastUpdateTime).toBe(0)
  })

  test('sorts events newest first in database', () => {
    // Add events in random order
    const randomOrderEvents = [mockEvents[3], mockEvents[0], mockEvents[4], mockEvents[1], mockEvents[2]]
    
    scanQueue.updateFromDatabase(randomOrderEvents)
    const stats = scanQueue.getStats()
    
    expect(stats.totalEvents).toBe(5)
    // Recent events should be correctly identified despite input order
    expect(stats.recentEvents).toBe(2)
  })
})