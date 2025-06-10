import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { UDPNetworkSimulator } from '../../network/UDPNetworkSimulator'
import { UDPNetworkClient } from '../../network/UDPNetworkClient'
import { TimeController } from '../../simulation/TimeController'

describe('UDP Network Layer', () => {
  let simulator: UDPNetworkSimulator
  let aliceClient: UDPNetworkClient
  let bobClient: UDPNetworkClient
  let timeController: TimeController
  const networkPort = 9500 + Math.floor(Math.random() * 500)

  beforeAll(async () => {
    // Create time controller
    timeController = new TimeController()
    
    // Create and start network simulator
    simulator = new UDPNetworkSimulator(networkPort, {
      packetLossRate: 0, // No loss for basic tests
      minLatency: 10,
      maxLatency: 20
    })
    simulator.setTimeController(timeController)
    await simulator.start()
    
    // Create clients
    aliceClient = new UDPNetworkClient('alice', 'localhost', networkPort)
    bobClient = new UDPNetworkClient('bob', 'localhost', networkPort)
    
    // Connect clients
    await Promise.all([
      aliceClient.connect(),
      bobClient.connect()
    ])
    
    // Start time
    timeController.start()
  })

  afterAll(async () => {
    await aliceClient.disconnect()
    await bobClient.disconnect()
    await simulator.stop()
  })

  it('should register devices successfully', async () => {
    const stats = simulator.getStats()
    expect(stats.devices).toHaveLength(2)
    expect(stats.devices.map(d => d.deviceId)).toContain('alice')
    expect(stats.devices.map(d => d.deviceId)).toContain('bob')
  })

  it('should deliver direct messages between devices', async () => {
    let messageReceived = false
    let receivedEvent: any = null
    
    bobClient.onNetworkEvent((event) => {
      if (event.type === 'message') {
        messageReceived = true
        receivedEvent = event
      }
    })
    
    // Alice sends to Bob
    aliceClient.sendEvent('alice', 'bob', 'message', {
      content: 'Hello Bob!',
      timestamp: Date.now()
    })
    
    // Advance time to deliver the message
    for (let i = 0; i < 10 && !messageReceived; i++) {
      timeController.advance(10)
      await new Promise(resolve => setImmediate(resolve))
    }
    
    // Check Bob received it
    expect(messageReceived).toBe(true)
    expect(receivedEvent.sourceDevice).toBe('alice')
    expect(receivedEvent.targetDevice).toBe('bob')
    expect(receivedEvent.payload.content).toBe('Hello Bob!')
    expect(receivedEvent.status).toBe('delivered')
  })

  it('should handle broadcast messages', async () => {
    let messageReceived = false
    let receivedEvent: any = null
    
    bobClient.onNetworkEvent((event) => {
      if (event.type === 'announcement' && event.sourceDevice === 'alice') {
        messageReceived = true
        receivedEvent = event
      }
    })
    
    // Alice broadcasts
    aliceClient.broadcastEvent('alice', 'announcement', {
      message: 'Hello everyone!'
    })
    
    // Advance time
    for (let i = 0; i < 10 && !messageReceived; i++) {
      timeController.advance(10)
      await new Promise(resolve => setImmediate(resolve))
    }
    
    // Bob should receive it
    expect(messageReceived).toBe(true)
    expect(receivedEvent.payload.message).toBe('Hello everyone!')
  })

  it('should simulate packet loss', async () => {
    // Configure high packet loss
    simulator.updateConfig({ packetLossRate: 1.0 }) // 100% loss
    
    let messageReceived = false
    bobClient.onNetworkEvent((event) => {
      if (event.type === 'test-loss') {
        messageReceived = true
      }
    })
    
    // Send message
    aliceClient.sendEvent('alice', 'bob', 'test-loss', { data: 'Should be dropped' })
    
    // Advance time and process
    for (let i = 0; i < 10; i++) {
      timeController.advance(10)
      await new Promise(resolve => setImmediate(resolve))
    }
    
    // Should not be received
    expect(messageReceived).toBe(false)
    
    // Check stats
    const stats = simulator.getStats()
    expect(stats.packetsDropped).toBeGreaterThan(0)
    
    // Reset packet loss
    simulator.updateConfig({ packetLossRate: 0 })
  })

  it('should handle device offline status', async () => {
    // Set Bob offline
    simulator.setDeviceOnline('bob', false)
    
    let messageReceived = false
    bobClient.onNetworkEvent((event) => {
      if (event.type === 'offline-test') {
        messageReceived = true
      }
    })
    
    // Send message to offline Bob
    aliceClient.sendEvent('alice', 'bob', 'offline-test', { data: 'test' })
    
    // Advance time
    timeController.advance(100)
    
    // Should not be delivered
    expect(messageReceived).toBe(false)
    
    // Set Bob back online
    simulator.setDeviceOnline('bob', true)
  })

  it('should deliver messages with realistic latency', async () => {
    // Ensure packet loss is reset from previous test
    simulator.updateConfig({ packetLossRate: 0 })
    
    const startTime = timeController.getCurrentTime()
    let deliveryTime = 0
    let messageDelivered = false
    
    bobClient.onNetworkEvent((event) => {
      if (event.type === 'latency-test') {
        deliveryTime = timeController.getCurrentTime()
        messageDelivered = true
      }
    })
    
    // Send message
    aliceClient.sendEvent('alice', 'bob', 'latency-test', { data: 'test' })
    
    // Advance time in small increments
    for (let i = 0; i < 50 && !messageDelivered; i++) {
      timeController.advance(1)
      await new Promise(resolve => setImmediate(resolve))
    }
    
    expect(messageDelivered).toBe(true)
    
    // Check latency is within configured range (10-20ms)
    const latency = deliveryTime - startTime
    expect(latency).toBeGreaterThanOrEqual(10)
    expect(latency).toBeLessThanOrEqual(30) // Some buffer for jitter
  })
})