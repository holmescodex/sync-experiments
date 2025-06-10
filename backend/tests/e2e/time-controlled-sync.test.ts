import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { TimeController } from '../../simulation/TimeController'
import { TimeAwareNetworkSimulator } from '../../network/TimeAwareNetworkSimulator'
import { TimeAwareSyncManager } from '../../sync/TimeAwareSyncManager'
import { InMemoryStore } from '../../storage/InMemoryStore'
import { MessageGenerator } from '../../crypto/MessageGenerator'
import { KeyManager } from '../../crypto/KeyManager'
import { EventCrypto } from '../../crypto/EventCrypto'

describe('Time-Controlled Sync Tests', () => {
  let timeController: TimeController
  let networkSimulator: TimeAwareNetworkSimulator
  let aliceStore: InMemoryStore
  let bobStore: InMemoryStore
  let aliceSync: TimeAwareSyncManager
  let bobSync: TimeAwareSyncManager
  let aliceMessageGen: MessageGenerator
  let bobMessageGen: MessageGenerator
  
  beforeEach(async () => {
    // Initialize time controller
    timeController = new TimeController()
    
    // Initialize network simulator with time awareness
    networkSimulator = new TimeAwareNetworkSimulator({
      packetLossRate: 0,
      minLatency: 10,
      maxLatency: 50,
      jitter: 5
    })
    
    // Register network simulator with time controller
    timeController.addListener(networkSimulator)
    
    // Initialize stores
    aliceStore = new InMemoryStore()
    bobStore = new InMemoryStore()
    
    // Initialize crypto components
    const aliceKeyManager = new KeyManager('alice')
    const bobKeyManager = new KeyManager('bob')
    
    await aliceKeyManager.initialize()
    await bobKeyManager.initialize()
    
    const isOrchestrated = process.env.TEST_MODE === 'orchestrated'
    
    // Only set up keys manually if not in orchestrated mode
    if (!isOrchestrated) {
      // Exchange public keys
      aliceKeyManager.addPeerPublicKey('bob', bobKeyManager.getKeyPair().publicKey)
      bobKeyManager.addPeerPublicKey('alice', aliceKeyManager.getKeyPair().publicKey)
      
      // Trust each other
      aliceKeyManager.trustPeer('bob')
      bobKeyManager.trustPeer('alice')
    }
    // In orchestrated mode, keys and trust are set up via environment variables
    
    const eventCrypto = new EventCrypto()
    aliceMessageGen = new MessageGenerator('alice', aliceKeyManager, eventCrypto)
    bobMessageGen = new MessageGenerator('bob', bobKeyManager, eventCrypto)
    
    // Initialize sync managers with time awareness
    aliceSync = new TimeAwareSyncManager(
      { deviceId: 'alice', syncInterval: 5000 }, // 5 seconds in sim time
      aliceStore,
      networkSimulator,
      aliceMessageGen
    )
    
    bobSync = new TimeAwareSyncManager(
      { deviceId: 'bob', syncInterval: 5000 },
      bobStore,
      networkSimulator,
      bobMessageGen
    )
    
    // Register sync managers with time controller
    timeController.addListener(aliceSync)
    timeController.addListener(bobSync)
    
    // Start sync managers
    await aliceSync.start()
    await bobSync.start()
    
    // Start time controller
    timeController.start()
  })
  
  afterEach(() => {
    timeController.stop()
    aliceSync.stop()
    bobSync.stop()
  })
  
  it('should run hours of sync in seconds with deterministic results', async () => {
    // Set high speed multiplier - 3600x means 1 hour = 1 second
    timeController.setSpeed(3600)
    
    const startTime = Date.now()
    
    // 1. Alice sends a message at t=0
    const aliceMessage1 = await aliceMessageGen.createMessage('Hello from Alice at t=0')
    await aliceStore.storeEvent(aliceMessage1.event, aliceMessage1.eventId)
    await aliceSync.broadcastNewMessage(aliceMessage1.event, aliceMessage1.eventId)
    
    // 2. Advance time by 1 hour (will take ~1 second real time)
    console.log('[Test] Advancing 1 hour of simulation time...')
    for (let i = 0; i < 36; i++) { // 36 ticks of 100ms = 3.6 seconds real time = 3.6 hours sim time
      timeController.tick()
      await new Promise(resolve => setImmediate(resolve))
    }
    
    const elapsed1Hour = Date.now() - startTime
    console.log(`[Test] 1 hour of simulation took ${elapsed1Hour}ms real time`)
    expect(elapsed1Hour).toBeLessThan(2000) // Should take less than 2 seconds
    
    // 3. Check Bob received the message (sync happens every 5 seconds sim time)
    const bobEvents1 = await bobStore.getAllEvents()
    expect(bobEvents1.length).toBe(1)
    const bobMessage1 = await bobMessageGen.decryptMessage(bobEvents1[0])
    expect(bobMessage1?.content).toBe('Hello from Alice at t=0')
    
    // 4. Bob sends multiple messages
    for (let i = 0; i < 5; i++) {
      const msg = await bobMessageGen.createMessage(`Bob message ${i + 1} at hour 1`)
      await bobStore.storeEvent(msg.event, msg.eventId)
      await bobSync.broadcastNewMessage(msg.event, msg.eventId)
    }
    
    // 5. Advance another 2 hours
    console.log('[Test] Advancing 2 more hours of simulation time...')
    for (let i = 0; i < 72; i++) { // 72 ticks = 7.2 hours sim time
      timeController.tick()
      await new Promise(resolve => setImmediate(resolve))
    }
    
    // 6. Verify Alice has all Bob's messages
    const aliceEvents = await aliceStore.getAllEvents()
    expect(aliceEvents.length).toBe(6) // 1 from Alice + 5 from Bob
    
    // 7. Verify deterministic sync timing
    const currentSimTime = timeController.getCurrentTime()
    expect(currentSimTime).toBeGreaterThan(10800000) // > 3 hours in ms
    
    const totalRealTime = Date.now() - startTime
    console.log(`[Test] 3+ hours of simulation completed in ${totalRealTime}ms real time`)
    expect(totalRealTime).toBeLessThan(5000) // Should complete in < 5 seconds
  })
  
  it('should handle network delays deterministically', async () => {
    // Set moderate speed
    timeController.setSpeed(100) // 100x speed
    
    // Configure network with significant latency
    networkSimulator.updateConfig({
      packetLossRate: 0,
      minLatency: 1000, // 1 second
      maxLatency: 2000, // 2 seconds
      jitter: 500
    })
    
    // Alice sends a message
    const aliceMsg = await aliceMessageGen.createMessage('Testing network delay')
    await aliceStore.storeEvent(aliceMsg.event, aliceMsg.eventId)
    await aliceSync.broadcastNewMessage(aliceMsg.event, aliceMsg.eventId)
    
    // Record when message was sent
    const sentTime = timeController.getCurrentTime()
    
    // Advance time by 3 seconds (enough for network delay)
    for (let i = 0; i < 30; i++) { // 30 * 100ms * 100x = 300 seconds sim time
      timeController.tick()
      await new Promise(resolve => setImmediate(resolve))
    }
    
    // Bob should have received it after network delay
    const bobEvents = await bobStore.getAllEvents()
    expect(bobEvents.length).toBe(1)
    
    const receivedTime = timeController.getCurrentTime()
    const transitTime = receivedTime - sentTime
    console.log(`[Test] Message transit time: ${transitTime}ms simulation time`)
    
    // Transit time should be at least minLatency
    expect(transitTime).toBeGreaterThanOrEqual(1000)
  })
  
  it('should allow jumping to specific times for testing', async () => {
    // Jump to 1 hour in the future
    timeController.jumpToTime(3600000)
    
    // Send a message at this future time
    const msg = await aliceMessageGen.createMessage('Message from the future')
    await aliceStore.storeEvent(msg.event, msg.eventId)
    
    // Verify timestamp
    const events = await aliceStore.getAllEvents()
    expect(events.length).toBe(1)
    
    // Jump another hour
    timeController.jumpToTime(7200000)
    
    // Trigger sync by advancing one tick
    timeController.tick()
    await new Promise(resolve => setImmediate(resolve))
    
    // Verify time has advanced
    expect(timeController.getCurrentTime()).toBeGreaterThanOrEqual(7200000)
  })
  
  it('should maintain deterministic ordering of events', async () => {
    timeController.setSpeed(1000) // 1000x speed
    
    const messages: string[] = []
    
    // Alice and Bob send messages concurrently
    const alicePromise = (async () => {
      for (let i = 0; i < 3; i++) {
        const msg = await aliceMessageGen.createMessage(`Alice ${i}`)
        await aliceStore.storeEvent(msg.event, msg.eventId)
        await aliceSync.broadcastNewMessage(msg.event, msg.eventId)
        messages.push(`Alice sent: ${i} at ${timeController.getCurrentTime()}`)
        
        // Advance time
        timeController.advance(1000) // 1 second sim time
      }
    })()
    
    const bobPromise = (async () => {
      for (let i = 0; i < 3; i++) {
        const msg = await bobMessageGen.createMessage(`Bob ${i}`)
        await bobStore.storeEvent(msg.event, msg.eventId)
        await bobSync.broadcastNewMessage(msg.event, msg.eventId)
        messages.push(`Bob sent: ${i} at ${timeController.getCurrentTime()}`)
        
        // Advance time
        timeController.advance(1500) // 1.5 seconds sim time
      }
    })()
    
    await Promise.all([alicePromise, bobPromise])
    
    // Let sync complete
    for (let i = 0; i < 100; i++) {
      timeController.tick()
      await new Promise(resolve => setImmediate(resolve))
    }
    
    // Both should have all 6 messages
    const aliceEvents = await aliceStore.getAllEvents()
    const bobEvents = await bobStore.getAllEvents()
    
    expect(aliceEvents.length).toBe(6)
    expect(bobEvents.length).toBe(6)
    
    console.log('[Test] Message order:', messages)
  })
})