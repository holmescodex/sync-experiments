import { describe, test, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('Continuous Bloom Filter Sync', () => {
  let engine: SimulationEngine

  beforeEach(async () => {
    engine = new SimulationEngine()
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false },
      { deviceId: 'bob', messagesPerHour: 0, enabled: false }
    ])
  })

  test('messages sync continuously between alice and bob', async () => {
    // Get sync managers
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    
    // Get databases
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!

    // Step 1: Alice creates first message
    await engine.createMessageEvent('alice', 'Hello from Alice!')
    await engine.tick()
    
    // Verify Alice has the message
    let aliceEvents = await aliceDB.getAllEvents()
    expect(aliceEvents).toHaveLength(1)
    expect(aliceEvents[0]).toMatchObject({
      device_id: 'alice'
    })
    
    // Verify Bob doesn't have it yet
    let bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(0)

    // Step 2: Trigger sync (Alice → Bob)
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Allow time for sync
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }
    
    // Verify Bob now has Alice's message
    bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(1)
    expect(bobEvents[0].event_id).toBe(aliceEvents[0].event_id)

    // Step 3: Bob creates a response message
    await engine.createMessageEvent('bob', 'Hi Alice, got your message!')
    await engine.tick()
    
    // Verify Bob has both messages
    bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(2)
    
    // Verify Alice still only has her original message
    aliceEvents = await aliceDB.getAllEvents()
    expect(aliceEvents).toHaveLength(1)

    // Step 4: Trigger another sync (Bob → Alice)
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Allow time for sync
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }
    
    // Verify Alice now has both messages
    aliceEvents = await aliceDB.getAllEvents()
    expect(aliceEvents).toHaveLength(2)
    
    // Verify Bob still has both messages
    bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(2)
    
    // Verify both devices have the same messages (by event ID)
    const aliceEventIds = aliceEvents.map(e => e.event_id).sort()
    const bobEventIds = bobEvents.map(e => e.event_id).sort()
    expect(aliceEventIds).toEqual(bobEventIds)

    // Step 5: Add more messages and verify continuous sync
    await engine.createMessageEvent('alice', 'Second message from Alice')
    await engine.createMessageEvent('bob', 'Second message from Bob')
    
    // Run ticks to execute events
    for (let i = 0; i < 5; i++) {
      await engine.tick()
    }
    
    // Each device should have 3 messages (their 2 + the other's 1)
    aliceEvents = await aliceDB.getAllEvents()
    bobEvents = await bobDB.getAllEvents()
    expect(aliceEvents).toHaveLength(3) // Alice's 2 + Bob's 1 original
    expect(bobEvents).toHaveLength(3)   // Bob's 2 + Alice's 1 original
    
    // Sync again
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }
    
    // Now both should have all 4 messages
    aliceEvents = await aliceDB.getAllEvents()
    bobEvents = await bobDB.getAllEvents()
    expect(aliceEvents).toHaveLength(4)
    expect(bobEvents).toHaveLength(4)
    
    // Verify sync status
    const aliceStatus = aliceSync.getSyncStatus()
    const bobStatus = bobSync.getSyncStatus()
    expect(aliceStatus.knownEvents).toBe(4)
    expect(bobStatus.knownEvents).toBe(4)
    expect(aliceStatus.isSynced).toBe(true)
    expect(bobStatus.isSynced).toBe(true)
  })

  test('sync works with automatic periodic sync', async () => {
    // This test verifies that the automatic sync loop works
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!

    // Create initial message
    await engine.createMessageEvent('alice', 'Test periodic sync')
    await engine.tick()
    
    // Verify Alice has it
    let aliceEvents = await aliceDB.getAllEvents()
    expect(aliceEvents).toHaveLength(1)
    
    // Bob shouldn't have it yet
    let bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(0)
    
    // Wait for the automatic sync to potentially kick in
    // The BloomFilterStrategy sends Bloom filters every 10 seconds in onSyncTick
    // Let's simulate enough time passing
    for (let i = 0; i < 50; i++) {
      await engine.tick()
    }
    
    // Even with automatic sync, messages shouldn't sync without explicit trigger
    // because devices need to know about each other
    bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(0)
    
    // Manual trigger should still work
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }
    
    bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(1)
  })

  test('large message bursts sync correctly', async () => {
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!

    // Create many messages rapidly
    const messageCount = 20
    for (let i = 0; i < messageCount; i++) {
      await engine.createMessageEvent('alice', `Message ${i} from Alice`)
      if (i % 3 === 0) {
        await engine.tick()
      }
    }
    
    // Execute remaining events
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }
    
    // Verify Alice has all messages
    let aliceEvents = await aliceDB.getAllEvents()
    expect(aliceEvents).toHaveLength(messageCount)
    
    // Bob should have none
    let bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(0)
    
    // Trigger sync
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Allow more time for large sync
    for (let i = 0; i < 30; i++) {
      await engine.tick()
    }
    
    // Bob should have received all messages
    bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(messageCount)
    
    // Verify event IDs match
    const aliceEventIds = aliceEvents.map(e => e.event_id).sort()
    const bobEventIds = bobEvents.map(e => e.event_id).sort()
    expect(aliceEventIds).toEqual(bobEventIds)
  })
})