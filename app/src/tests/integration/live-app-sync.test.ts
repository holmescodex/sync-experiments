import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('Live App Sync Issue', () => {
  let engine: SimulationEngine
  
  beforeEach(async () => {
    engine = new SimulationEngine()
  })
  
  it('should maintain bloom filters across frequency changes', async () => {
    console.log('=== Test: Bloom Filter Persistence ===')
    
    // Initial setup like App.tsx
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 30, enabled: true },
      { deviceId: 'bob', messagesPerHour: 20, enabled: true }
    ])
    
    const aliceDb = engine.getDeviceDatabase('alice')!
    const bobDb = engine.getDeviceDatabase('bob')!
    
    // Alice sends manual message
    await engine.createMessageEvent('alice', 'First message')
    
    // Check initial state
    const aliceEvents1 = await aliceDb.getAllEvents()
    expect(aliceEvents1).toHaveLength(1)
    console.log('After manual message: Alice has', aliceEvents1.length, 'events')
    
    // Run a bit to let bloom filters update
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }
    
    // Check bloom filter state
    const syncStatus1 = engine.getDeviceSyncStatus()
    const aliceSync1 = syncStatus1.get('alice')?.sync
    console.log('Alice sync before frequency change:', aliceSync1)
    
    // Simulate user changing global message rate (like moving slider)
    console.log('\n--- Simulating frequency change (like user adjusting slider) ---')
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 25, enabled: true },  // Changed from 30
      { deviceId: 'bob', messagesPerHour: 25, enabled: true }     // Changed from 20
    ])
    
    // Check if database still has events
    const aliceEvents2 = await aliceDb.getAllEvents()
    console.log('After frequency change: Alice has', aliceEvents2.length, 'events in DB')
    
    // Run more ticks
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }
    
    // Check bloom filter state after frequency change
    const syncStatus2 = engine.getDeviceSyncStatus()
    const aliceSync2 = syncStatus2.get('alice')?.sync
    console.log('Alice sync after frequency change:', aliceSync2)
    
    // The bloom filter should still know about the event
    expect(aliceSync2?.knownEvents).toBe(1)
    
    // Try to sync with Bob
    console.log('\n--- Running sync after frequency change ---')
    for (let i = 0; i < 30; i++) {
      await engine.tick()
    }
    
    const bobEvents = await bobDb.getAllEvents()
    console.log('Bob has', bobEvents.length, 'events after sync')
    
    // Bob should receive Alice's message
    expect(bobEvents.length).toBeGreaterThan(0)
  })
  
  it('reproduces the live app sync percentage issue', async () => {
    console.log('=== Test: Live App Sync Percentage Issue ===')
    
    // Setup exactly like the screenshot
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 25, enabled: true },
      { deviceId: 'bob', messagesPerHour: 25, enabled: true }
    ])
    
    const aliceDb = engine.getDeviceDatabase('alice')!
    const bobDb = engine.getDeviceDatabase('bob')!
    
    // Alice sends "test" message like in screenshot
    await engine.createMessageEvent('alice', 'test')
    console.log('Alice sent manual message: "test"')
    
    // Run for about 1 minute of simulation time
    let lastLogTime = 0
    for (let i = 0; i < 600; i++) { // 60 seconds at 100ms per tick
      await engine.tick()
      
      // Log every 10 seconds
      const currentTime = engine.currentSimTime()
      if (currentTime - lastLogTime >= 10000) {
        const aliceCount = (await aliceDb.getAllEvents()).length
        const bobCount = (await bobDb.getAllEvents()).length
        const syncStatus = engine.getDeviceSyncStatus()
        const aliceSync = syncStatus.get('alice')?.sync
        const bobSync = syncStatus.get('bob')?.sync
        
        console.log(`\nTime: ${currentTime/1000}s`)
        console.log(`  Alice: ${aliceCount} events, Sync: ${aliceSync?.syncPercentage}%`)
        console.log(`  Bob: ${bobCount} events, Sync: ${bobSync?.syncPercentage}%`)
        console.log(`  Network total events: ${aliceSync?.totalEvents}`)
        
        lastLogTime = currentTime
      }
    }
    
    // Final check
    const finalSyncStatus = engine.getDeviceSyncStatus()
    const aliceSync = finalSyncStatus.get('alice')?.sync
    const bobSync = finalSyncStatus.get('bob')?.sync
    
    console.log('\n=== Final State ===')
    console.log('Alice sync:', aliceSync)
    console.log('Bob sync:', bobSync)
    
    // In the screenshot, Alice shows "Syncing (1%)" and Bob shows "Syncing (0%)"
    // This happens when the bloom filter thinks there are many total events but device has few
    if (aliceSync?.syncPercentage === 1 && bobSync?.syncPercentage === 0) {
      console.log('❌ REPRODUCED THE BUG! Alice=1%, Bob=0%')
    }
  })
})