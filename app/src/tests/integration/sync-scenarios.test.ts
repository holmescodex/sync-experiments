import { describe, test, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'
import { BloomFilter } from '../../sync/BloomFilter'

describe('Multi-Device Sync Scenarios', () => {
  let engine: SimulationEngine

  beforeEach(async () => {
    engine = new SimulationEngine()
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false },
      { deviceId: 'bob', messagesPerHour: 0, enabled: false },
      { deviceId: 'charlie', messagesPerHour: 0, enabled: false }
    ])
  })

  test('two-device sync: alice sends → bob receives', async () => {
    // Setup: Track network events and sync status
    const networkEvents: any[] = []
    const syncMessages: any[] = []
    
    engine.getNetworkSimulator().onNetworkEvent((event) => {
      networkEvents.push(event)
    })
    
    engine.onNetworkMessage((deviceId, content, fromDevice) => {
      syncMessages.push({ deviceId, content, fromDevice })
    })

    // Step 1: Alice creates a message
    await engine.createMessageEvent('alice', 'Hello from Alice!')
    
    // Step 2: Run simulation to execute the event
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }
    
    // Step 3: Verify message is in Alice's database
    const aliceDB = engine.getDeviceDatabase('alice')!
    const aliceEvents = await aliceDB.getAllEvents()
    expect(aliceEvents).toHaveLength(1)
    expect(aliceEvents[0].event_id).toBeDefined()
    
    // Step 4: Verify Alice has the event in her Bloom filter
    const aliceSyncManager = engine.getSyncManager('alice')!
    const aliceStatus = aliceSyncManager.getSyncStatus()
    expect(aliceStatus.knownEvents).toBe(1)
    
    // Step 5: Trigger sync between Alice and Bob (both directions)
    const bobSyncManager = engine.getSyncManager('bob')!
    await aliceSyncManager.triggerSyncWith('bob')
    await bobSyncManager.triggerSyncWith('alice')
    
    // Step 6: Allow time for Bloom filter exchange and event transfer
    for (let i = 0; i < 20; i++) {
      await engine.tick()
    }
    
    // Step 7: Verify Bob received the message
    const bobDB = engine.getDeviceDatabase('bob')!
    const bobEvents = await bobDB.getAllEvents()
    expect(bobEvents).toHaveLength(1)
    expect(bobEvents[0].event_id).toBe(aliceEvents[0].event_id) // Same content-addressed ID
    
    // Step 8: Verify sync statistics
    const bobStatus = bobSyncManager.getSyncStatus()
    expect(bobStatus.knownEvents).toBe(1)
    expect(bobStatus.isSynced).toBe(true)
    
    // Step 9: Verify network activity shows Bloom filter exchange
    const bloomEvents = networkEvents.filter(e => e.type === 'bloom_filter')
    expect(bloomEvents.length).toBeGreaterThan(0)
    
    // Should have message events too (the actual event transfer)
    const messageEvents = networkEvents.filter(e => e.type === 'message' && e.payload.encrypted)
    expect(messageEvents.length).toBeGreaterThan(0)
  })

  test('three-device sync convergence', async () => {
    // Scenario: Alice, Bob, and Charlie all create messages and sync
    
    // Step 1: Each device creates a unique message
    await engine.createMessageEvent('alice', 'Message from Alice')
    await engine.createMessageEvent('bob', 'Message from Bob')  
    await engine.createMessageEvent('charlie', 'Message from Charlie')
    
    // Step 2: Execute all events
    for (let i = 0; i < 15; i++) {
      await engine.tick()
    }
    
    // Step 3: Verify each device has only their own message initially
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!
    const charlieDB = engine.getDeviceDatabase('charlie')!
    
    expect((await aliceDB.getAllEvents())).toHaveLength(1)
    expect((await bobDB.getAllEvents())).toHaveLength(1)
    expect((await charlieDB.getAllEvents())).toHaveLength(1)
    
    // Step 4: Trigger pairwise syncing
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    const charlieSync = engine.getSyncManager('charlie')!
    
    // Alice syncs with Bob (bidirectional)
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Step 5: Allow sync to complete
    for (let i = 0; i < 30; i++) {
      await engine.tick()
    }
    
    // Step 6: Alice and Bob should now have 2 messages each
    expect((await aliceDB.getAllEvents())).toHaveLength(2)
    expect((await bobDB.getAllEvents())).toHaveLength(2)
    expect((await charlieDB.getAllEvents())).toHaveLength(1) // Charlie still isolated
    
    // Step 7: Charlie syncs with Alice (who has Alice + Bob's messages)
    await charlieSync.triggerSyncWith('alice')
    await aliceSync.triggerSyncWith('charlie')
    
    // Step 8: Allow final sync to complete
    for (let i = 0; i < 30; i++) {
      await engine.tick()
    }
    
    // Step 9: All devices should have all 3 messages
    const finalAliceEvents = await aliceDB.getAllEvents()
    const finalBobEvents = await bobDB.getAllEvents()
    const finalCharlieEvents = await charlieDB.getAllEvents()
    
    expect(finalAliceEvents).toHaveLength(3)
    expect(finalBobEvents).toHaveLength(2) // Bob hasn't synced with Charlie directly
    expect(finalCharlieEvents).toHaveLength(3) // Charlie got everything from Alice
    
    // Step 10: Bob syncs with Charlie to get the final message (bidirectional)
    await bobSync.triggerSyncWith('charlie')
    await charlieSync.triggerSyncWith('bob')
    
    for (let i = 0; i < 20; i++) {
      await engine.tick()
    }
    
    expect((await bobDB.getAllEvents())).toHaveLength(3)
    
    // Step 11: Verify all devices have the same event IDs (different order is OK)
    const aliceEventIds = (await aliceDB.getAllEvents()).map(e => e.event_id).sort()
    const bobEventIds = (await bobDB.getAllEvents()).map(e => e.event_id).sort()
    const charlieEventIds = (await charlieDB.getAllEvents()).map(e => e.event_id).sort()
    
    expect(aliceEventIds).toEqual(bobEventIds)
    expect(bobEventIds).toEqual(charlieEventIds)
  })

  test('bloom filter efficiency: large event set sync', async () => {
    // Test Bloom filter accuracy with many events
    
    // Step 1: Alice creates 50 events
    const messages = []
    for (let i = 0; i < 50; i++) {
      const message = `Alice message ${i}: ${Math.random().toString(36)}`
      messages.push(message)
      await engine.createMessageEvent('alice', message)
    }
    
    // Step 2: Execute all events
    for (let i = 0; i < 100; i++) {
      await engine.tick()
    }
    
    // Step 3: Verify Alice has all 50 events
    const aliceDB = engine.getDeviceDatabase('alice')!
    const aliceEvents = await aliceDB.getAllEvents()
    expect(aliceEvents).toHaveLength(50)
    
    // Step 4: Bob creates 25 different events
    for (let i = 0; i < 25; i++) {
      await engine.createMessageEvent('bob', `Bob message ${i}`)
    }
    
    for (let i = 0; i < 50; i++) {
      await engine.tick()
    }
    
    // Step 5: Verify Bob has 25 events
    const bobDB = engine.getDeviceDatabase('bob')!
    expect((await bobDB.getAllEvents())).toHaveLength(25)
    
    // Step 6: Track network activity before sync
    const networkEvents: any[] = []
    engine.getNetworkSimulator().onNetworkEvent((event) => {
      networkEvents.push(event)
    })
    
    // Step 7: Trigger sync (bidirectional)
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Step 8: Allow complete sync
    for (let i = 0; i < 100; i++) {
      await engine.tick()
    }
    
    // Step 9: Both devices should have all 75 events
    expect((await aliceDB.getAllEvents())).toHaveLength(75)
    expect((await bobDB.getAllEvents())).toHaveLength(75)
    
    // Step 10: Verify Bloom filter efficiency - should use small filters
    const bloomEvents = networkEvents.filter(e => e.type === 'bloom_filter')
    expect(bloomEvents.length).toBeGreaterThan(0)
    
    // Check filter sizes are UDP-safe
    for (const bloomEvent of bloomEvents) {
      expect(bloomEvent.payload.filterSize).toBeLessThan(500)
    }
    
    // Step 11: Verify sync status
    const aliceStatus = aliceSync.getSyncStatus()
    const bobStatus = bobSync.getSyncStatus()
    
    expect(aliceStatus.isSynced).toBe(true)
    expect(bobStatus.isSynced).toBe(true)
    expect(aliceStatus.knownEvents).toBe(75)
    expect(bobStatus.knownEvents).toBe(75)
  })

  test('incremental sync: events added during sync process', async () => {
    // Test adding events while sync is in progress
    
    // Step 1: Alice creates initial events
    for (let i = 0; i < 10; i++) {
      await engine.createMessageEvent('alice', `Initial message ${i}`)
    }
    
    // Step 2: Start sync process
    for (let i = 0; i < 20; i++) {
      await engine.tick()
    }
    
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    
    // Start initial sync (bidirectional)
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Step 3: While sync is happening, add more events
    for (let i = 0; i < 5; i++) {
      await engine.tick()
      if (i === 2) {
        // Add new event mid-sync
        await engine.createMessageEvent('alice', 'New message during sync')
      }
    }
    
    // Step 4: Complete the sync process
    for (let i = 0; i < 30; i++) {
      await engine.tick()
    }
    
    // Step 5: Trigger another sync to catch the new event (bidirectional)
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    for (let i = 0; i < 20; i++) {
      await engine.tick()
    }
    
    // Step 6: Verify Bob has all events including the one added during sync
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!
    
    const aliceEvents = await aliceDB.getAllEvents()
    const bobEvents = await bobDB.getAllEvents()
    
    expect(aliceEvents).toHaveLength(11) // 10 initial + 1 during sync
    expect(bobEvents).toHaveLength(11) // Should have received all
    
    // Step 7: Verify the mid-sync event is present
    const newEventExists = bobEvents.some(e => 
      JSON.parse(new TextDecoder().decode(e.encrypted)).content === 'New message during sync'
    )
    expect(newEventExists).toBe(true)
  })

  test('peer knowledge accumulation over multiple rounds', async () => {
    // Test that peer knowledge improves with multiple Bloom filter exchanges
    
    // Step 1: Alice creates 20 events
    for (let i = 0; i < 20; i++) {
      await engine.createMessageEvent('alice', `Event ${i}`)
    }
    
    for (let i = 0; i < 50; i++) {
      await engine.tick()
    }
    
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    
    // Step 2: First sync round - Bob should get some events (bidirectional)
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    for (let i = 0; i < 15; i++) {
      await engine.tick()
    }
    
    const bobDB = engine.getDeviceDatabase('bob')!
    const afterFirstSync = (await bobDB.getAllEvents()).length
    expect(afterFirstSync).toBeGreaterThan(0)
    
    // Step 3: Second sync round - Bob should get more events (bidirectional)
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    for (let i = 0; i < 15; i++) {
      await engine.tick()
    }
    
    const afterSecondSync = (await bobDB.getAllEvents()).length
    expect(afterSecondSync).toBeGreaterThanOrEqual(afterFirstSync)
    
    // Step 4: Continue until full sync (bidirectional)
    for (let round = 0; round < 5; round++) {
      await aliceSync.triggerSyncWith('bob')
      await bobSync.triggerSyncWith('alice')
      for (let i = 0; i < 15; i++) {
        await engine.tick()
      }
    }
    
    // Step 5: Bob should eventually have all events
    const finalBobEvents = await bobDB.getAllEvents()
    expect(finalBobEvents).toHaveLength(20)
    
    // Step 6: Verify sync status shows completion
    const bobStatus = bobSync.getSyncStatus()
    expect(bobStatus.isSynced).toBe(true)
    expect(bobStatus.syncPercentage).toBe(100)
  })
})