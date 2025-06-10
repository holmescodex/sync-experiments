import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SyncManager } from '../../sync/SyncManager'
import { InMemoryStore } from '../../storage/InMemoryStore'
import { MessageGenerator } from '../../crypto/MessageGenerator'
import { NetworkSimulator } from '../../network/NetworkSimulator'

describe('SyncManager Message Broadcasting', () => {
  let syncManager: SyncManager
  let store: InMemoryStore
  let messageGenerator: MessageGenerator
  let networkSimulator: NetworkSimulator
  let broadcastSpy: any

  beforeEach(async () => {
    // Create instances
    store = new InMemoryStore('alice')
    messageGenerator = new MessageGenerator('alice')
    await messageGenerator.initialize()
    networkSimulator = new NetworkSimulator()
    
    // Create SyncManager
    syncManager = new SyncManager(
      { deviceId: 'alice', syncInterval: 5000 },
      store,
      networkSimulator,
      messageGenerator
    )
    
    // Start the sync manager to initialize everything
    await syncManager.start()
    
    // Spy on broadcast method
    broadcastSpy = vi.spyOn(networkSimulator, 'broadcastEvent')
  })

  afterEach(() => {
    // Clean up
    syncManager.stop()
  })

  it('should broadcast new messages to network', async () => {
    // Create a test message
    const event = {
      encrypted: new Uint8Array([1, 2, 3, 4, 5])
    }
    const eventId = 'test-event-123'
    
    // Broadcast the message
    await syncManager.broadcastNewMessage(event, eventId)
    
    // Verify broadcast was called
    expect(broadcastSpy).toHaveBeenCalledWith(
      'alice',
      'message',
      expect.objectContaining({
        event_id: eventId,
        encrypted: [1, 2, 3, 4, 5],
        timestamp: expect.any(Number)
      })
    )
  })

  it('should not broadcast when offline', async () => {
    // Set device offline
    syncManager.setOnline(false)
    
    // Try to broadcast
    const event = { encrypted: new Uint8Array([1, 2, 3]) }
    await syncManager.broadcastNewMessage(event, 'test-123')
    
    // Should not broadcast
    expect(broadcastSpy).not.toHaveBeenCalled()
  })

  it('should add message to bloom filter when broadcasting', async () => {
    const eventId = 'test-bloom-123'
    const event = { encrypted: new Uint8Array([1, 2, 3]) }
    
    // Check if bloom filter contains the event before
    const bloomFilter = (syncManager as any).bloomFilter
    const containsBefore = bloomFilter.test(eventId)
    expect(containsBefore).toBe(false)
    
    // Broadcast message
    await syncManager.broadcastNewMessage(event, eventId)
    
    // Bloom filter should now contain the event
    const containsAfter = bloomFilter.test(eventId)
    expect(containsAfter).toBe(true)
  })
})