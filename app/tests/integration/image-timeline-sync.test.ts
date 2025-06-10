import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'
import { FileHandler } from '../../files/FileHandler'
import { FileChunkHandler } from '../../files/FileChunkHandler'

describe('Image Timeline Sync', () => {
  let engine: SimulationEngine
  let fileHandler: FileHandler

  beforeEach(async () => {
    engine = new SimulationEngine()
    fileHandler = new FileHandler()
    
    // Initialize devices with no automatic messages
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true }
    ])
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('should send images through timeline events and sync them', async () => {
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!
    const networkSim = engine.getNetworkSimulator()
    
    // Create chunk handlers
    const aliceChunkHandler = new FileChunkHandler('alice', aliceDB, networkSim)
    const bobChunkHandler = new FileChunkHandler('bob', bobDB, networkSim)
    
    // Create test images
    const testImage1 = Buffer.from('Test image 1 - a beautiful sunset')
    const testImage2 = Buffer.from('Test image 2 - a cute cat photo')
    
    // Alice uploads first image
    const attachment1 = await aliceChunkHandler.uploadFile(
      new Uint8Array(testImage1),
      'image/jpeg',
      'sunset.jpg'
    )
    
    // Create message event with image (execute immediately)
    await engine.createMessageEvent(
      'alice',
      'Look at this beautiful sunset!',
      undefined, // Execute immediately
      [attachment1]
    )
    
    // Bob uploads second image
    const attachment2 = await bobChunkHandler.uploadFile(
      new Uint8Array(testImage2),
      'image/jpeg',
      'cat.jpg'
    )
    
    // Bob sends image immediately
    await engine.createMessageEvent(
      'bob',
      'Here is my cat!',
      undefined, // Execute immediately
      [attachment2]
    )
    
    // Check that messages were created in Alice and Bob's databases
    const aliceInitial = await aliceDB.getAllEvents()
    const bobInitial = await bobDB.getAllEvents()
    console.log(`After message creation: Alice has ${aliceInitial.length} events, Bob has ${bobInitial.length} events`)
    
    // Execute the scheduled events
    await engine.tick() // Execute first message
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Advance simulation time to execute second message
    for (let i = 0; i < 20; i++) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    
    // Trigger bloom sync to exchange messages and chunks
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    await aliceSync.updateLocalState()
    await bobSync.updateLocalState()
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Allow time for sync
    for (let i = 0; i < 10; i++) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Check that both devices have all events
    const aliceEvents = await aliceDB.getAllEvents()
    const bobEvents = await bobDB.getAllEvents()
    
    // Filter for messages
    const aliceMessages = aliceEvents.filter(e => {
      const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
      return payload.type === 'message'
    })
    
    const bobMessages = bobEvents.filter(e => {
      const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
      return payload.type === 'message'
    })
    
    // Both should have both messages
    expect(aliceMessages).toHaveLength(2)
    expect(bobMessages).toHaveLength(2)
    
    // Check chunks synced
    const aliceChunks = aliceEvents.filter(e => {
      const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
      return payload.type === 'file_chunk'
    })
    
    const bobChunks = bobEvents.filter(e => {
      const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
      return payload.type === 'file_chunk'
    })
    
    // Both should have all chunks
    expect(aliceChunks).toHaveLength(2) // 1 chunk per image
    expect(bobChunks).toHaveLength(2)
    
    console.log('Timeline sync complete: both devices have all images and messages')
  })

  it('should handle multiple images in rapid succession', async () => {
    const aliceDB = engine.getDeviceDatabase('alice')!
    const networkSim = engine.getNetworkSimulator()
    const aliceChunkHandler = new FileChunkHandler('alice', aliceDB, networkSim)
    
    // Create 5 test images
    const images = []
    for (let i = 0; i < 5; i++) {
      const imageData = Buffer.from(`Test image ${i} with some data`)
      const attachment = await aliceChunkHandler.uploadFile(
        new Uint8Array(imageData),
        'image/jpeg',
        `image${i}.jpg`
      )
      images.push(attachment)
      
      // Send images immediately (not scheduled for future)
      await engine.createMessageEvent(
        'alice',
        `Image ${i}`,
        undefined, // Execute immediately
        [attachment]
      )
    }
    
    // Run simulation
    for (let i = 0; i < 30; i++) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 10))
    }
    
    // Check Bob received all images
    const bobDB = engine.getDeviceDatabase('bob')!
    const bobEvents = await bobDB.getAllEvents()
    
    const bobMessages = bobEvents.filter(e => {
      const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
      return payload.type === 'message' && payload.content.startsWith('Image')
    })
    
    expect(bobMessages).toHaveLength(5)
    
    // Verify all attachments are present
    for (const msg of bobMessages) {
      const payload = JSON.parse(new TextDecoder().decode(msg.encrypted))
      expect(payload.attachments).toHaveLength(1)
      expect(payload.attachments[0].mimeType).toBe('image/jpeg')
    }
  })

  it('should handle large images that create multiple chunks', async () => {
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!
    const networkSim = engine.getNetworkSimulator()
    
    const aliceChunkHandler = new FileChunkHandler('alice', aliceDB, networkSim)
    
    // Create a large image (2KB) that will create multiple 500-byte chunks
    const largeImageData = Buffer.alloc(2048)
    for (let i = 0; i < largeImageData.length; i++) {
      largeImageData[i] = i % 256
    }
    
    const attachment = await aliceChunkHandler.uploadFile(
      new Uint8Array(largeImageData),
      'image/jpeg',
      'large-photo.jpg'
    )
    
    console.log(`Large image created ${attachment.chunkCount} chunks`)
    expect(attachment.chunkCount).toBeGreaterThan(1)
    
    // Send the large image
    await engine.createMessageEvent(
      'alice',
      'Check out this high-res photo!',
      undefined,
      [attachment]
    )
    
    // Force bloom sync
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    await aliceSync.updateLocalState()
    await bobSync.triggerSyncWith('alice')
    
    // Run simulation
    for (let i = 0; i < 20; i++) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Verify Bob has all chunks
    const bobEvents = await bobDB.getAllEvents()
    const bobChunks = bobEvents.filter(e => {
      const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
      return payload.type === 'file_chunk'
    })
    
    expect(bobChunks).toHaveLength(attachment.chunkCount)
    
    // Verify Bob can reassemble the file
    const chunks = bobChunks.map(event => {
      const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
      return {
        prfTag: payload.prfTag,
        data: new Uint8Array(Buffer.from(payload.chunkData, 'base64'))
      }
    })
    
    const assembled = await fileHandler.assembleFile(
      chunks,
      attachment.fileKey,
      attachment.fileId,
      attachment.chunkCount
    )
    
    expect(assembled).not.toBeNull()
    expect(Buffer.from(assembled!)).toEqual(largeImageData)
    console.log('Successfully reassembled large image from chunks')
  })

  it('should handle bidirectional image exchange', async () => {
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!
    const networkSim = engine.getNetworkSimulator()
    
    const aliceChunkHandler = new FileChunkHandler('alice', aliceDB, networkSim)
    const bobChunkHandler = new FileChunkHandler('bob', bobDB, networkSim)
    
    // Alice and Bob exchange images
    const aliceImage = await aliceChunkHandler.uploadFile(
      new Uint8Array(Buffer.from('Alice vacation photo')),
      'image/jpeg',
      'vacation.jpg'
    )
    
    const bobImage = await bobChunkHandler.uploadFile(
      new Uint8Array(Buffer.from('Bob family photo')),
      'image/jpeg',
      'family.jpg'
    )
    
    // Send messages immediately
    await engine.createMessageEvent('alice', 'My vacation!', undefined, [aliceImage])
    await engine.createMessageEvent('bob', 'My family!', undefined, [bobImage])
    await engine.createMessageEvent('alice', 'Nice photo!', undefined)
    await engine.createMessageEvent('bob', 'Thanks! Yours too!', undefined)
    
    // Trigger sync
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    await aliceSync.updateLocalState()
    await bobSync.updateLocalState()
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Run simulation
    for (let i = 0; i < 20; i++) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Check both have all messages and images
    const aliceEvents = await aliceDB.getAllEvents()
    const bobEvents = await bobDB.getAllEvents()
    
    // Count message types
    const countEventTypes = (events: any[]) => {
      const types = { message: 0, file_chunk: 0 }
      events.forEach(e => {
        const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
        if (payload.type === 'message') types.message++
        if (payload.type === 'file_chunk') types.file_chunk++
      })
      return types
    }
    
    const aliceTypes = countEventTypes(aliceEvents)
    const bobTypes = countEventTypes(bobEvents)
    
    expect(aliceTypes.message).toBe(4)
    expect(aliceTypes.file_chunk).toBe(2) // Both images
    expect(bobTypes.message).toBe(4)
    expect(bobTypes.file_chunk).toBe(2)
    
    console.log('Bidirectional image exchange successful')
  })

  it('should track image sync progress in timeline', async () => {
    const aliceDB = engine.getDeviceDatabase('alice')!
    const networkSim = engine.getNetworkSimulator()
    const aliceChunkHandler = new FileChunkHandler('alice', aliceDB, networkSim)
    
    // Create image with multiple chunks
    const imageData = Buffer.alloc(1500, 'image data')
    const attachment = await aliceChunkHandler.uploadFile(
      new Uint8Array(imageData),
      'image/png',
      'diagram.png'
    )
    
    // Send image
    await engine.createMessageEvent('alice', 'Here is the diagram', undefined, [attachment])
    
    // Trigger sync
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    await aliceSync.updateLocalState()
    await bobSync.triggerSyncWith('alice')
    
    // Track sync status over time
    const syncSnapshots = []
    
    for (let i = 0; i < 20; i++) {
      await engine.tick()
      
      // Check Bob's sync status
      const bobDB = engine.getDeviceDatabase('bob')!
      const bobEvents = await bobDB.getAllEvents()
      const bobChunks = bobEvents.filter(e => {
        const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
        return payload.type === 'file_chunk'
      })
      
      syncSnapshots.push({
        time: engine.currentSimTime(),
        chunksReceived: bobChunks.length,
        totalChunks: attachment.chunkCount
      })
      
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Verify progressive sync
    const finalSnapshot = syncSnapshots[syncSnapshots.length - 1]
    expect(finalSnapshot.chunksReceived).toBe(finalSnapshot.totalChunks)
    
    // Log sync progress
    console.log('Image sync progress:')
    syncSnapshots.forEach(s => {
      const percent = Math.round((s.chunksReceived / s.totalChunks) * 100)
      console.log(`  Time ${s.time}ms: ${s.chunksReceived}/${s.totalChunks} chunks (${percent}%)`)
    })
  })

  it('should handle image attachments with regular message flow', async () => {
    // Set up automatic message generation
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 60, enabled: true },
      { deviceId: 'bob', messagesPerHour: 60, enabled: true }
    ])
    
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!
    const networkSim = engine.getNetworkSimulator()
    
    // Create chunk handlers
    const aliceChunkHandler = new FileChunkHandler('alice', aliceDB, networkSim)
    const bobChunkHandler = new FileChunkHandler('bob', bobDB, networkSim)
    
    // Pre-create some images
    const images = {
      alice: await aliceChunkHandler.uploadFile(
        new Uint8Array(Buffer.from('Alice default image')),
        'image/jpeg',
        'alice-default.jpg'
      ),
      bob: await bobChunkHandler.uploadFile(
        new Uint8Array(Buffer.from('Bob default image')),
        'image/jpeg',
        'bob-default.jpg'
      )
    }
    
    // Manually inject some messages with images immediately
    await engine.createMessageEvent('alice', 'Starting conversation with image', undefined, [images.alice])
    await engine.createMessageEvent('bob', 'Replying with my image', undefined, [images.bob])
    
    // Force initial sync to exchange the image messages and chunks
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    await aliceSync.updateLocalState()
    await bobSync.updateLocalState()
    await aliceSync.triggerSyncWith('bob')
    await bobSync.triggerSyncWith('alice')
    
    // Run simulation for a shorter time to avoid too many auto-generated messages
    const startTime = engine.currentSimTime()
    let ticks = 0
    while (engine.currentSimTime() < startTime + 3000 && ticks < 30) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 10))
      ticks++
    }
    
    // Analyze results
    const aliceEvents = await aliceDB.getAllEvents()
    const bobEvents = await bobDB.getAllEvents()
    
    console.log(`After 3s simulation:`)
    console.log(`  Alice has ${aliceEvents.length} total events`)
    console.log(`  Bob has ${bobEvents.length} total events`)
    
    // Count different event types
    const countEventTypes = (events: any[]) => {
      const types = { message: 0, file_chunk: 0, message_with_attachment: 0 }
      events.forEach(e => {
        const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
        if (payload.type === 'message') {
          types.message++
          if (payload.attachments && payload.attachments.length > 0) {
            types.message_with_attachment++
          }
        }
        if (payload.type === 'file_chunk') types.file_chunk++
      })
      return types
    }
    
    const aliceTypes = countEventTypes(aliceEvents)
    const bobTypes = countEventTypes(bobEvents)
    
    console.log('Alice event types:', aliceTypes)
    console.log('Bob event types:', bobTypes)
    
    // Both devices should have the image messages
    expect(aliceTypes.message_with_attachment).toBeGreaterThanOrEqual(2)
    expect(bobTypes.message_with_attachment).toBeGreaterThanOrEqual(2)
    
    // Both should have the image chunks
    expect(aliceTypes.file_chunk).toBeGreaterThanOrEqual(2)
    expect(bobTypes.file_chunk).toBeGreaterThanOrEqual(2)
  })
})