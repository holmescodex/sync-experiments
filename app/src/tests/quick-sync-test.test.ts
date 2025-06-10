import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../simulation/engine'
import { DeviceDB } from '../storage/device-db'

describe('Quick Sync Test', () => {
  let engine: SimulationEngine
  
  beforeEach(async () => {
    engine = new SimulationEngine()
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true }
    ])
  })
  
  it('should sync a message from alice to bob', async () => {
    // Create a message from Alice
    await engine.createMessageEvent('alice', 'Hello from Alice!')
    
    // Let the engine tick to process the event
    await engine.tick()
    await engine.tick()
    
    // Check Alice's database
    const aliceDb = engine.getDeviceDatabase('alice')
    expect(aliceDb).toBeDefined()
    const aliceEvents = await aliceDb!.getAllEvents()
    expect(aliceEvents.length).toBe(1)
    
    // Give time for network and sync
    for (let i = 0; i < 20; i++) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Check Bob's database
    const bobDb = engine.getDeviceDatabase('bob')
    expect(bobDb).toBeDefined()
    const bobEvents = await bobDb!.getAllEvents()
    
    console.log(`Alice has ${aliceEvents.length} events, Bob has ${bobEvents.length} events`)
    
    // Bob should have received the message
    expect(bobEvents.length).toBe(1)
    expect(bobEvents[0].event_id).toBe(aliceEvents[0].event_id)
  })
})