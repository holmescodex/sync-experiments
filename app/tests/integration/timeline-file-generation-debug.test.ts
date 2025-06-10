import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('Timeline File Generation Debug', () => {
  let engine: SimulationEngine

  beforeEach(async () => {
    engine = new SimulationEngine()
    
    // Initialize devices
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false },
      { deviceId: 'bob', messagesPerHour: 0, enabled: false }
    ])
  })

  it('should debug why automatic file generation is not working', async () => {
    console.log('\n=== Debugging Automatic File Generation ===')
    
    // Step 1: Set 100% file attachment rate
    engine.setImageAttachmentPercentage(100)
    console.log('[DEBUG] Set image attachment percentage to 100%')
    
    // Step 2: Create a message event manually
    await engine.createMessageEvent('alice', 'Test message', engine.currentSimTime() + 100)
    console.log('[DEBUG] Created message event manually')
    
    // Step 3: Check upcoming events
    const upcomingEvents = engine.getUpcomingEvents(5)
    console.log(`[DEBUG] Upcoming events: ${upcomingEvents.length}`)
    
    upcomingEvents.forEach((event, i) => {
      console.log(`[DEBUG] Event ${i}: ${event.deviceId} - "${event.data.content}"`)
      console.log(`[DEBUG]   - hasFileIntent: ${!!event.data.fileIntent}`)
      if (event.data.fileIntent) {
        console.log(`[DEBUG]   - fileIntent: ${JSON.stringify(event.data.fileIntent)}`)
      }
    })
    
    // Step 4: Execute the event and see what happens
    console.log('\n--- Executing Event ---')
    
    let eventsBeforeExecution = await engine.getDeviceDatabase('alice')!.getAllEvents()
    console.log(`[DEBUG] Alice DB before execution: ${eventsBeforeExecution.length} events`)
    
    // Execute by advancing time
    for (let i = 0; i < 10; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const events = await engine.getDeviceDatabase('alice')!.getAllEvents()
      if (events.length > eventsBeforeExecution.length) {
        console.log(`[DEBUG] Event executed after ${i + 1} ticks`)
        break
      }
    }
    
    let eventsAfterExecution = await engine.getDeviceDatabase('alice')!.getAllEvents()
    console.log(`[DEBUG] Alice DB after execution: ${eventsAfterExecution.length} events`)
    
    // Step 5: Analyze what was created
    if (eventsAfterExecution.length > 0) {
      console.log('\n--- Analyzing Created Events ---')
      
      for (const event of eventsAfterExecution) {
        try {
          const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
          console.log(`[DEBUG] Event ${event.event_id}: type=${payload.type}`)
          
          if (payload.type === 'message') {
            console.log(`[DEBUG]   - content: "${payload.content}"`)
            console.log(`[DEBUG]   - hasAttachments: ${!!payload.attachments}`)
            if (payload.attachments) {
              console.log(`[DEBUG]   - attachments: ${JSON.stringify(payload.attachments, null, 2)}`)
            }
          } else if (payload.type === 'file_chunk') {
            console.log(`[DEBUG]   - prfTag: ${payload.prfTag}`)
            console.log(`[DEBUG]   - chunkData length: ${payload.chunkData?.length || 0}`)
          }
        } catch (error) {
          console.log(`[DEBUG] Failed to parse event ${event.event_id}: ${error}`)
        }
      }
    }
    
    // Step 6: Test with automatic event generation
    console.log('\n--- Testing Automatic Event Generation ---')
    
    // Enable automatic generation with high frequency
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 120, enabled: true }, // 2 per minute
    ])
    
    console.log('[DEBUG] Enabled automatic generation (120 msg/hour)')
    
    // Wait for automatic events to generate
    await new Promise(resolve => setTimeout(resolve, 300))
    
    const autoEvents = engine.getUpcomingEvents(10)
    console.log(`[DEBUG] Auto-generated events: ${autoEvents.length}`)
    
    const autoEventsWithFileIntents = autoEvents.filter(e => e.data.fileIntent)
    console.log(`[DEBUG] Auto events with file intents: ${autoEventsWithFileIntents.length}`)
    
    autoEventsWithFileIntents.forEach((event, i) => {
      console.log(`[DEBUG] Auto event ${i}: "${event.data.content}"`)
      console.log(`[DEBUG]   - fileIntent: ${JSON.stringify(event.data.fileIntent)}`)
    })
    
    // Expect some events to have file intents with 100% rate
    expect(autoEventsWithFileIntents.length).toBeGreaterThan(0)
    
    console.log('\n=== Debug Complete ===')
  })

  it('should test the actual processFileIntent method', async () => {
    console.log('\n=== Testing processFileIntent Method ===')
    
    // Create a test file intent
    const testFileIntent = {
      name: 'test-file.jpg',
      size: 1000,
      type: 'image/jpeg'
    }
    
    console.log(`[DEBUG] Testing file intent: ${JSON.stringify(testFileIntent)}`)
    
    // Try to access the processFileIntent method directly
    // Note: This is a private method, so we need to test it indirectly
    
    // Create an event with file intent
    await engine.createMessageEvent('alice', 'Test with file intent', engine.currentSimTime() + 100)
    
    // Manually add file intent to the event
    const upcomingEvents = engine.getUpcomingEvents(5)
    if (upcomingEvents.length > 0) {
      upcomingEvents[0].data.fileIntent = testFileIntent
      console.log('[DEBUG] Manually added file intent to event')
    }
    
    // Execute the event
    console.log('[DEBUG] Executing event with file intent...')
    
    for (let i = 0; i < 15; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 20))
      
      const events = await engine.getDeviceDatabase('alice')!.getAllEvents()
      if (events.length > 0) {
        console.log(`[DEBUG] Events created after ${i + 1} ticks: ${events.length}`)
        
        // Check for file chunks
        const chunkEvents = events.filter(event => {
          try {
            const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
            return payload.type === 'file_chunk'
          } catch { return false }
        })
        
        if (chunkEvents.length > 0) {
          console.log(`[DEBUG] ✅ File chunks created: ${chunkEvents.length}`)
          
          // Check message event for attachment
          const messageEvents = events.filter(event => {
            try {
              const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
              return payload.type === 'message' && payload.attachments
            } catch { return false }
          })
          
          if (messageEvents.length > 0) {
            const messagePayload = JSON.parse(new TextDecoder().decode(messageEvents[0].encrypted))
            console.log('[DEBUG] ✅ Message with attachment created')
            console.log(`[DEBUG] Attachment: ${JSON.stringify(messagePayload.attachments[0], null, 2)}`)
          }
          
          break
        }
      }
    }
    
    const finalEvents = await engine.getDeviceDatabase('alice')!.getAllEvents()
    console.log(`[DEBUG] Final event count: ${finalEvents.length}`)
    
    const chunkEvents = finalEvents.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'file_chunk'
      } catch { return false }
    })
    
    console.log(`[DEBUG] Final chunk count: ${chunkEvents.length}`)
    expect(chunkEvents.length).toBeGreaterThan(0)
    
    console.log('\n=== processFileIntent Test Complete ===')
  })
})