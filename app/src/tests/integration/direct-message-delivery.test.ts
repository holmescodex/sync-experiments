import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('Direct Message Delivery Tests', () => {
  let engine: SimulationEngine

  beforeEach(async () => {
    // Create simulation engine
    engine = new SimulationEngine()
    
    // Initialize devices with zero frequency (manual messages only)
    engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false },
      { deviceId: 'bob', messagesPerHour: 0, enabled: false }
    ])
    
    // Update network config for consistent testing
    engine.updateNetworkConfig({
      packetLossRate: 0.0,
      minLatency: 10,
      maxLatency: 50,
      jitter: 10
    })
    
    // Start the engine to initialize databases and sync
    engine.start()
    await engine.tick() // Initial tick to set up
  })

  it('should deliver messages directly without bloom sync', async () => {
    // Send a manual message from Alice
    engine.createMessageEvent('alice', 'Hello Bob!')

    // Advance simulation time to allow for network delivery
    for (let i = 0; i < 10; i++) {
      engine.tick()
    }

    // Check that Bob received the message
    const bobDB = engine.getDeviceDatabase('bob')
    expect(bobDB).toBeDefined()
    
    const bobEvents = await bobDB!.getAllEvents()
    expect(bobEvents.length).toBe(1)
    
    // Verify message content
    const bobMessage = bobEvents[0]
    const decrypted = new TextDecoder().decode(bobMessage.encrypted)
    const payload = JSON.parse(decrypted)
    expect(payload.content).toBe('Hello Bob!')
    expect(payload.author).toBe('alice')
  })

  it('should handle packet loss and recover with bloom sync', async () => {
    // Set 50% packet loss
    engine.updateNetworkConfig({ packetLossRate: 0.5 })

    // Send multiple messages from Alice
    const messages = ['Message 1', 'Message 2', 'Message 3', 'Message 4', 'Message 5']
    for (const msg of messages) {
      engine.createMessageEvent('alice', msg)
      // Small delay between messages
      for (let i = 0; i < 5; i++) {
        engine.tick()
      }
    }

    // Check how many messages Bob received directly
    const bobDB = engine.getDeviceDatabase('bob')!
    let bobEvents = await bobDB.getAllEvents()
    const directDeliveryCount = bobEvents.length
    console.log(`Bob received ${directDeliveryCount} messages directly (out of ${messages.length})`)

    // Expect some messages to be dropped due to packet loss
    expect(directDeliveryCount).toBeLessThan(messages.length)
    expect(directDeliveryCount).toBeGreaterThan(0) // At least some should get through

    // Now wait for bloom sync to recover missing messages
    // Trigger bloom sync by advancing time
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    await aliceSync.updateLocalState()
    await bobSync.updateLocalState()
    
    // Advance time to allow bloom sync (3 seconds = 3000ms at 50ms per tick)
    for (let i = 0; i < 60; i++) {
      engine.tick()
    }

    // Check that Bob eventually gets all messages
    bobEvents = await bobDB.getAllEvents()
    expect(bobEvents.length).toBe(messages.length)

    // Verify all messages were received
    const receivedContents = bobEvents.map(event => {
      const decrypted = new TextDecoder().decode(event.encrypted)
      return JSON.parse(decrypted).content
    }).sort()
    
    expect(receivedContents).toEqual(messages.sort())
  })

  it('should deliver messages faster with direct delivery than bloom sync alone', async () => {
    // Send message from Alice
    engine.createMessageEvent('alice', 'Speed test message')

    // Check immediate delivery (within network latency)
    // Max latency is 50ms, so 2-3 ticks should be enough
    for (let i = 0; i < 3; i++) {
      engine.tick()
    }

    const bobDB = engine.getDeviceDatabase('bob')!
    const bobEvents = await bobDB.getAllEvents()
    expect(bobEvents.length).toBe(1)

    // Verify this was faster than bloom sync would be (2 seconds)
    const networkStats = engine.getNetworkStats()
    expect(networkStats.delivered).toBeGreaterThan(0)
  })

  it('should handle network partition and recovery', async () => {
    // Send initial message
    engine.createMessageEvent('alice', 'Before partition')
    for (let i = 0; i < 5; i++) {
      engine.tick()
    }

    // Verify Bob received it
    const bobDB = engine.getDeviceDatabase('bob')!
    let bobEvents = await bobDB.getAllEvents()
    expect(bobEvents.length).toBe(1)

    // Simulate network partition - Bob goes offline
    engine.getNetworkSimulator().setDeviceOnline('bob', false)

    // Alice sends messages while Bob is offline
    engine.createMessageEvent('alice', 'During partition 1')
    engine.createMessageEvent('alice', 'During partition 2')
    for (let i = 0; i < 5; i++) {
      engine.tick()
    }

    // Bob should not have received new messages
    bobEvents = await bobDB.getAllEvents()
    expect(bobEvents.length).toBe(1)

    // Bob comes back online
    engine.getNetworkSimulator().setDeviceOnline('bob', true)

    // Trigger bloom sync to recover missed messages
    for (let i = 0; i < 60; i++) { // 3 seconds worth of ticks
      engine.tick()
    }

    // Bob should eventually receive all messages
    bobEvents = await bobDB.getAllEvents()
    expect(bobEvents.length).toBe(3)
  })

  it('should handle bidirectional messaging', async () => {
    // Both devices send messages
    engine.createMessageEvent('alice', 'Hello from Alice')
    engine.createMessageEvent('bob', 'Hello from Bob')
    
    // Allow time for delivery
    for (let i = 0; i < 10; i++) {
      engine.tick()
    }

    // Check that both received each other's messages
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!
    const aliceEvents = await aliceDB.getAllEvents()
    const bobEvents = await bobDB.getAllEvents()

    // Each should have their own message + the other's message
    expect(aliceEvents.length).toBe(2)
    expect(bobEvents.length).toBe(2)

    // Verify message authors
    const aliceMessages = aliceEvents.map(e => {
      const decrypted = new TextDecoder().decode(e.encrypted)
      return JSON.parse(decrypted)
    })
    
    const bobMessages = bobEvents.map(e => {
      const decrypted = new TextDecoder().decode(e.encrypted)
      return JSON.parse(decrypted)
    })

    // Each should have messages from both authors
    const aliceAuthors = aliceMessages.map(m => m.author).sort()
    const bobAuthors = bobMessages.map(m => m.author).sort()
    
    expect(aliceAuthors).toEqual(['alice', 'bob'])
    expect(bobAuthors).toEqual(['alice', 'bob'])
  })
})