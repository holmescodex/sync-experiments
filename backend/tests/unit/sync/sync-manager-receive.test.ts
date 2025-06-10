import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SyncManager } from '../../sync/SyncManager'
import { InMemoryStore } from '../../storage/InMemoryStore'
import { MessageGenerator } from '../../crypto/MessageGenerator'
import { NetworkSimulator } from '../../network/NetworkSimulator'
import type { NetworkEvent } from '../../network/NetworkSimulator'

describe('SyncManager Message Reception', () => {
  let aliceSync: SyncManager
  let bobSync: SyncManager
  let aliceStore: InMemoryStore
  let bobStore: InMemoryStore
  let aliceGenerator: MessageGenerator
  let bobGenerator: MessageGenerator
  let networkSimulator: NetworkSimulator

  beforeEach(async () => {
    // Set up Alice
    aliceStore = new InMemoryStore('alice')
    aliceGenerator = new MessageGenerator('alice')
    await aliceGenerator.initialize()
    
    // Set up Bob
    bobStore = new InMemoryStore('bob')
    bobGenerator = new MessageGenerator('bob')
    await bobGenerator.initialize()
    
    // Establish trust between Alice and Bob
    const aliceKeyManager = (aliceGenerator as any).keyManager
    const bobKeyManager = (bobGenerator as any).keyManager
    
    // Exchange public keys
    const alicePublicKey = aliceKeyManager.exportPublicKeyBase64()
    const bobPublicKey = bobKeyManager.exportPublicKeyBase64()
    
    await aliceKeyManager.importPeerPublicKey('bob', bobPublicKey)
    await bobKeyManager.importPeerPublicKey('alice', alicePublicKey)
    
    // Shared network simulator
    networkSimulator = new NetworkSimulator()
    
    // Create sync managers
    aliceSync = new SyncManager(
      { deviceId: 'alice', syncInterval: 5000 },
      aliceStore,
      networkSimulator,
      aliceGenerator
    )
    
    bobSync = new SyncManager(
      { deviceId: 'bob', syncInterval: 5000 },
      bobStore,
      networkSimulator,
      bobGenerator
    )
    
    // Start both sync managers
    await aliceSync.start()
    await bobSync.start()
  })

  it('should receive and store messages from other devices', async () => {
    // Create a message from Alice
    const content = 'Test message from Alice'
    const timestamp = Date.now()
    const message = await aliceGenerator.createMessage(content, timestamp)
    const eventId = aliceGenerator.computeEventId(message.encrypted)
    
    // Store in Alice's database
    await aliceStore.storeEvent(message, eventId)
    
    // Broadcast from Alice
    await aliceSync.broadcastNewMessage(message, eventId)
    
    // Tick the network to deliver messages
    const now = Date.now()
    networkSimulator.tick(now + 100) // Add delay for delivery
    
    // Check Bob's store
    const bobEvents = await bobStore.getAllEvents()
    expect(bobEvents).toHaveLength(1)
    expect(bobEvents[0].event_id).toBe(eventId)
    
    // Decrypt and verify content
    const decrypted = await bobGenerator.decryptMessage(bobEvents[0])
    expect(decrypted?.content).toBe(content)
    expect(decrypted?.author).toBe('alice')
  })

  it('should ignore duplicate messages', async () => {
    // Create and send a message
    const message = await aliceGenerator.createMessage('Test', Date.now())
    const eventId = aliceGenerator.computeEventId(message.encrypted)
    
    // Manually inject the message into Bob's store first
    await bobStore.storeEvent({
      ...message,
      device_id: 'alice'
    }, eventId)
    
    // Spy on console.log to verify duplicate detection
    const logSpy = vi.spyOn(console, 'log')
    
    // Now try to receive the same message via network
    const event: NetworkEvent = {
      id: 'net-123',
      timestamp: Date.now(),
      sourceDevice: 'alice',
      targetDevice: 'bob',
      type: 'message',
      status: 'delivered',
      payload: {
        event_id: eventId,
        encrypted: Array.from(message.encrypted),
        timestamp: Date.now()
      }
    }
    
    // Manually trigger the network event handler
    await (bobSync as any).handleNetworkEvent(event)
    
    // Should log that we already have it
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining(`already has event ${eventId}`)
    )
    
    // Should still only have one event
    const events = await bobStore.getAllEvents()
    expect(events).toHaveLength(1)
    
    logSpy.mockRestore()
  })

  it('should handle decryption failures gracefully', async () => {
    const errorSpy = vi.spyOn(console, 'error')
    
    // Create a corrupted message
    const event: NetworkEvent = {
      id: 'net-456',
      timestamp: Date.now(),
      sourceDevice: 'alice',
      targetDevice: 'bob',
      type: 'message',
      status: 'delivered',
      payload: {
        event_id: 'bad-event',
        encrypted: [1, 2, 3], // Invalid encrypted data
        timestamp: Date.now()
      }
    }
    
    // Should handle gracefully
    await (bobSync as any).handleNetworkEvent(event)
    
    // Should log error
    expect(errorSpy).toHaveBeenCalled()
    
    // Should not store the event
    const events = await bobStore.getAllEvents()
    expect(events).toHaveLength(0)
    
    errorSpy.mockRestore()
  })
})