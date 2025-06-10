import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('Manual Message File Attachment Bug', () => {
  let engine: SimulationEngine

  beforeEach(async () => {
    engine = new SimulationEngine()
    
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false },
      { deviceId: 'bob', messagesPerHour: 0, enabled: false }
    ])
  })

  it('should NOT add file attachments to manual messages even with high image percentage', async () => {
    console.log('\n=== Testing Manual Message File Bug ===')
    
    // Step 1: Set image attachment percentage to 100% for automatic messages
    engine.setImageAttachmentPercentage(100)
    console.log('[TEST] Set image attachment percentage to 100%')
    
    // Step 2: Create a manual message (this should NOT get file attachments)
    await engine.createMessageEvent('alice', 'Manual message from user', engine.currentSimTime() + 100)
    console.log('[TEST] Created manual message event')
    
    // Step 3: Check the upcoming event BEFORE execution
    const upcomingEvents = engine.getUpcomingEvents(5)
    console.log(`[TEST] Upcoming events: ${upcomingEvents.length}`)
    
    if (upcomingEvents.length > 0) {
      const manualEvent = upcomingEvents[0]
      console.log(`[TEST] Manual event content: "${manualEvent.data.content}"`)
      console.log(`[TEST] Manual event has fileIntent: ${!!manualEvent.data.fileIntent}`)
      console.log(`[TEST] Manual event has attachments: ${!!manualEvent.data.attachments}`)
      
      if (manualEvent.data.fileIntent) {
        console.log(`[BUG] Manual message incorrectly got fileIntent: ${JSON.stringify(manualEvent.data.fileIntent)}`)
      }
      
      // BUG: Manual messages should NEVER get fileIntent, regardless of imageAttachmentPercentage
      expect(manualEvent.data.fileIntent).toBeUndefined()
    }
    
    // Step 4: Execute the event
    for (let i = 0; i < 10; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 10))
      
      const events = await engine.getDeviceDatabase('alice')!.getAllEvents()
      if (events.length > 0) {
        console.log(`[TEST] Event executed after ${i + 1} ticks`)
        break
      }
    }
    
    // Step 5: Check the executed event (should have NO attachments)
    const aliceDB = engine.getDeviceDatabase('alice')!
    const events = await aliceDB.getAllEvents()
    
    console.log(`[TEST] Alice has ${events.length} events after execution`)
    
    const messageEvents = events.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'message'
      } catch { return false }
    })
    
    expect(messageEvents.length).toBe(1)
    
    const messagePayload = JSON.parse(new TextDecoder().decode(messageEvents[0].encrypted))
    console.log(`[TEST] Message content: "${messagePayload.content}"`)
    console.log(`[TEST] Message has attachments: ${!!messagePayload.attachments}`)
    
    if (messagePayload.attachments) {
      console.log(`[BUG] Manual message incorrectly got attachments: ${JSON.stringify(messagePayload.attachments)}`)
    }
    
    // BUG: Manual messages should NEVER get attachments from automatic generation
    expect(messagePayload.attachments).toBeUndefined()
    
    // Step 6: Verify file chunks were NOT created
    const chunkEvents = events.filter(event => {
      try {
        const payload = JSON.parse(new TextDecoder().decode(event.encrypted))
        return payload.type === 'file_chunk'
      } catch { return false }
    })
    
    console.log(`[TEST] File chunks created: ${chunkEvents.length}`)
    
    // BUG: Manual messages should not create file chunks
    expect(chunkEvents.length).toBe(0)
    
    console.log('\n=== Manual Message Test PASSED (if no bug) ===')
  })

  it('should add file attachments to AUTOMATIC messages with high image percentage', async () => {
    console.log('\n=== Testing Automatic Message File Generation ===')
    
    // Step 1: Set image attachment percentage to 100%
    engine.setImageAttachmentPercentage(100)
    console.log('[TEST] Set image attachment percentage to 100%')
    
    // Step 2: Enable automatic generation for alice
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 120, enabled: true }, // High frequency for fast test
    ])
    
    console.log('[TEST] Enabled automatic message generation')
    
    // Step 3: Wait for automatic events to be generated
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const upcomingEvents = engine.getUpcomingEvents(10)
    console.log(`[TEST] Auto-generated upcoming events: ${upcomingEvents.length}`)
    
    // Step 4: Check that automatic events DO get file intents
    const eventsWithFileIntents = upcomingEvents.filter(e => e.data.fileIntent)
    console.log(`[TEST] Auto events with file intents: ${eventsWithFileIntents.length}`)
    
    // Automatic events SHOULD get file intents with 100% rate
    expect(eventsWithFileIntents.length).toBeGreaterThan(0)
    
    if (eventsWithFileIntents.length > 0) {
      const autoEvent = eventsWithFileIntents[0]
      console.log(`[TEST] Auto event fileIntent: ${JSON.stringify(autoEvent.data.fileIntent)}`)
    }
    
    console.log('\n=== Automatic Message Test PASSED ===')
  })
})