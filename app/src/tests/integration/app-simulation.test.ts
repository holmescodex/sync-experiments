import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SimulationEngine, type SimulationEvent } from '../../simulation/engine'
import { DeviceDB } from '../../storage/device-db'

describe('App Simulation - Full Integration', () => {
  let engine: SimulationEngine
  let executedEvents: SimulationEvent[] = []
  let networkMessages: Array<{deviceId: string, content: string, fromDevice: string}> = []
  
  beforeEach(async () => {
    engine = new SimulationEngine()
    executedEvents = []
    networkMessages = []
    
    // Set up event execution callback (mimics App.tsx)
    engine.onEventExecute((event: SimulationEvent) => {
      executedEvents.push(event)
    })
    
    // Set up network message callback (mimics App.tsx)
    engine.onNetworkMessage((deviceId: string, content: string, fromDevice: string) => {
      networkMessages.push({ deviceId, content, fromDevice })
    })
  })
  
  describe('Full App Behavior', () => {
    it('should handle manual messages, auto-generation, and bloom sync like the live app', async () => {
      // Initialize with auto message generation like App.tsx
      await engine.setDeviceFrequencies([
        { deviceId: 'alice', messagesPerHour: 30, enabled: true },
        { deviceId: 'bob', messagesPerHour: 20, enabled: true }
      ])
      
      const aliceDb = engine.getDeviceDatabase('alice')!
      const bobDb = engine.getDeviceDatabase('bob')!
      
      console.log('=== Phase 1: Manual Message ===')
      // Alice sends a manual message
      await engine.createMessageEvent('alice', 'Manual message from Alice')
      
      // Verify immediate storage
      const aliceEventsAfterManual = await aliceDb.getAllEvents()
      expect(aliceEventsAfterManual).toHaveLength(1)
      expect(executedEvents).toHaveLength(1)
      expect(executedEvents[0].data.content).toBe('Manual message from Alice')
      
      console.log('=== Phase 2: Initial Sync ===')
      // Run for 2.5 seconds to trigger bloom sync
      for (let i = 0; i < 25; i++) {
        await engine.tick()
      }
      
      // Check sync status
      const syncStatus1 = engine.getDeviceSyncStatus()
      console.log('Sync status after 2.5s:', {
        alice: syncStatus1.get('alice')?.sync,
        bob: syncStatus1.get('bob')?.sync
      })
      
      // Bob should have received Alice's manual message
      const bobEventsAfterSync = await bobDb.getAllEvents()
      expect(bobEventsAfterSync.length).toBeGreaterThan(0)
      const bobHasAliceMessage = bobEventsAfterSync.some(e => e.device_id === 'alice')
      expect(bobHasAliceMessage).toBe(true)
      
      console.log('=== Phase 3: Auto-generated Messages ===')
      // Continue running to generate auto messages
      for (let i = 0; i < 50; i++) {
        await engine.tick()
      }
      
      // Check that auto-generated messages are being created
      const totalExecuted = executedEvents.length
      console.log(`Total executed events: ${totalExecuted}`)
      expect(totalExecuted).toBeGreaterThan(1) // More than just the manual message
      
      // Check upcoming events
      const upcoming = engine.getUpcomingEvents(5)
      expect(upcoming.length).toBeGreaterThan(0)
      console.log(`Upcoming events: ${upcoming.length}`)
      
      console.log('=== Phase 4: Network Activity ===')
      // Check network events
      const networkEvents = engine.getNetworkEvents(20)
      const bloomFilters = networkEvents.filter(e => e.type === 'bloom_filter')
      const messages = networkEvents.filter(e => e.type === 'message')
      
      console.log(`Network events: ${bloomFilters.length} bloom filters, ${messages.length} messages`)
      expect(bloomFilters.length).toBeGreaterThan(0)
      expect(messages.length).toBeGreaterThan(0)
      
      console.log('=== Phase 5: Continuous Sync ===')
      // Run longer to ensure continuous sync
      for (let i = 0; i < 100; i++) {
        await engine.tick()
        
        if (i % 50 === 0) {
          const aliceCount = (await aliceDb.getAllEvents()).length
          const bobCount = (await bobDb.getAllEvents()).length
          console.log(`After ${engine.currentSimTime()}ms: Alice=${aliceCount}, Bob=${bobCount}`)
        }
      }
      
      // Final verification
      const finalAliceEvents = await aliceDb.getAllEvents()
      const finalBobEvents = await bobDb.getAllEvents()
      
      console.log('=== Final State ===')
      console.log(`Alice: ${finalAliceEvents.length} total events`)
      console.log(`Bob: ${finalBobEvents.length} total events`)
      console.log(`Executed events: ${executedEvents.length}`)
      console.log(`Network messages delivered: ${networkMessages.length}`)
      
      // Both should have events
      expect(finalAliceEvents.length).toBeGreaterThan(1)
      expect(finalBobEvents.length).toBeGreaterThan(1)
      
      // Check sync percentages
      const finalSyncStatus = engine.getDeviceSyncStatus()
      const aliceSync = finalSyncStatus.get('alice')?.sync
      const bobSync = finalSyncStatus.get('bob')?.sync
      
      console.log('Final sync status:', {
        alice: aliceSync,
        bob: bobSync
      })
      
      // Both should be reasonably synced
      expect(aliceSync?.syncPercentage).toBeGreaterThan(50)
      expect(bobSync?.syncPercentage).toBeGreaterThan(50)
    })
    
    it('should handle speed changes and pause/resume', async () => {
      await engine.setDeviceFrequencies([
        { deviceId: 'alice', messagesPerHour: 60, enabled: true },
        { deviceId: 'bob', messagesPerHour: 60, enabled: true }
      ])
      
      // Run at normal speed
      const startTime = engine.currentSimTime()
      for (let i = 0; i < 10; i++) {
        await engine.tick()
      }
      const normalSpeedTime = engine.currentSimTime() - startTime
      
      // Run at 2x speed
      engine.setSpeed(2)
      const speed2xStart = engine.currentSimTime()
      for (let i = 0; i < 10; i++) {
        await engine.tick()
      }
      const speed2xTime = engine.currentSimTime() - speed2xStart
      
      // 2x speed should advance time twice as fast
      expect(speed2xTime).toBeGreaterThan(normalSpeedTime * 1.5)
      
      // Test pause
      engine.pause()
      const pauseTime = engine.currentSimTime()
      for (let i = 0; i < 10; i++) {
        await engine.tick()
      }
      expect(engine.currentSimTime()).toBe(pauseTime)
      
      // Resume
      engine.resume()
      for (let i = 0; i < 10; i++) {
        await engine.tick()
      }
      expect(engine.currentSimTime()).toBeGreaterThan(pauseTime)
    })
    
    it('should handle device frequency changes', async () => {
      // Start with both devices disabled
      await engine.setDeviceFrequencies([
        { deviceId: 'alice', messagesPerHour: 0, enabled: false },
        { deviceId: 'bob', messagesPerHour: 0, enabled: false }
      ])
      
      // Run for a bit - no events should be generated
      for (let i = 0; i < 20; i++) {
        await engine.tick()
      }
      
      const eventsWhenDisabled = executedEvents.length
      expect(eventsWhenDisabled).toBe(0)
      
      // Enable Alice only
      await engine.setDeviceFrequencies([
        { deviceId: 'alice', messagesPerHour: 120, enabled: true },
        { deviceId: 'bob', messagesPerHour: 0, enabled: false }
      ])
      
      // Run for 5 seconds
      for (let i = 0; i < 50; i++) {
        await engine.tick()
      }
      
      // Only Alice should have generated events
      const aliceEvents = executedEvents.filter(e => e.deviceId === 'alice')
      const bobEvents = executedEvents.filter(e => e.deviceId === 'bob')
      
      expect(aliceEvents.length).toBeGreaterThan(0)
      expect(bobEvents.length).toBe(0)
    })
    
    it('should export and import event timelines', async () => {
      await engine.setDeviceFrequencies([
        { deviceId: 'alice', messagesPerHour: 60, enabled: true },
        { deviceId: 'bob', messagesPerHour: 60, enabled: true }
      ])
      
      // Generate some events
      for (let i = 0; i < 30; i++) {
        await engine.tick()
      }
      
      // Export timeline
      const timeline = engine.exportEventTimeline()
      expect(timeline.events.length).toBeGreaterThan(0)
      expect(timeline.duration).toBeGreaterThan(0)
      
      // Create new engine and load timeline
      const engine2 = new SimulationEngine()
      await engine2.setDeviceFrequencies([
        { deviceId: 'alice', messagesPerHour: 60, enabled: true },
        { deviceId: 'bob', messagesPerHour: 60, enabled: true }
      ])
      
      engine2.loadEventTimeline(timeline.events)
      
      // Verify loaded events
      const loadedUpcoming = engine2.getUpcomingEvents(100)
      const unexecutedEvents = timeline.events.filter(e => !e.executed)
      expect(loadedUpcoming.length).toBe(unexecutedEvents.length)
    })
  })
  
  describe('Edge Cases', () => {
    it('should handle rapid manual messages', async () => {
      await engine.setDeviceFrequencies([
        { deviceId: 'alice', messagesPerHour: 0, enabled: true },
        { deviceId: 'bob', messagesPerHour: 0, enabled: true }
      ])
      
      // Send multiple manual messages rapidly
      await engine.createMessageEvent('alice', 'Message 1')
      await engine.createMessageEvent('alice', 'Message 2')
      await engine.createMessageEvent('bob', 'Message 3')
      await engine.createMessageEvent('alice', 'Message 4')
      
      // All should be stored immediately
      const aliceDb = engine.getDeviceDatabase('alice')!
      const bobDb = engine.getDeviceDatabase('bob')!
      
      const aliceEvents = await aliceDb.getAllEvents()
      const bobEvents = await bobDb.getAllEvents()
      
      expect(aliceEvents).toHaveLength(3) // Alice sent 3
      expect(bobEvents).toHaveLength(1) // Bob sent 1
    })
    
    it('should handle network configuration changes', async () => {
      await engine.setDeviceFrequencies([
        { deviceId: 'alice', messagesPerHour: 0, enabled: true },
        { deviceId: 'bob', messagesPerHour: 0, enabled: true }
      ])
      
      // Send a message
      await engine.createMessageEvent('alice', 'Test message')
      
      // Set high packet loss
      engine.updateNetworkConfig({ packetLossRate: 0.9 })
      
      // Try to sync
      for (let i = 0; i < 50; i++) {
        await engine.tick()
      }
      
      const networkStats = engine.getNetworkStats()
      expect(networkStats.dropped).toBeGreaterThan(0)
      
      // With high packet loss, sync might fail
      const bobDb = engine.getDeviceDatabase('bob')!
      const bobEvents = await bobDb.getAllEvents()
      console.log(`Bob received ${bobEvents.length} events with 90% packet loss`)
    })
  })
})