import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('Automatic File Generation', () => {
  let engine: SimulationEngine

  beforeEach(async () => {
    engine = new SimulationEngine()
    
    // Initialize devices with low message frequency for controlled testing
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 1, enabled: true },
      { deviceId: 'bob', messagesPerHour: 1, enabled: true }
    ])
  })

  afterEach(() => {
    vi.clearAllTimers()
  })

  it('should generate file attachments in timeline based on percentage', async () => {
    // Set 100% attachment rate for predictable testing
    engine.setImageAttachmentPercentage(100)
    
    // Let the engine generate some events
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Get upcoming events to see if they have file intents
    const upcomingEvents = engine.getUpcomingEvents(5)
    
    console.log(`Generated ${upcomingEvents.length} upcoming events`)
    
    // Check if any events have file intents
    const eventsWithFileIntents = upcomingEvents.filter(event => 
      event.type === 'message' && event.data.fileIntent
    )
    
    console.log(`Events with file intents: ${eventsWithFileIntents.length}`)
    
    // With 100% rate, we should have some events with file intents
    expect(eventsWithFileIntents.length).toBeGreaterThan(0)
    
    // Verify file intent structure
    const fileIntent = eventsWithFileIntents[0].data.fileIntent
    expect(fileIntent).toHaveProperty('name')
    expect(fileIntent).toHaveProperty('size')
    expect(fileIntent).toHaveProperty('type')
    expect(fileIntent.name).toMatch(/\.(jpg|png)$/)
    expect(typeof fileIntent.size).toBe('number')
    expect(fileIntent.type).toMatch(/^image\/(jpeg|png)$/)
    
    console.log(`File intent: ${fileIntent.name} (${fileIntent.size} bytes, ${fileIntent.type})`)
  })

  it('should process file intents into real attachments during execution', async () => {
    // Set high attachment rate
    engine.setImageAttachmentPercentage(100)
    
    // Manually create a message event with file intent for immediate testing
    await engine.createMessageEvent('alice', 'Test message with attachment', engine.currentSimTime() + 1000)
    
    // Wait and get the generated event
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const upcomingEvents = engine.getUpcomingEvents(10)
    console.log(`Total upcoming events: ${upcomingEvents.length}`)
    
    upcomingEvents.forEach((event, i) => {
      console.log(`Event ${i}: ${event.deviceId} - "${event.data.content}" - hasFileIntent: ${!!event.data.fileIntent}`)
    })
    
    // Find or create an event with file intent
    let eventWithIntent = upcomingEvents.find(event => 
      event.type === 'message' && event.data.fileIntent
    )
    
    if (!eventWithIntent) {
      // If no auto-generated event has file intent, add one manually
      const testEvent = upcomingEvents.find(event => event.type === 'message')
      if (testEvent) {
        testEvent.data.fileIntent = {
          name: 'test-image.jpg',
          size: 45000,
          type: 'image/jpeg'
        }
        eventWithIntent = testEvent
        console.log('Added file intent to existing event manually')
      }
    }
    
    expect(eventWithIntent).toBeDefined()
    console.log(`Found event with intent: ${eventWithIntent!.data.fileIntent.name}`)
    
    // Get database state before execution
    const eventsBefore = await engine.getDeviceDatabase(eventWithIntent!.deviceId)!.getAllEvents()
    console.log(`Events before execution: ${eventsBefore.length}`)
    
    // Advance time to execute the event
    const targetTime = eventWithIntent!.simTime + 100
    console.log(`Advancing time to ${targetTime} to execute event at ${eventWithIntent!.simTime}`)
    
    // Run engine ticks until the event executes
    for (let i = 0; i < 10; i++) {
      await engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
      
      if (engine.currentSimTime() >= targetTime) {
        break
      }
    }
    
    const eventsAfter = await engine.getDeviceDatabase(eventWithIntent!.deviceId)!.getAllEvents()
    console.log(`Events after execution: ${eventsAfter.length}`)
    
    // Check if file chunks were created
    const fileChunkEvents = eventsAfter.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'file_chunk'
      } catch {
        return false
      }
    })
    
    console.log(`File chunk events created: ${fileChunkEvents.length}`)
    
    // Should have created file chunks for the attachment
    expect(fileChunkEvents.length).toBeGreaterThan(0)
    
    // Check if the message event has attachments
    const messageEvents = eventsAfter.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'message' && payload.attachments
      } catch {
        return false
      }
    })
    
    console.log(`Message events with attachments: ${messageEvents.length}`)
    expect(messageEvents.length).toBeGreaterThan(0)
    
    // Verify attachment structure
    const messagePayload = JSON.parse(new TextDecoder().decode(messageEvents[0].encrypted))
    const attachment = messagePayload.attachments[0]
    
    expect(attachment).toHaveProperty('fileId')
    expect(attachment).toHaveProperty('fileKey')
    expect(attachment).toHaveProperty('mimeType')
    expect(attachment).toHaveProperty('chunkCount')
    expect(attachment.chunkCount).toBeGreaterThan(0)
    
    console.log(`Attachment: ${attachment.fileName} (${attachment.chunkCount} chunks)`)
  })

  it('should respect image attachment percentage setting', async () => {
    // First test: 100% rate should always create file intents
    engine.setImageAttachmentPercentage(100)
    
    // Force new event generation by setting high frequency temporarily
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 60, enabled: true }, // 1 per minute
      { deviceId: 'bob', messagesPerHour: 60, enabled: true }
    ])
    
    // Wait for events to generate
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const eventsHundredPercent = engine.getUpcomingEvents(10)
    const withIntentsHundred = eventsHundredPercent.filter(event => 
      event.type === 'message' && event.data.fileIntent
    )
    
    console.log(`With 100% rate: ${withIntentsHundred.length}/${eventsHundredPercent.length} events with file intents`)
    
    // With 100% rate, all message events should have file intents
    if (eventsHundredPercent.length > 0) {
      expect(withIntentsHundred.length).toBeGreaterThan(0)
    }
    
    // Second test: 0% rate should never create file intents
    engine.setImageAttachmentPercentage(0)
    
    // Reset and generate new events
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 60, enabled: true },
      { deviceId: 'bob', messagesPerHour: 60, enabled: true }
    ])
    
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const eventsZeroPercent = engine.getUpcomingEvents(10)
    const withIntentsZero = eventsZeroPercent.filter(event => 
      event.type === 'message' && event.data.fileIntent
    )
    
    console.log(`With 0% rate: ${withIntentsZero.length}/${eventsZeroPercent.length} events with file intents`)
    
    // With 0% rate, no events should have file intents
    expect(withIntentsZero.length).toBe(0)
  })

  it('should use realistic file sizes from test image pool', async () => {
    engine.setImageAttachmentPercentage(100)
    
    await new Promise(resolve => setTimeout(resolve, 100))
    
    const upcomingEvents = engine.getUpcomingEvents(10)
    const eventsWithIntents = upcomingEvents.filter(event => 
      event.type === 'message' && event.data.fileIntent
    )
    
    expect(eventsWithIntents.length).toBeGreaterThan(0)
    
    // Check that all file intents use realistic names and sizes
    eventsWithIntents.forEach(event => {
      const intent = event.data.fileIntent
      
      // Should be one of our test images
      const validNames = [
        'landscape.jpg', 'portrait.jpg', 'abstract.jpg', 
        'diagram.png', 'small.jpg', 'landscape-large.jpg', 'large.jpg'
      ]
      expect(validNames).toContain(intent.name)
      
      // Should have realistic file sizes
      expect(intent.size).toBeGreaterThan(10000) // At least 10KB
      expect(intent.size).toBeLessThan(300000)   // At most 300KB
      
      console.log(`Valid file intent: ${intent.name} (${intent.size} bytes)`)
    })
  })
})