import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationEngine, type SimulationEvent } from '../../simulation/engine'
import { DeviceDB } from '../../storage/device-db'
import { SyncManager } from '../../sync/SyncManager'
import { BloomFilterStrategy } from '../../sync/strategies/BloomFilterStrategy'

describe('Event Playback - Deterministic Testing', () => {
  let engine: SimulationEngine
  let aliceDb: DeviceDB
  let bobDb: DeviceDB
  
  beforeEach(async () => {
    // Create a fresh engine for each test
    engine = new SimulationEngine()
    
    // Initialize devices
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true }, // 0 = no auto messages
      { deviceId: 'bob', messagesPerHour: 0, enabled: true }
    ])
    
    // Get direct access to databases
    aliceDb = engine.getDeviceDatabase('alice')!
    bobDb = engine.getDeviceDatabase('bob')!
    
    // Pause the engine to control timing
    engine.pause()
  })
  
  describe('Manual Message Storage', () => {
    it('should store manual message in sender database immediately', async () => {
      // Create a manual message event at current time
      await engine.createMessageEvent('alice', 'test message')
      
      // Check Alice's database immediately
      const aliceEvents = await aliceDb.getAllEvents()
      console.log('Alice events after manual message:', aliceEvents)
      
      expect(aliceEvents).toHaveLength(1)
      expect(aliceEvents[0].device_id).toBe('alice')
      
      // Decrypt and verify content
      const decrypted = JSON.parse(new TextDecoder().decode(aliceEvents[0].encrypted))
      expect(decrypted.content).toBe('test message')
      expect(decrypted.type).toBe('message')
    })
    
    it('should update bloom filters after manual message', async () => {
      // Create a manual message
      await engine.createMessageEvent('alice', 'test message')
      
      // Get Alice's sync manager
      const aliceSyncManager = engine.getSyncManager('alice')!
      const aliceStrategy = aliceSyncManager.getStrategy() as BloomFilterStrategy
      
      // Force a sync tick to update bloom filters
      await aliceSyncManager.updateLocalState()
      
      // Check sync status
      const syncStatus = aliceStrategy.getSyncStatus()
      console.log('Alice sync status after manual message:', syncStatus)
      
      expect(syncStatus.knownEvents).toBe(1)
    })
  })
  
  describe('Event Playback Sequence', () => {
    it('should replay a sequence of events deterministically', async () => {
      // Define a sequence of events
      const eventSequence: Array<{time: number, device: string, content: string}> = [
        { time: 0, device: 'alice', content: 'Hello from Alice' },
        { time: 1000, device: 'bob', content: 'Hi Alice!' },
        { time: 2000, device: 'alice', content: 'How are you?' },
        { time: 3000, device: 'bob', content: 'Doing great!' }
      ]
      
      // Create all events upfront
      for (const event of eventSequence) {
        await engine.createMessageEvent(event.device, event.content, event.time)
      }
      
      // Execute initial tick to process time 0 events
      await engine.tick()
      
      // Resume and advance time to execute all events
      engine.resume()
      
      // Advance time past all events  
      for (let t = 100; t <= 4000; t += 100) {
        await engine.tick()
      }
      
      // Verify all events were stored
      const aliceEvents = await aliceDb.getAllEvents()
      const bobEvents = await bobDb.getAllEvents()
      
      console.log(`Alice has ${aliceEvents.length} events`)
      console.log(`Bob has ${bobEvents.length} events`)
      
      // Since we only ran 4 seconds, we should have all 4 events executed
      // Alice should have her 2 events
      expect(aliceEvents).toHaveLength(2)
      
      // Bob should have his 2 events  
      expect(bobEvents).toHaveLength(2)
    })
  })
  
  describe('Bloom Filter Sync Playback', () => {
    it('should sync a manual message between devices', async () => {
      // Enable network sync
      engine.resume()
      
      // Alice sends a manual message
      await engine.createMessageEvent('alice', 'Hello Bob!')
      
      // Advance time to allow message storage
      await engine.tick()
      
      // Verify Alice has the message
      const aliceEventsInitial = await aliceDb.getAllEvents()
      expect(aliceEventsInitial).toHaveLength(1)
      
      console.log('=== Starting Bloom Sync Test ===')
      console.log(`Alice has ${aliceEventsInitial.length} events`)
      console.log(`Bob has ${(await bobDb.getAllEvents()).length} events`)
      
      // Force multiple sync rounds (bloom filters exchange every 2 seconds)
      // Run for 5 seconds to ensure multiple sync rounds
      for (let i = 0; i < 50; i++) {
        await engine.tick() // Each tick is 100ms
        
        if (i % 10 === 0) {
          const aliceCount = (await aliceDb.getAllEvents()).length
          const bobCount = (await bobDb.getAllEvents()).length
          const networkEvents = engine.getNetworkEvents(10)
          console.log(`After ${i * 100}ms: Alice=${aliceCount}, Bob=${bobCount}`)
          console.log(`Network events:`, networkEvents.map(e => `${e.type} ${e.sourceDevice}->${e.targetDevice} ${e.status}`))
        }
      }
      
      // Check if Bob received the message
      const bobEvents = await bobDb.getAllEvents()
      console.log(`Final: Bob has ${bobEvents.length} events`)
      
      // Bob should have received Alice's message
      expect(bobEvents).toHaveLength(1)
      expect(bobEvents[0].device_id).toBe('alice')
      
      // Verify the content
      const decrypted = JSON.parse(new TextDecoder().decode(bobEvents[0].encrypted))
      expect(decrypted.content).toBe('Hello Bob!')
    })
  })
  
  describe('Debug Manual Message Issue', () => {
    it('should trace manual message execution path', async () => {
      console.log('=== MANUAL MESSAGE DEBUG TRACE ===')
      
      // Set up execution callback to trace
      let executionTraced = false
      engine.onEventExecute((event) => {
        console.log('Event executed:', {
          type: event.type,
          deviceId: event.deviceId,
          content: event.data.content,
          simTime: event.simTime,
          currentTime: engine.currentSimTime()
        })
        executionTraced = true
      })
      
      // Create manual message
      console.log('Creating manual message...')
      await engine.createMessageEvent('alice', 'test debug message')
      
      // Check if execution happened
      expect(executionTraced).toBe(true)
      
      // Check database immediately
      const events = await aliceDb.getAllEvents()
      console.log('Database check:', {
        eventCount: events.length,
        events: events.map(e => ({
          id: e.event_id,
          device: e.device_id,
          created: e.created_at
        }))
      })
      
      expect(events).toHaveLength(1)
    })
  })
})