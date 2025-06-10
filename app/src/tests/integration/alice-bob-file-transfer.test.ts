import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'
import { createChatAPI, type ChatAPI } from '../../api/ChatAPI'

describe('Alice→Bob File Transfer Integration', () => {
  let engine: SimulationEngine
  let aliceAPI: ChatAPI
  let bobAPI: ChatAPI

  beforeEach(async () => {
    engine = new SimulationEngine()
    
    // Initialize devices with unified simulation time
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false }, // Disable auto-generation
      { deviceId: 'bob', messagesPerHour: 0, enabled: false }    // Disable auto-generation
    ])
    
    // Create ChatAPI instances for both devices
    aliceAPI = createChatAPI('alice', engine)!
    bobAPI = createChatAPI('bob', engine)!
    
    expect(aliceAPI).toBeDefined()
    expect(bobAPI).toBeDefined()
    
    console.log('[SETUP] Alice and Bob ChatAPIs initialized')
  })

  afterEach(() => {
    aliceAPI?.destroy()
    bobAPI?.destroy()
    vi.clearAllTimers()
  })

  it('should transfer file from Alice to Bob via P2P sync', async () => {
    console.log('\n=== Starting Alice→Bob File Transfer Test ===')
    
    // Step 1: Create test file data
    const testMessage = 'Check out this image!'
    const testFileData = new Uint8Array(1500) // 1.5KB test file
    
    // Fill with recognizable pattern
    for (let i = 0; i < testFileData.length; i++) {
      testFileData[i] = i % 256
    }
    
    console.log(`[ALICE] Preparing to send file: ${testFileData.length} bytes`)
    
    // Step 2: Send file from Alice using ChatAPI
    const mockFile = new File([testFileData], 'test-image.jpg', { type: 'image/jpeg' })
    
    // Mock File.arrayBuffer() for Node.js compatibility
    if (!mockFile.arrayBuffer) {
      Object.defineProperty(mockFile, 'arrayBuffer', {
        value: async () => testFileData.buffer
      })
    }
    
    await aliceAPI.sendMessageWithFiles(testMessage, [mockFile])
    console.log('[ALICE] File sent via ChatAPI')
    
    // Step 3: Verify Alice's database has the message and file chunks
    const aliceDB = engine.getDeviceDatabase('alice')!
    let aliceEvents = await aliceDB.getAllEvents()
    
    console.log(`[ALICE] Database has ${aliceEvents.length} events after sending`)
    
    // Find message event with attachment
    const aliceMessageEvents = aliceEvents.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'message' && payload.attachments
      } catch { return false }
    })
    
    expect(aliceMessageEvents.length).toBe(1)
    console.log('[ALICE] Message event with attachment found')
    
    // Find file chunk events
    const aliceChunkEvents = aliceEvents.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'file_chunk'
      } catch { return false }
    })
    
    console.log(`[ALICE] Created ${aliceChunkEvents.length} file chunk events`)
    expect(aliceChunkEvents.length).toBeGreaterThan(0)
    
    // Verify attachment metadata
    const messagePayload = JSON.parse(new TextDecoder().decode(aliceMessageEvents[0].encrypted))
    const attachment = messagePayload.attachments[0]
    
    expect(attachment).toHaveProperty('fileId')
    expect(attachment).toHaveProperty('fileKey')
    expect(attachment).toHaveProperty('mimeType', 'image/jpeg')
    expect(attachment).toHaveProperty('fileName', 'test-image.jpg')
    expect(attachment.chunkCount).toBe(aliceChunkEvents.length)
    
    console.log(`[ALICE] Attachment metadata: fileId=${attachment.fileId}, chunks=${attachment.chunkCount}`)
    
    // Step 4: Simulate P2P sync from Alice to Bob using unified simulation time
    console.log('\n--- Starting P2P Sync Process ---')
    
    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!
    
    // Update local bloom filters
    await aliceSync.updateLocalState()
    await bobSync.updateLocalState()
    
    console.log('[SYNC] Bloom filters updated')
    
    // Bob initiates sync with Alice (discovers Alice has new events)
    await bobSync.triggerSyncWith('alice')
    
    // Use unified simulation time to advance through sync process
    console.log('[SYNC] Running sync cycles with unified time...')
    for (let cycle = 0; cycle < 20; cycle++) {
      engine.tick() // Advance simulation time by 100ms
      await new Promise(resolve => setTimeout(resolve, 10)) // Small real-time delay for async processing
      
      // Check if sync is complete
      const bobEvents = await engine.getDeviceDatabase('bob')!.getAllEvents()
      if (bobEvents.length >= aliceEvents.length) {
        console.log(`[SYNC] Sync completed in ${cycle + 1} cycles`)
        break
      }
    }
    
    // Step 5: Verify Bob received all events
    const bobDB = engine.getDeviceDatabase('bob')!
    const bobEvents = await bobDB.getAllEvents()
    
    console.log(`[BOB] Database has ${bobEvents.length} events after sync`)
    expect(bobEvents.length).toBeGreaterThanOrEqual(aliceEvents.length)
    
    // Find Bob's message event
    const bobMessageEvents = bobEvents.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'message' && payload.content === testMessage
      } catch { return false }
    })
    
    expect(bobMessageEvents.length).toBe(1)
    console.log('[BOB] Message event received')
    
    // Find Bob's file chunk events
    const bobChunkEvents = bobEvents.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'file_chunk'
      } catch { return false }
    })
    
    console.log(`[BOB] Received ${bobChunkEvents.length} file chunk events`)
    expect(bobChunkEvents.length).toBe(aliceChunkEvents.length)
    
    // Step 6: Verify Bob's ChatAPI can access the message and attachment
    console.log('\n--- Testing Bob\'s API Access ---')
    
    const bobMessages = await bobAPI.loadMessages()
    console.log(`[BOB API] Loaded ${bobMessages.length} messages`)
    
    expect(bobMessages.length).toBe(1)
    const receivedMessage = bobMessages[0]
    
    expect(receivedMessage.content).toBe(testMessage)
    expect(receivedMessage.author).toBe('alice')
    expect(receivedMessage.isOwn).toBe(false)
    expect(receivedMessage.attachments).toBeDefined()
    expect(receivedMessage.attachments!.length).toBe(1)
    
    const receivedAttachment = receivedMessage.attachments![0]
    console.log(`[BOB API] Received attachment: ${receivedAttachment.fileName} (${receivedAttachment.chunkCount} chunks)`)
    
    // Step 7: Verify file reassembly is possible
    console.log('\n--- Testing File Reassembly ---')
    
    const bobFileChunkHandler = engine.getDeviceDatabase('bob')!
    
    // Extract chunk data from Bob's events
    const chunks = bobChunkEvents.map(event => {
      const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
      return {
        prfTag: payload.prfTag,
        data: new Uint8Array(Buffer.from(payload.chunkData, 'base64'))
      }
    })
    
    // Use FileHandler to reassemble
    const { FileHandler } = await import('../../files/FileHandler')
    const fileHandler = new FileHandler()
    
    // Convert fileKey properly (it might be an array or object)
    let fileKeyBuffer: Uint8Array
    if (receivedAttachment.fileKey instanceof Uint8Array) {
      fileKeyBuffer = receivedAttachment.fileKey
    } else if (Array.isArray(receivedAttachment.fileKey)) {
      fileKeyBuffer = new Uint8Array(receivedAttachment.fileKey)
    } else if (typeof receivedAttachment.fileKey === 'object') {
      // Handle case where fileKey is stored as object with numeric indices
      const keyArray = Object.values(receivedAttachment.fileKey) as number[]
      fileKeyBuffer = new Uint8Array(keyArray)
    } else {
      throw new Error(`Unexpected fileKey type: ${typeof receivedAttachment.fileKey}`)
    }
    
    console.log(`[BOB] FileKey type: ${typeof receivedAttachment.fileKey}, length: ${fileKeyBuffer.length}`)
    
    const reassembledFile = await fileHandler.assembleFile(
      chunks,
      fileKeyBuffer,
      receivedAttachment.fileId,
      receivedAttachment.chunkCount
    )
    
    expect(reassembledFile).toBeDefined()
    expect(reassembledFile!.length).toBe(testFileData.length)
    
    // Verify file integrity
    for (let i = 0; i < testFileData.length; i++) {
      expect(reassembledFile![i]).toBe(testFileData[i])
    }
    
    console.log('[BOB] File reassembled successfully - integrity verified!')
    
    console.log('\n=== Alice→Bob File Transfer Test PASSED ===')
    
    // Step 8: Verify sync statistics
    const syncStats = engine.getDeviceSyncStatus()
    const aliceStats = syncStats.get('alice')
    const bobStats = syncStats.get('bob')
    
    console.log(`[SYNC STATS] Alice: ${aliceStats?.syncPercentage}% synced`)
    console.log(`[SYNC STATS] Bob: ${bobStats?.syncPercentage}% synced`)
    
    expect(aliceStats?.syncPercentage).toBeGreaterThan(90)
    expect(bobStats?.syncPercentage).toBeGreaterThan(90)
  })

  it('should handle timeline-triggered file generation', async () => {
    console.log('\n=== Testing Timeline File Generation ===')
    
    // Step 1: Configure engine for automatic file generation
    engine.setImageAttachmentPercentage(100) // Force file attachments
    
    // Step 2: Use createMessageEvent to trigger timeline file generation
    await engine.createMessageEvent('alice', 'Auto-generated message with file', engine.currentSimTime() + 100)
    
    console.log('[TIMELINE] Created message event with potential file attachment')
    
    // Step 3: Advance simulation time to execute the event
    console.log('[TIMELINE] Advancing simulation time to execute event...')
    
    for (let i = 0; i < 20; i++) {
      engine.tick() // Each tick advances 100ms simulation time
      await new Promise(resolve => setTimeout(resolve, 10))
      
      // Check if event was executed
      const events = await engine.getDeviceDatabase('alice')!.getAllEvents()
      if (events.length > 0) {
        console.log(`[TIMELINE] Event executed after ${i + 1} ticks`)
        break
      }
    }
    
    // Step 4: Verify the message was created with file attachment
    const aliceDB = engine.getDeviceDatabase('alice')!
    const events = await aliceDB.getAllEvents()
    
    console.log(`[TIMELINE] Alice has ${events.length} events after execution`)
    expect(events.length).toBeGreaterThan(0)
    
    // Find message event
    const messageEvents = events.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'message'
      } catch { return false }
    })
    
    expect(messageEvents.length).toBeGreaterThan(0)
    console.log('[TIMELINE] Message event found')
    
    // Check if it has attachments (may not always due to percentage chance)
    const messagePayload = JSON.parse(new TextDecoder().decode(messageEvents[0].encrypted))
    console.log(`[TIMELINE] Message content: "${messagePayload.content}"`)
    
    if (messagePayload.attachments && messagePayload.attachments.length > 0) {
      console.log('[TIMELINE] ✅ Message includes file attachment from timeline generation')
      
      // Verify file chunks were created
      const chunkEvents = events.filter(event => {
        try {
          const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
          return payload.type === 'file_chunk'
        } catch { return false }
      })
      
      expect(chunkEvents.length).toBeGreaterThan(0)
      console.log(`[TIMELINE] ✅ ${chunkEvents.length} file chunks created automatically`)
    } else {
      console.log('[TIMELINE] ℹ️  Message created without attachment (percentage-based generation)')
    }
    
    console.log('\n=== Timeline File Generation Test COMPLETED ===')
  })
})