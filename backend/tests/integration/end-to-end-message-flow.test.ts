import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NetworkSimulator } from '../../network/NetworkSimulator'
import { SyncManager } from '../../sync/SyncManager'
import { InMemoryStore } from '../../storage/InMemoryStore'
import { MessageGenerator } from '../../crypto/MessageGenerator'
import { WebSocketServer } from 'ws'
import { NetworkSimulatorService } from '../../simulation/NetworkSimulatorService'
import { RemoteNetworkSimulator } from '../../network/RemoteNetworkSimulator'

describe('End-to-End Message Flow', () => {
  let networkService: NetworkSimulatorService
  let aliceSync: SyncManager
  let bobSync: SyncManager
  let aliceStore: InMemoryStore
  let bobStore: InMemoryStore
  let aliceGenerator: MessageGenerator
  let bobGenerator: MessageGenerator
  let wsPort: number
  let httpPort: number

  beforeAll(async () => {
    // Use unique ports for this test
    wsPort = 8001 + Math.floor(Math.random() * 1000)
    httpPort = 8501 + Math.floor(Math.random() * 1000)
    
    // Start NetworkSimulatorService
    networkService = new NetworkSimulatorService(wsPort, httpPort)
    await networkService.start()
    
    // Wait for service to be ready
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Initialize Alice
    aliceStore = new InMemoryStore('alice')
    aliceGenerator = new MessageGenerator('alice')
    await aliceGenerator.initialize()
    const aliceNetwork = new RemoteNetworkSimulator('alice', `ws://localhost:${wsPort}`)
    
    aliceSync = new SyncManager(
      { deviceId: 'alice', syncInterval: 5000 },
      aliceStore,
      aliceNetwork,
      aliceGenerator
    )
    
    // Initialize Bob
    bobStore = new InMemoryStore('bob')
    bobGenerator = new MessageGenerator('bob')
    await bobGenerator.initialize()
    const bobNetwork = new RemoteNetworkSimulator('bob', `ws://localhost:${wsPort}`)
    
    bobSync = new SyncManager(
      { deviceId: 'bob', syncInterval: 5000 },
      bobStore,
      bobNetwork,
      bobGenerator
    )
    
    // Wait for WebSocket connections
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Start sync managers
    await aliceSync.start()
    await bobSync.start()
  })

  afterAll(async () => {
    // Stop sync managers
    aliceSync.stop()
    bobSync.stop()
    
    // Stop network service
    await networkService.stop()
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 200))
  })

  it('should deliver message from Alice to Bob through full stack', async () => {
    const messageContent = 'E2E test message'
    const timestamp = Date.now()
    
    // Create message as Alice
    const message = await aliceGenerator.createMessage(messageContent, timestamp)
    const eventId = aliceGenerator.computeEventId(message.encrypted)
    
    // Store in Alice's database
    await aliceStore.storeEvent(message, eventId)
    
    // Broadcast through Alice's sync manager
    await aliceSync.broadcastNewMessage(message, eventId)
    
    // Wait for network propagation
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Check Bob received the message
    const bobEvents = await bobStore.getAllEvents()
    expect(bobEvents).toHaveLength(1)
    expect(bobEvents[0].event_id).toBe(eventId)
    
    // Decrypt and verify
    const decrypted = await bobGenerator.decryptMessage(bobEvents[0])
    expect(decrypted).toBeDefined()
    expect(decrypted?.content).toBe(messageContent)
    expect(decrypted?.author).toBe('alice')
  })

  it('should handle bidirectional messaging', async () => {
    // Clear previous messages
    await aliceStore.clear()
    await bobStore.clear()
    
    // Alice sends to Bob
    const aliceMessage = await aliceGenerator.createMessage('Hello from Alice', Date.now())
    const aliceEventId = aliceGenerator.computeEventId(aliceMessage.encrypted)
    await aliceStore.storeEvent(aliceMessage, aliceEventId)
    await aliceSync.broadcastNewMessage(aliceMessage, aliceEventId)
    
    // Bob sends to Alice
    const bobMessage = await bobGenerator.createMessage('Hello from Bob', Date.now())
    const bobEventId = bobGenerator.computeEventId(bobMessage.encrypted)
    await bobStore.storeEvent(bobMessage, bobEventId)
    await bobSync.broadcastNewMessage(bobMessage, bobEventId)
    
    // Wait for propagation
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Check both received each other's messages
    const aliceEvents = await aliceStore.getAllEvents()
    const bobEvents = await bobStore.getAllEvents()
    
    // Each should have 2 events (own + other's)
    expect(aliceEvents).toHaveLength(2)
    expect(bobEvents).toHaveLength(2)
    
    // Verify cross-reception
    const aliceHasBobMessage = aliceEvents.some(e => e.event_id === bobEventId)
    const bobHasAliceMessage = bobEvents.some(e => e.event_id === aliceEventId)
    
    expect(aliceHasBobMessage).toBe(true)
    expect(bobHasAliceMessage).toBe(true)
  })

  it('should handle rapid message sending', async () => {
    // Clear stores
    await aliceStore.clear()
    await bobStore.clear()
    
    // Send multiple messages rapidly
    const messageCount = 5
    const eventIds: string[] = []
    
    for (let i = 0; i < messageCount; i++) {
      const message = await aliceGenerator.createMessage(`Rapid message ${i}`, Date.now())
      const eventId = aliceGenerator.computeEventId(message.encrypted)
      eventIds.push(eventId)
      
      await aliceStore.storeEvent(message, eventId)
      await aliceSync.broadcastNewMessage(message, eventId)
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Wait for all to propagate
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Bob should have all messages
    const bobEvents = await bobStore.getAllEvents()
    expect(bobEvents).toHaveLength(messageCount)
    
    // Verify all event IDs are present
    const bobEventIds = bobEvents.map(e => e.event_id)
    for (const eventId of eventIds) {
      expect(bobEventIds).toContain(eventId)
    }
  })
})