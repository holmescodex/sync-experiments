import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('Offline Functionality', () => {
  let engine: SimulationEngine
  let receivedMessages: Array<{ deviceId: string, content: string, fromDevice: string }>

  beforeEach(async () => {
    engine = new SimulationEngine()
    receivedMessages = []
    
    // Set up message reception tracking
    engine.onNetworkMessage((deviceId: string, content: string, fromDevice: string) => {
      receivedMessages.push({ deviceId, content, fromDevice })
    })
    
    // Initialize devices
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true, isOnline: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true, isOnline: true }
    ])
  })

  it('should not deliver network events to offline devices', async () => {
    // Both devices start online
    expect(engine.getDeviceOnlineStatus('alice')).toBe(true)
    expect(engine.getDeviceOnlineStatus('bob')).toBe(true)
    
    // Bob sends a message while both are online
    await engine.createMessageEvent('bob', 'Hello Alice!')
    await engine.tick()
    
    // Check network events - Alice should receive delivered events
    const networkEvents = engine.getNetworkEvents()
    const aliceDeliveredEvents = networkEvents.filter(e => 
      e.targetDevice === 'alice' && e.status === 'delivered'
    )
    expect(aliceDeliveredEvents.length).toBeGreaterThan(0)
    
    // Take Alice offline
    engine.setDeviceOnlineStatus('alice', false)
    expect(engine.getDeviceOnlineStatus('alice')).toBe(false)
    
    // Clear existing network events
    const beforeOfflineEventCount = networkEvents.length
    
    // Bob sends another message while Alice is offline
    await engine.createMessageEvent('bob', 'Are you there Alice?')
    await engine.tick()
    
    // Check that Alice did NOT receive delivered events (should be dropped)
    const newNetworkEvents = engine.getNetworkEvents()
    const aliceOfflineEvents = newNetworkEvents.slice(beforeOfflineEventCount).filter(e => 
      e.targetDevice === 'alice'
    )
    
    // Alice should have received 'sent' events but they should be 'dropped', not 'delivered'
    const aliceDroppedEvents = aliceOfflineEvents.filter(e => e.status === 'dropped')
    const aliceDeliveredOfflineEvents = aliceOfflineEvents.filter(e => e.status === 'delivered')
    
    expect(aliceDroppedEvents.length).toBeGreaterThan(0)
    expect(aliceDeliveredOfflineEvents.length).toBe(0)
  })

  it('should not broadcast messages from offline devices', async () => {
    // Take Alice offline
    engine.setDeviceOnlineStatus('alice', false)
    
    // Get initial network event count
    const initialNetworkEvents = engine.getNetworkEvents().length
    
    // Alice tries to send a message while offline
    await engine.createMessageEvent('alice', 'Hello from offline Alice!')
    await engine.tick()
    
    // Check network events - any events from Alice should be immediately dropped
    const networkEvents = engine.getNetworkEvents()
    const aliceNetworkEvents = networkEvents.slice(initialNetworkEvents).filter(e => 
      e.sourceDevice === 'alice'
    )
    
    // Alice's network events should all be dropped (no successful sends)
    const aliceSuccessfulSends = aliceNetworkEvents.filter(e => e.status !== 'dropped')
    expect(aliceSuccessfulSends.length).toBe(0)
    
    // But Alice's message should still be stored locally
    const aliceDb = engine.getDeviceDatabase('alice')
    expect(aliceDb).toBeDefined()
    if (aliceDb) {
      const events = await aliceDb.getAllEvents()
      expect(events.length).toBeGreaterThan(0)
      
      // Find Alice's message in her local database
      const aliceMessage = events.find(event => {
        try {
          const decrypted = JSON.parse(new TextDecoder().decode(event.encrypted))
          return decrypted.content === 'Hello from offline Alice!' && decrypted.author === 'alice'
        } catch {
          return false
        }
      })
      expect(aliceMessage).toBeDefined()
    }
  })

  it('should not participate in sync when offline', async () => {
    // Get initial sync managers
    const aliceSyncManager = engine.getSyncManager('alice')
    const bobSyncManager = engine.getSyncManager('bob')
    
    expect(aliceSyncManager).toBeDefined()
    expect(bobSyncManager).toBeDefined()
    
    // Both devices send messages while online
    await engine.createMessageEvent('alice', 'Alice message 1')
    await engine.createMessageEvent('bob', 'Bob message 1')
    await engine.tick()
    
    // Let sync happen
    for (let i = 0; i < 20; i++) {
      await engine.tick()
    }
    
    // Get baseline sync status
    const initialSyncStatus = engine.getDeviceSyncStatus()
    const aliceInitialSync = initialSyncStatus.get('alice')
    const bobInitialSync = initialSyncStatus.get('bob')
    
    // Take Alice offline
    engine.setDeviceOnlineStatus('alice', false)
    
    // Bob sends more messages while Alice is offline
    await engine.createMessageEvent('bob', 'Bob message while Alice offline')
    await engine.tick()
    
    // Run multiple sync ticks
    for (let i = 0; i < 20; i++) {
      await engine.tick()
    }
    
    // Check that Alice's sync status didn't change (she didn't participate)
    const finalSyncStatus = engine.getDeviceSyncStatus()
    const aliceFinalSync = finalSyncStatus.get('alice')
    
    // Alice should not have received Bob's new message via sync
    const aliceDb = engine.getDeviceDatabase('alice')
    if (aliceDb) {
      const aliceEvents = await aliceDb.getAllEvents()
      const bobOfflineMessage = aliceEvents.find(event => {
        try {
          const decrypted = JSON.parse(new TextDecoder().decode(event.encrypted))
          return decrypted.content === 'Bob message while Alice offline'
        } catch {
          return false
        }
      })
      expect(bobOfflineMessage).toBeUndefined()
    }
  })

  it('should handle multiple devices going offline independently', async () => {
    // Initialize with a third device
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true, isOnline: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true, isOnline: true },
      { deviceId: 'charlie', messagesPerHour: 0, enabled: true, isOnline: true }
    ])
    
    // Take Alice offline but leave Bob and Charlie online
    engine.setDeviceOnlineStatus('alice', false)
    
    // Get initial network event count
    const initialNetworkEvents = engine.getNetworkEvents().length
    
    // Bob sends a message
    await engine.createMessageEvent('bob', 'Hello everyone!')
    await engine.tick()
    
    // Check network events to see delivery patterns
    const networkEvents = engine.getNetworkEvents()
    const newEvents = networkEvents.slice(initialNetworkEvents)
    
    // Alice should receive dropped events (not delivered)
    const aliceEvents = newEvents.filter(e => e.targetDevice === 'alice')
    const aliceDeliveredEvents = aliceEvents.filter(e => e.status === 'delivered')
    const aliceDroppedEvents = aliceEvents.filter(e => e.status === 'dropped')
    
    expect(aliceDeliveredEvents.length).toBe(0)
    expect(aliceDroppedEvents.length).toBeGreaterThan(0)
    
    // Charlie should receive delivered events
    const charlieEvents = newEvents.filter(e => e.targetDevice === 'charlie')
    const charlieDeliveredEvents = charlieEvents.filter(e => e.status === 'delivered')
    
    expect(charlieDeliveredEvents.length).toBeGreaterThan(0)
    
    // Verify online status is tracked correctly
    expect(engine.getDeviceOnlineStatus('alice')).toBe(false)
    expect(engine.getDeviceOnlineStatus('bob')).toBe(true)
    expect(engine.getDeviceOnlineStatus('charlie')).toBe(true)
  })
})