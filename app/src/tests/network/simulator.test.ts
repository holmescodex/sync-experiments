import { describe, test, expect, beforeEach } from 'vitest'
import { NetworkSimulator } from '../../network/simulator'

describe('NetworkSimulator', () => {
  let network: NetworkSimulator

  beforeEach(() => {
    network = new NetworkSimulator({
      packetLossRate: 0.0,
      minLatency: 10,
      maxLatency: 10, // Fixed latency for predictable tests
      jitter: 0
    })
  })

  test('initializes with default config', () => {
    const config = network.getConfig()
    expect(config.packetLossRate).toBe(0.0)
    expect(config.minLatency).toBe(10)
    expect(config.maxLatency).toBe(10)
    expect(config.jitter).toBe(0)
  })

  test('adds and removes devices', () => {
    network.addDevice('alice')
    network.addDevice('bob')
    
    const syncStatus = network.getAllDeviceSyncStatus()
    expect(syncStatus.has('alice')).toBe(true)
    expect(syncStatus.has('bob')).toBe(true)
    
    network.removeDevice('alice')
    const updatedStatus = network.getAllDeviceSyncStatus()
    expect(updatedStatus.has('alice')).toBe(false)
    expect(updatedStatus.has('bob')).toBe(true)
  })

  test('sends message between devices with zero packet loss', () => {
    network.addDevice('alice')
    network.addDevice('bob')
    
    const events: any[] = []
    network.onNetworkEvent((event) => events.push(event))
    
    const sentEvent = network.sendEvent('alice', 'bob', 'message', { content: 'Hello' })
    expect(sentEvent.status).toBe('sent')
    expect(sentEvent.sourceDevice).toBe('alice')
    expect(sentEvent.targetDevice).toBe('bob')
    
    // Advance time to deliver message
    network.tick(20) // Past the 10ms latency
    
    // Should have sent and delivered events
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events.some(e => e.status === 'sent')).toBe(true)
    expect(events.some(e => e.status === 'delivered')).toBe(true)
  })

  test('drops packets with high packet loss rate', () => {
    network.updateConfig({ packetLossRate: 1.0 }) // 100% packet loss
    network.addDevice('alice')
    network.addDevice('bob')
    
    const events: any[] = []
    network.onNetworkEvent((event) => events.push(event))
    
    network.sendEvent('alice', 'bob', 'message', { content: 'Hello' })
    network.tick(100)
    
    // Should have sent and dropped events only
    expect(events.length).toBeGreaterThanOrEqual(2)
    expect(events.some(e => e.status === 'sent')).toBe(true)
    expect(events.some(e => e.status === 'dropped')).toBe(true)
  })

  test('broadcasts to multiple devices', () => {
    network.addDevice('alice')
    network.addDevice('bob')
    network.addDevice('charlie')
    
    const broadcastEvents = network.broadcastEvent('alice', 'message', { content: 'Hello all' })
    
    expect(broadcastEvents).toHaveLength(2) // To bob and charlie
    expect(broadcastEvents[0].targetDevice).toBe('bob')
    expect(broadcastEvents[1].targetDevice).toBe('charlie')
    expect(broadcastEvents.every(e => e.sourceDevice === 'alice')).toBe(true)
  })

  test('tracks sync status correctly', () => {
    network.addDevice('alice')
    network.addDevice('bob')
    network.updateTotalEventCount(3)
    
    // Initially not synced (no events received)
    let aliceStatus = network.getDeviceSyncStatus('alice')
    expect(aliceStatus.isSynced).toBe(false)
    expect(aliceStatus.syncPercentage).toBe(0)
    
    // Send events to alice
    network.sendEvent('bob', 'alice', 'message', { eventId: 'event1' })
    network.sendEvent('bob', 'alice', 'message', { eventId: 'event2' })
    network.sendEvent('bob', 'alice', 'message', { eventId: 'event3' })
    
    network.tick(100) // Deliver all messages
    
    // Now alice should be synced
    aliceStatus = network.getDeviceSyncStatus('alice')
    expect(aliceStatus.isSynced).toBe(true)
    expect(aliceStatus.syncPercentage).toBe(100)
  })

  test('calculates network statistics', () => {
    network.addDevice('alice')
    network.addDevice('bob')
    network.updateConfig({ packetLossRate: 0.5 }) // 50% packet loss
    
    // Send multiple events
    for (let i = 0; i < 10; i++) {
      network.sendEvent('alice', 'bob', 'message', { content: `Message ${i}` })
    }
    
    network.tick(100) // Process all events
    
    const stats = network.getNetworkStats()
    expect(stats.total).toBe(10)
    expect(stats.delivered + stats.dropped).toBe(10)
    expect(stats.dropRate).toBeGreaterThan(0) // Some should be dropped
  })

  test('handles offline devices', () => {
    network.addDevice('alice')
    network.addDevice('bob')
    network.setDeviceOnline('bob', false)
    
    const events: any[] = []
    network.onNetworkEvent((event) => events.push(event))
    
    network.sendEvent('alice', 'bob', 'message', { content: 'Hello' })
    network.tick(100)
    
    // Message should be dropped because bob is offline
    expect(events.some(e => e.status === 'dropped')).toBe(true)
  })

  test('applies latency and jitter correctly', () => {
    network.updateConfig({
      minLatency: 50,
      maxLatency: 100,
      jitter: 20
    })
    
    network.addDevice('alice')
    network.addDevice('bob')
    
    const sentEvent = network.sendEvent('alice', 'bob', 'message', { content: 'Hello' })
    
    expect(sentEvent.latency).toBeDefined()
    expect(sentEvent.latency!).toBeGreaterThanOrEqual(30) // min - jitter
    expect(sentEvent.latency!).toBeLessThanOrEqual(120) // max + jitter
  })

  test('resets properly', () => {
    network.addDevice('alice')
    network.sendEvent('alice', 'bob', 'message', { content: 'Hello' })
    
    network.reset()
    
    expect(network.getNetworkEvents()).toHaveLength(0)
    expect(network.getAllDeviceSyncStatus().size).toBe(0)
    
    const stats = network.getNetworkStats()
    expect(stats.total).toBe(0)
  })
})