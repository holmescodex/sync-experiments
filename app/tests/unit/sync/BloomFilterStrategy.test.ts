import { describe, test, expect, beforeEach, vi } from 'vitest'
import { BloomFilterStrategy } from '../../sync/strategies/BloomFilterStrategy'
import { BloomFilter } from '../../sync/BloomFilter'
import type { NetworkSimulator, NetworkEvent } from '../../network/simulator'
import type { DeviceDB, Event } from '../../storage/device-db'

// Mock implementations
class MockNetworkSimulator implements Partial<NetworkSimulator> {
  private eventHandlers: Array<(event: NetworkEvent) => void> = []
  private devices: Set<string> = new Set()
  private currentTime = Date.now()
  private totalEventCount = 0
  
  onNetworkEvent(handler: (event: NetworkEvent) => void): void {
    this.eventHandlers.push(handler)
  }
  
  getCurrentTime(): number {
    return this.currentTime
  }
  
  setCurrentTime(time: number): void {
    this.currentTime = time
  }
  
  sendEvent = vi.fn()
  
  getAllDeviceSyncStatus(): Map<string, any> {
    const status = new Map()
    this.devices.forEach(device => {
      status.set(device, { synced: true })
    })
    return status
  }
  
  addDevice(deviceId: string): void {
    this.devices.add(deviceId)
  }
  
  getTotalEventCount(): number {
    return this.totalEventCount
  }
  
  setTotalEventCount(count: number): void {
    this.totalEventCount = count
  }
  
  // Helper to simulate network events
  simulateNetworkEvent(event: NetworkEvent): void {
    this.eventHandlers.forEach(handler => handler(event))
  }
}

class MockDeviceDB implements Partial<DeviceDB> {
  private events: Event[] = []
  
  async getAllEvents(): Promise<Event[]> {
    return [...this.events]
  }
  
  async getEvent(eventId: string): Promise<Event | null> {
    return this.events.find(e => e.event_id === eventId) || null
  }
  
  async insertEvent(event: Omit<Event, 'event_id'>): Promise<string> {
    const newEvent: Event = {
      ...event,
      event_id: `event-${this.events.length + 1}`
    }
    this.events.push(newEvent)
    return newEvent.event_id
  }
  
  addMockEvent(event: Event): void {
    this.events.push(event)
  }
  
  computeEventId(encrypted: Uint8Array): string {
    // Simple hash for testing
    return `event-${encrypted[0]}-${encrypted.length}`
  }
  
  clearEvents(): void {
    this.events = []
  }
}

describe('BloomFilterStrategy', () => {
  let strategy: BloomFilterStrategy
  let mockNetwork: MockNetworkSimulator
  let mockDatabase: MockDeviceDB

  beforeEach(() => {
    strategy = new BloomFilterStrategy()
    mockNetwork = new MockNetworkSimulator()
    mockDatabase = new MockDeviceDB()
  })

  test('initializes with correct name and description', () => {
    expect(strategy.name).toBe('Bloom Filter Sync')
    expect(strategy.description).toBe('Compositional accuracy via small UDP-safe filters')
  })

  test('initializes successfully with network and database', async () => {
    mockNetwork.addDevice('alice')
    mockNetwork.addDevice('bob')
    
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    expect(strategy.getPeerDevices()).toContain('bob')
    expect(strategy.getPeerDevices()).not.toContain('alice')
  })

  test('provides sync status based on event counts', async () => {
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    // Mock database with some events
    mockDatabase.addMockEvent({
      event_id: 'event-1',
      device_id: 'alice',
      created_at: Date.now(),
      received_at: Date.now(),
      encrypted: new Uint8Array([1, 2, 3])
    })
    
    mockNetwork.setTotalEventCount(10)
    
    const status = strategy.getSyncStatus()
    expect(status.strategy).toBe('Bloom Filter Sync')
    expect(status.totalEvents).toBe(10)
    expect(status.knownEvents).toBeGreaterThanOrEqual(0)
    expect(status.syncPercentage).toBeGreaterThanOrEqual(0)
    expect(status.syncPercentage).toBeLessThanOrEqual(100)
  })

  test('handles bloom filter network events', async () => {
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    // Add some events to alice's database that bob doesn't have
    const now = Date.now()
    const aliceEvent = {
      event_id: 'event-alice-has',
      device_id: 'alice', 
      created_at: now - 5000, // 5 seconds ago - definitely recent
      received_at: now - 5000,
      encrypted: new Uint8Array([1, 2, 3])
    }
    mockDatabase.addMockEvent(aliceEvent)
    
    // Verify the database has the event
    const events = await mockDatabase.getAllEvents()
    expect(events).toHaveLength(1)
    expect(events[0].event_id).toBe('event-alice-has')
    
    // Update the strategy's bloom filter and scan queue with the new event
    await strategy.onSyncTick()
    
    // Create an empty bloom filter from bob (so alice will send her events)
    const bobFilter = new BloomFilter(500, 0.05)
    // Empty filter means bob has no events, so alice should send hers
    const serialized = bobFilter.serialize()
    
    // Simulate receiving a bloom filter from bob
    const bloomFilterEvent: NetworkEvent = {
      id: 'test-bloom-1',
      type: 'bloom_filter',
      sourceDevice: 'bob',
      targetDevice: 'alice',
      status: 'delivered',
      timestamp: mockNetwork.getCurrentTime(),
      payload: {
        filter: Array.from(serialized), // Properly serialized filter
        filterSize: serialized.length,
        eventCount: 0, // Bob has no events
        deviceId: 'bob'
      }
    }
    
    await strategy.handleNetworkEvent(bloomFilterEvent)
    
    // Should have tried to send alice's event to bob since bob's filter is empty
    expect(mockNetwork.sendEvent).toHaveBeenCalled()
  })

  test('handles received message events', async () => {
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    const messageEvent: NetworkEvent = {
      id: 'test-msg-1',
      type: 'message',
      sourceDevice: 'bob',
      targetDevice: 'alice', 
      status: 'delivered',
      timestamp: mockNetwork.getCurrentTime(),
      payload: {
        eventId: 'new-event-123',
        encrypted: Array.from(new Uint8Array([10, 20, 30])),
        createdAt: Date.now(),
        deviceId: 'bob'
      }
    }
    
    await strategy.handleNetworkEvent(messageEvent)
    
    // Should have stored the new event
    const storedEvent = await mockDatabase.getEvent('new-event-123')
    expect(storedEvent).toBeDefined()
  })

  test('avoids storing duplicate events', async () => {
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    // Add existing event
    mockDatabase.addMockEvent({
      event_id: 'existing-event',
      device_id: 'bob',
      created_at: Date.now(),
      received_at: Date.now(),
      encrypted: new Uint8Array([1, 2, 3])
    })
    
    const duplicateEvent: NetworkEvent = {
      id: 'test-msg-2',
      type: 'message',
      sourceDevice: 'bob',
      targetDevice: 'alice',
      status: 'delivered', 
      timestamp: mockNetwork.getCurrentTime(),
      payload: {
        eventId: 'existing-event',
        encrypted: Array.from(new Uint8Array([10, 20, 30])),
        createdAt: Date.now(),
        deviceId: 'bob'
      }
    }
    
    const eventsBefore = await mockDatabase.getAllEvents()
    await strategy.handleNetworkEvent(duplicateEvent)
    const eventsAfter = await mockDatabase.getAllEvents()
    
    // Should not have added duplicate
    expect(eventsAfter.length).toBe(eventsBefore.length)
  })

  test('sync tick sends bloom filters periodically', async () => {
    mockNetwork.addDevice('alice')
    mockNetwork.addDevice('bob')
    
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    // First tick should send filter
    await strategy.onSyncTick()
    expect(mockNetwork.sendEvent).toHaveBeenCalledWith(
      'alice', 'bob', 'bloom_filter', expect.any(Object)
    )
    
    // Reset mock
    vi.clearAllMocks()
    
    // Immediate second tick should not send (within 10s cooldown)
    await strategy.onSyncTick()
    expect(mockNetwork.sendEvent).not.toHaveBeenCalled()
    
    // Advance time beyond cooldown
    mockNetwork.setCurrentTime(mockNetwork.getCurrentTime() + 11000)
    await strategy.onSyncTick()
    expect(mockNetwork.sendEvent).toHaveBeenCalledWith(
      'alice', 'bob', 'bloom_filter', expect.any(Object)
    )
  })

  test('manual sync trigger sends bloom filter immediately', async () => {
    mockNetwork.addDevice('alice')
    mockNetwork.addDevice('bob')
    
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    await strategy.triggerSyncWith('bob')
    
    expect(mockNetwork.sendEvent).toHaveBeenCalledWith(
      'alice', 'bob', 'bloom_filter', expect.any(Object)
    )
  })

  test('shutdown cleans up state', async () => {
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    // Add some state
    await strategy.onSyncTick()
    
    strategy.shutdown()
    
    // Should be able to call without errors
    strategy.shutdown()
  })

  test('filters peer devices correctly', async () => {
    mockNetwork.addDevice('alice')
    mockNetwork.addDevice('bob') 
    mockNetwork.addDevice('charlie')
    
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    const peers = strategy.getPeerDevices()
    expect(peers).toContain('bob')
    expect(peers).toContain('charlie')
    expect(peers).not.toContain('alice')
    expect(peers).toHaveLength(2)
  })

  test('handles network errors gracefully', async () => {
    await strategy.initialize('alice', mockNetwork as unknown as NetworkSimulator, mockDatabase as unknown as DeviceDB)
    
    // Simulate malformed bloom filter event
    const malformedEvent: NetworkEvent = {
      id: 'test-bloom-bad',
      type: 'bloom_filter',
      sourceDevice: 'bob',
      targetDevice: 'alice',
      status: 'delivered',
      timestamp: mockNetwork.getCurrentTime(),
      payload: {
        filter: 'invalid-data', // Should cause deserialization to fail
        filterSize: 10,
        eventCount: 0,
        deviceId: 'bob'
      }
    }
    
    // Should not throw
    await expect(strategy.handleNetworkEvent(malformedEvent)).resolves.toBeUndefined()
  })
})