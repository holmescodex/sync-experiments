import { describe, test, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('Debug Bloom Filter Sync', () => {
  let engine: SimulationEngine

  beforeEach(async () => {
    engine = new SimulationEngine()
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false },
      { deviceId: 'bob', messagesPerHour: 0, enabled: false }
    ])
  })

  test('debug 2 messages sync', async () => {
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!

    // Track network events
    const networkEvents: any[] = []
    engine.getNetworkSimulator().onNetworkEvent((event) => {
      networkEvents.push(event)
      console.log(`[NET] ${event.sourceDevice} → ${event.targetDevice}: ${event.type} (${event.status})`)
    })

    // Alice creates 2 messages
    await engine.createMessageEvent('alice', 'Message 1')
    await engine.createMessageEvent('alice', 'Message 2')
    
    // Execute events
    for (let i = 0; i < 5; i++) {
      await engine.tick()
    }
    
    // Verify Alice has 2 messages
    let aliceEvents = await aliceDB.getAllEvents()
    console.log(`Alice has ${aliceEvents.length} events`)
    expect(aliceEvents).toHaveLength(2)
    
    // Bob should have none
    let bobEvents = await bobDB.getAllEvents()
    console.log(`Bob has ${bobEvents.length} events`)
    expect(bobEvents).toHaveLength(0)
    
    // Clear network events to track sync
    networkEvents.length = 0
    
    // Trigger sync
    console.log('=== Starting Sync ===')
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Allow time for sync (increased to handle delays)
    for (let i = 0; i < 30; i++) {
      await engine.tick()
    }
    
    console.log('=== Sync Complete ===')
    console.log(`Network events during sync: ${networkEvents.length}`)
    
    // Check final state
    bobEvents = await bobDB.getAllEvents()
    console.log(`Bob now has ${bobEvents.length} events`)
    
    // Print all network events
    networkEvents.forEach((event, i) => {
      console.log(`  ${i}: ${event.sourceDevice} → ${event.targetDevice}: ${event.type}`)
    })
    
    expect(bobEvents).toHaveLength(2)
  })
})