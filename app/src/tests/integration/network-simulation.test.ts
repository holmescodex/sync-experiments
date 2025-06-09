import { describe, test, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('Network Simulation Integration', () => {
  let engine: SimulationEngine

  beforeEach(() => {
    engine = new SimulationEngine()
    engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false },
      { deviceId: 'bob', messagesPerHour: 0, enabled: false }
    ])
  })

  test('creates message and broadcasts over network', () => {
    const networkEvents: any[] = []
    const networkMessages: any[] = []
    
    // Monitor network events
    engine.getNetworkSimulator().onNetworkEvent((event) => {
      networkEvents.push(event)
    })
    
    // Monitor delivered messages
    engine.onNetworkMessage((deviceId, content, fromDevice) => {
      networkMessages.push({ deviceId, content, fromDevice })
    })
    
    // Create a manual message
    engine.createMessageEvent('alice', 'Hello from Alice')
    
    // Run simulation for enough time to process network delivery
    for (let i = 0; i < 20; i++) {
      engine.tick()
    }
    
    // Should have network events for the broadcast
    expect(networkEvents.length).toBeGreaterThan(0)
    
    // Should have sent message from alice to bob
    const sentEvents = networkEvents.filter(e => e.status === 'sent')
    expect(sentEvents.some(e => e.sourceDevice === 'alice' && e.targetDevice === 'bob')).toBe(true)
    
    // Should have delivered message to bob
    const deliveredEvents = networkEvents.filter(e => e.status === 'delivered')
    expect(deliveredEvents.some(e => e.targetDevice === 'bob')).toBe(true)
    
    // Should have triggered network message callback
    expect(networkMessages.some(m => m.deviceId === 'bob' && m.fromDevice === 'alice')).toBe(true)
  })

  test('sync status updates as messages are delivered', () => {
    // Configure for zero packet loss
    engine.updateNetworkConfig({ packetLossRate: 0.0 })
    
    // Create multiple messages from alice
    engine.createMessageEvent('alice', 'Message 1')
    engine.createMessageEvent('alice', 'Message 2')
    engine.createMessageEvent('alice', 'Message 3')
    
    // Initially bob should not be synced
    let syncStatus = engine.getDeviceSyncStatus()
    let bobStatus = syncStatus.get('bob')
    expect(bobStatus?.isSynced).toBe(false)
    
    // Run simulation long enough for network delivery
    for (let i = 0; i < 50; i++) {
      engine.tick()
    }
    
    // Now bob should be synced (received all messages)
    syncStatus = engine.getDeviceSyncStatus()
    bobStatus = syncStatus.get('bob')
    expect(bobStatus?.isSynced).toBe(true)
    expect(bobStatus?.syncPercentage).toBe(100)
  })

  test('packet loss affects sync status', () => {
    // Configure for high packet loss
    engine.updateNetworkConfig({ packetLossRate: 0.8 }) // 80% packet loss
    
    // Create multiple messages
    for (let i = 0; i < 10; i++) {
      engine.createMessageEvent('alice', `Message ${i}`)
    }
    
    // Run simulation
    for (let i = 0; i < 100; i++) {
      engine.tick()
    }
    
    // Bob should not be fully synced due to packet loss
    const syncStatus = engine.getDeviceSyncStatus()
    const bobStatus = syncStatus.get('bob')
    expect(bobStatus?.syncPercentage).toBeLessThan(100)
  })

  test('network statistics track packet delivery', () => {
    // Create some messages
    engine.createMessageEvent('alice', 'Message 1')
    engine.createMessageEvent('bob', 'Message 2')
    
    // Run simulation
    for (let i = 0; i < 30; i++) {
      engine.tick()
    }
    
    const stats = engine.getNetworkStats()
    expect(stats.total).toBeGreaterThan(0)
    expect(stats.sent).toBeGreaterThan(0)
    expect(stats.delivered).toBeGreaterThan(0)
    expect(stats.deliveryRate).toBeGreaterThan(0)
  })

  test('automatic event generation creates network traffic', () => {
    // Enable automatic generation
    engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 3600, enabled: true }, // 1 message per second
      { deviceId: 'bob', messagesPerHour: 1800, enabled: true }    // 1 message per 2 seconds
    ])
    
    // Run simulation for a few seconds
    for (let i = 0; i < 100; i++) {
      engine.tick()
    }
    
    // Should have generated network events
    const networkEvents = engine.getNetworkEvents()
    expect(networkEvents.length).toBeGreaterThan(0)
    
    // Should have messages from both devices
    const aliceEvents = networkEvents.filter(e => e.sourceDevice === 'alice')
    const bobEvents = networkEvents.filter(e => e.sourceDevice === 'bob')
    expect(aliceEvents.length).toBeGreaterThan(0)
    expect(bobEvents.length).toBeGreaterThan(0)
  })

  test('network configuration updates affect behavior', () => {
    const networkEvents: any[] = []
    engine.getNetworkSimulator().onNetworkEvent((event) => {
      networkEvents.push(event)
    })
    
    // Start with zero packet loss
    engine.updateNetworkConfig({ packetLossRate: 0.0 })
    engine.createMessageEvent('alice', 'Message 1')
    
    // Run simulation
    for (let i = 0; i < 20; i++) {
      engine.tick()
    }
    
    const successfulDeliveries = networkEvents.filter(e => e.status === 'delivered').length
    
    // Change to 100% packet loss
    networkEvents.length = 0 // Clear events
    engine.updateNetworkConfig({ packetLossRate: 1.0 })
    engine.createMessageEvent('alice', 'Message 2')
    
    // Run simulation
    for (let i = 0; i < 20; i++) {
      engine.tick()
    }
    
    const droppedPackets = networkEvents.filter(e => e.status === 'dropped').length
    
    expect(successfulDeliveries).toBeGreaterThan(0)
    expect(droppedPackets).toBeGreaterThan(0)
  })

  test('real world event flow: creation -> simulation -> network -> delivery', () => {
    const executedEvents: any[] = []
    const networkEvents: any[] = []
    const deliveredMessages: any[] = []
    
    // Monitor all stages
    engine.onEventExecute((event) => executedEvents.push(event))
    engine.getNetworkSimulator().onNetworkEvent((event) => networkEvents.push(event))
    engine.onNetworkMessage((deviceId, content, fromDevice) => {
      deliveredMessages.push({ deviceId, content, fromDevice })
    })
    
    // Create a message (real world event)
    engine.createMessageEvent('alice', 'End-to-end test message')
    
    // Run simulation
    for (let i = 0; i < 30; i++) {
      engine.tick()
    }
    
    // Verify the flow:
    // 1. Real world event -> simulation event
    expect(executedEvents.some(e => 
      e.deviceId === 'alice' && 
      e.data.content === 'End-to-end test message'
    )).toBe(true)
    
    // 2. Simulation event -> network event
    expect(networkEvents.some(e => 
      e.sourceDevice === 'alice' && 
      e.payload.content === 'End-to-end test message'
    )).toBe(true)
    
    // 3. Network event -> delivery to other device
    expect(deliveredMessages.some(m => 
      m.deviceId === 'bob' && 
      m.content === 'End-to-end test message' &&
      m.fromDevice === 'alice'
    )).toBe(true)
  })
})