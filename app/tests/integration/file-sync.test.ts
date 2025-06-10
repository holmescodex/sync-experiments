import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'
import { FileHandler } from '../../files/FileHandler'
import { FileChunkHandler } from '../../files/FileChunkHandler'

describe('File Sync Integration', () => {
  let engine: SimulationEngine
  let fileHandler: FileHandler

  beforeEach(async () => {
    engine = new SimulationEngine()
    fileHandler = new FileHandler()
    
    // Initialize devices
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true }
    ])
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('should sync file chunks between devices through bloom filter', async () => {
    // Get databases and network simulator
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!
    const networkSim = engine.getNetworkSimulator()
    
    // Create file chunk handler for Alice
    const aliceChunkHandler = new FileChunkHandler('alice', aliceDB, networkSim)
    
    // Create a test file
    const testFileData = Buffer.from('This is a test file that will be chunked and synced between devices!')
    const fileMetadata = await aliceChunkHandler.uploadFile(
      new Uint8Array(testFileData),
      'text/plain',
      'test.txt'
    )
    
    console.log(`Created file with ${fileMetadata.chunkCount} chunks`)
    
    // Verify chunks are stored in Alice's database
    const aliceEvents = await aliceDB.getAllEvents()
    const aliceChunks = aliceEvents.filter(e => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
        return payload.type === 'file_chunk'
      } catch {
        return false
      }
    })
    
    expect(aliceChunks).toHaveLength(fileMetadata.chunkCount)
    console.log(`Alice has ${aliceChunks.length} chunk events in database`)
    
    // Get sync managers
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    
    // Update local bloom filters
    await aliceSync.updateLocalState()
    await bobSync.updateLocalState()
    
    // Log Alice's events with IDs
    console.log('Alice events:')
    for (const event of aliceEvents) {
      const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
      console.log(`  - ${event.event_id}: type=${payload.type}`)
    }
    
    // Trigger manual sync from Bob to Alice first (Bob sends bloom filter)
    await bobSync.triggerSyncWith('alice')
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Run multiple sync cycles to ensure chunks propagate
    for (let i = 0; i < 10; i++) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Check if chunks synced to Bob
    const bobEvents = await bobDB.getAllEvents()
    const bobChunks = bobEvents.filter(e => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
        return payload.type === 'file_chunk'
      } catch {
        return false
      }
    })
    
    console.log(`Bob has ${bobChunks.length} chunk events after sync`)
    
    // Bob should have received all chunks through bloom filter sync
    expect(bobChunks).toHaveLength(fileMetadata.chunkCount)
    
    // Verify Bob can reassemble the file
    const bobChunkHandler = new FileChunkHandler('bob', bobDB, networkSim)
    
    // Extract PRF tags and chunk data from Bob's events
    const chunks = bobChunks.map(event => {
      const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
      return {
        prfTag: payload.prfTag,
        data: new Uint8Array(Buffer.from(payload.chunkData, 'base64'))
      }
    })
    
    // Try to assemble the file
    const assembled = await fileHandler.assembleFile(
      chunks,
      fileMetadata.fileKey,
      fileMetadata.fileId,
      fileMetadata.chunkCount
    )
    
    expect(assembled).not.toBeNull()
    expect(Buffer.from(assembled!)).toEqual(testFileData)
    console.log('Successfully reassembled file from synced chunks!')
  })

  it('should sync file attachments with messages', async () => {
    // Get Alice's database
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!
    const networkSim = engine.getNetworkSimulator()
    
    // Create file chunk handler for Alice
    const aliceChunkHandler = new FileChunkHandler('alice', aliceDB, networkSim)
    
    // Create a small test file
    const imageData = Buffer.from('fake image data')
    const attachment = await aliceChunkHandler.uploadFile(
      new Uint8Array(imageData),
      'image/jpeg',
      'test.jpg'
    )
    
    console.log(`Created attachment with ${attachment.chunkCount} chunks`)
    
    // Verify chunks are in Alice's database
    const aliceEventsBeforeMessage = await aliceDB.getAllEvents()
    console.log(`Alice has ${aliceEventsBeforeMessage.length} events before sending message`)
    
    // Send a message with the attachment
    await engine.createMessageEvent('alice', 'Check out this image!', undefined, [attachment])
    
    // Get sync managers
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    
    // Update local bloom filters to include the chunks
    await aliceSync.updateLocalState()
    
    // Trigger bloom sync from Bob to get chunks
    await bobSync.triggerSyncWith('alice')
    
    // Wait for sync
    for (let i = 0; i < 10; i++) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Verify Bob received both the message and the chunks
    const bobEvents = await bobDB.getAllEvents()
    
    const bobMessages = bobEvents.filter(e => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
        return payload.type === 'message'
      } catch {
        return false
      }
    })
    
    const bobChunks = bobEvents.filter(e => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
        return payload.type === 'file_chunk'
      } catch {
        return false
      }
    })
    
    expect(bobMessages).toHaveLength(1)
    expect(bobChunks).toHaveLength(attachment.chunkCount)
    
    // Verify the message has the attachment metadata
    const messagePayload = JSON.parse(new TextDecoder().decode(bobMessages[0].encrypted))
    expect(messagePayload.attachments).toHaveLength(1)
    expect(messagePayload.attachments[0].fileId).toBe(attachment.fileId)
  })
})