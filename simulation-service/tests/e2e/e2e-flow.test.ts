import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import fs from 'fs'
import path from 'path'

describe('E2E Message Flow with Event Recording', () => {
  const simUrl = process.env.SIM_ENGINE_URL || 'http://localhost:3000'
  const aliceUrl = process.env.ALICE_BACKEND_URL || 'http://localhost:3001'
  const bobUrl = process.env.BOB_BACKEND_URL || 'http://localhost:3002'
  const isOrchestrated = process.env.TEST_MODE === 'orchestrated'
  
  beforeEach(async () => {
    if (!isOrchestrated) {
      console.log('[E2E Flow] Skipping - requires orchestrated test environment')
      return
    }
    // Clear all state
    await request(simUrl).delete('/api/events/clear').catch(() => {})
    await request(aliceUrl).delete('/api/messages/clear').catch(() => {})
    await request(bobUrl).delete('/api/messages/clear').catch(() => {})
  })
  
  it('should record manual messages sent through backend', async () => {
    if (!isOrchestrated) {
      console.log('[E2E Flow] Skipping test - requires orchestrated environment')
      return
    }
    // Alice sends a message through her backend
    const messageResponse = await request(aliceUrl)
      .post('/api/messages')
      .send({
        content: 'Hello from Alice backend',
        attachments: []
      })
    
    expect(messageResponse.status).toBe(200)
    
    // Wait a bit for async recording
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Check that event was recorded (would normally be done by frontend)
    // For now, we verify by checking the event file exists
    const eventFile = path.join(__dirname, '../../../events/current.jsonl')
    const fileExists = fs.existsSync(eventFile)
    expect(fileExists).toBe(true)
  })
  
  it('should handle complete message flow scenario', async () => {
    // 1. Alice comes online (would be recorded by frontend)
    await request(simUrl).post('/api/events/record').send({
      type: 'device_status',
      device: 'alice',
      online: true
    })
    
    // 2. Bob comes online
    await request(simUrl).post('/api/events/record').send({
      type: 'device_status',
      device: 'bob',
      online: true
    })
    
    // 3. Alice sends a message
    await request(aliceUrl).post('/api/messages').send({
      content: 'Hello Bob!'
    })
    
    // Record this as an event (frontend would do this)
    await request(simUrl).post('/api/events/record').send({
      type: 'message',
      device: 'alice',
      content: 'Hello Bob!',
      source: 'manual'
    })
    
    // 4. Wait for sync (in real scenario)
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // 5. Bob sends a reply
    await request(bobUrl).post('/api/messages').send({
      content: 'Hi Alice!'
    })
    
    await request(simUrl).post('/api/events/record').send({
      type: 'message',
      device: 'bob',
      content: 'Hi Alice!',
      source: 'manual'
    })
    
    // 6. Save this as a scenario
    const saveResponse = await request(simUrl)
      .post('/api/scenarios/save')
      .send({
        name: 'alice-bob-conversation',
        description: 'Simple conversation between Alice and Bob'
      })
    
    expect(saveResponse.status).toBe(200)
    
    // Verify scenario was saved
    const scenarios = await request(simUrl).get('/api/scenarios')
    const savedScenario = scenarios.body.scenarios.find((s: any) => s.name === 'alice-bob-conversation')
    expect(savedScenario).toBeDefined()
    expect(savedScenario.eventCount).toBeGreaterThanOrEqual(4) // At least 2 status + 2 messages
  })
  
  it('should replay saved scenario and reproduce state', async () => {
    if (!isOrchestrated) {
      console.log('[E2E Flow] Skipping test - requires orchestrated environment')
      return
    }
    // First create a scenario with some messages
    const messages = [
      { device: 'alice', content: 'Message 1' },
      { device: 'bob', content: 'Reply 1' },
      { device: 'alice', content: 'Message 2' },
      { device: 'bob', content: 'Reply 2' }
    ]
    
    // Record all messages
    for (const msg of messages) {
      await request(simUrl).post('/api/events/record').send({
        type: 'message',
        ...msg,
        source: 'manual'
      })
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Save scenario
    await request(simUrl).post('/api/scenarios/save').send({
      name: 'replay-scenario'
    })
    
    // Clear all state
    await request(aliceUrl).delete('/api/messages/clear')
    await request(bobUrl).delete('/api/messages/clear')
    await request(simUrl).delete('/api/events/clear')
    
    // Verify databases are empty
    const aliceEmpty = await request(aliceUrl).get('/api/messages')
    const bobEmpty = await request(bobUrl).get('/api/messages')
    expect(Array.isArray(aliceEmpty.body)).toBe(true)
    expect(aliceEmpty.body.length).toBe(0)
    expect(Array.isArray(bobEmpty.body)).toBe(true)
    expect(bobEmpty.body.length).toBe(0)
    
    // Start replay
    const replayResponse = await request(simUrl)
      .post('/api/replay/start')
      .send({
        scenario: 'replay-scenario.jsonl',
        mode: 'test',
        speed: 100 // Very fast for testing
      })
    
    expect(replayResponse.status).toBe(200)
    
    // Wait for replay to complete
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Verify state was reproduced
    const aliceFinal = await request(aliceUrl).get('/api/messages')
    const bobFinal = await request(bobUrl).get('/api/messages')
    
    // Alice should have her messages
    const aliceMessages = aliceFinal.body.filter((m: any) => m.author === 'alice')
    expect(aliceMessages.length).toBe(2)
    expect(aliceMessages[0].content).toBe('Message 1')
    expect(aliceMessages[1].content).toBe('Message 2')
    
    // Bob should have his messages
    const bobMessages = bobFinal.body.filter((m: any) => m.author === 'bob')
    expect(bobMessages.length).toBe(2)
    expect(bobMessages[0].content).toBe('Reply 1')
    expect(bobMessages[1].content).toBe('Reply 2')
  })
})