import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'

describe('Full Sync Scenario with Event Replay', () => {
  const simUrl = process.env.SIM_ENGINE_URL || 'http://localhost:3000'
  const aliceUrl = process.env.ALICE_BACKEND_URL || 'http://localhost:3001'
  const bobUrl = process.env.BOB_BACKEND_URL || 'http://localhost:3002'
  const isOrchestrated = process.env.TEST_MODE === 'orchestrated'
  
  beforeEach(async () => {
    if (!isOrchestrated) {
      console.log('[Full Sync] Skipping - requires orchestrated test environment')
      return
    }
    // Clear all state
    await request(simUrl).delete('/api/events/clear').catch(() => {})
    await request(aliceUrl).delete('/api/messages/clear').catch(() => {})
    await request(bobUrl).delete('/api/messages/clear').catch(() => {})
  })
  
  it('should handle complete sync scenario with both devices online', async () => {
    if (!isOrchestrated) {
      console.log('[Full Sync] Skipping test - requires orchestrated environment')
      return
    }
    // 1. Record scenario: Both devices come online
    await request(simUrl).post('/api/events/record').send({
      type: 'device_status',
      device: 'alice',
      online: true
    })
    
    await request(simUrl).post('/api/events/record').send({
      type: 'device_status',
      device: 'bob',
      online: true
    })
    
    // 2. Alice sends messages
    const aliceMessages = [
      'Hey Bob, are you there?',
      'I have some updates for you',
      'Let me know when you see this'
    ]
    
    for (const content of aliceMessages) {
      await request(simUrl).post('/api/events/record').send({
        type: 'message',
        device: 'alice',
        content,
        source: 'manual'
      })
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // 3. Bob sends messages
    const bobMessages = [
      'Hi Alice!',
      'Yes, I am here',
      'What updates do you have?'
    ]
    
    for (const content of bobMessages) {
      await request(simUrl).post('/api/events/record').send({
        type: 'message',
        device: 'bob',
        content,
        source: 'manual'
      })
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // 4. Save this scenario
    await request(simUrl).post('/api/scenarios/save').send({
      name: 'full-sync-scenario',
      description: 'Complete conversation with both devices online'
    })
    
    // 5. Clear all databases
    await request(aliceUrl).delete('/api/messages/clear')
    await request(bobUrl).delete('/api/messages/clear')
    
    // 6. Replay the scenario
    const replayResponse = await request(simUrl)
      .post('/api/replay/start')
      .send({
        scenario: 'full-sync-scenario.jsonl',
        mode: 'test',
        speed: 50 // Fast replay
      })
    
    expect(replayResponse.status).toBe(200)
    
    // 7. Wait for replay to complete (test mode runs fast)
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // 8. Verify Alice's database state
    const aliceFinalState = await request(aliceUrl).get('/api/messages')
    expect(aliceFinalState.body.messages).toBeDefined()
    expect(Array.isArray(aliceFinalState.body.messages)).toBe(true)
    
    // Alice should have all her messages
    for (const msg of aliceMessages) {
      const found = aliceFinalState.body.messages.find((m: any) => 
        m.content === msg && m.author === 'alice'
      )
      expect(found).toBeDefined()
      expect(found.author).toBe('alice')
    }
    
    // Alice should also have Bob's messages if sync worked
    console.log(`[Test] Checking if Alice has Bob's messages...`)
    for (const msg of bobMessages) {
      const found = aliceFinalState.body.messages.find((m: any) => 
        m.content === msg && m.author === 'bob'
      )
      expect(found).toBeDefined()
      expect(found.author).toBe('bob')
    }
    
    // 9. Verify Bob's database state  
    const bobFinalState = await request(bobUrl).get('/api/messages')
    expect(bobFinalState.body.messages).toBeDefined()
    expect(Array.isArray(bobFinalState.body.messages)).toBe(true)
    
    // Bob should have all his messages
    for (const msg of bobMessages) {
      const found = bobFinalState.body.messages.find((m: any) => 
        m.content === msg && m.author === 'bob'
      )
      expect(found).toBeDefined()
      expect(found.author).toBe('bob')
    }
    
    // Bob should also have Alice's messages if sync worked
    console.log(`[Test] Checking if Bob has Alice's messages...`)
    for (const msg of aliceMessages) {
      const found = bobFinalState.body.messages.find((m: any) => 
        m.content === msg && m.author === 'alice'
      )
      expect(found).toBeDefined()
      expect(found.author).toBe('alice')
    }
    
    // 10. Verify message counts - both should have all messages
    expect(aliceFinalState.body.messages.length).toBe(aliceMessages.length + bobMessages.length)
    expect(bobFinalState.body.messages.length).toBe(aliceMessages.length + bobMessages.length)
    
    console.log(`[Test] Alice has ${aliceFinalState.body.messages.length} total messages`)
    console.log(`[Test] Bob has ${bobFinalState.body.messages.length} total messages`)
    console.log('[Test] Full sync verified - both devices have all messages!')
  })
  
  it('should maintain message ordering after replay', async () => {
    if (!isOrchestrated) {
      console.log('[Full Sync] Skipping test - requires orchestrated environment')
      return
    }
    // Create a scenario with specific message ordering
    const messages = [
      { device: 'alice', content: 'First message', ts: 1000 },
      { device: 'bob', content: 'Second message', ts: 2000 },
      { device: 'alice', content: 'Third message', ts: 3000 },
      { device: 'bob', content: 'Fourth message', ts: 4000 }
    ]
    
    // Record messages in order
    for (const msg of messages) {
      await request(simUrl).post('/api/events/record').send({
        type: 'message',
        device: msg.device,
        content: msg.content,
        source: 'manual'
      })
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Save scenario
    await request(simUrl).post('/api/scenarios/save').send({
      name: 'ordered-messages'
    })
    
    // Clear and replay
    await request(aliceUrl).delete('/api/messages/clear')
    await request(bobUrl).delete('/api/messages/clear')
    
    await request(simUrl).post('/api/replay/start').send({
      scenario: 'ordered-messages.jsonl',
      mode: 'test',
      speed: 100
    })
    
    // Wait for completion (test mode runs fast)
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Verify ordering
    const aliceState = await request(aliceUrl).get('/api/messages')
    const bobState = await request(bobUrl).get('/api/messages')
    
    // Get all messages and sort by content to check ordering
    const aliceMessages = aliceState.body.messages
      .filter((m: any) => m.author === 'alice')
      .sort((a: any, b: any) => a.timestamp - b.timestamp)
    
    const bobMessages = bobState.body.messages
      .filter((m: any) => m.author === 'bob')
      .sort((a: any, b: any) => a.timestamp - b.timestamp)
    
    // Verify order
    expect(aliceMessages[0]?.content).toBe('First message')
    expect(aliceMessages[1]?.content).toBe('Third message')
    expect(bobMessages[0]?.content).toBe('Second message')
    expect(bobMessages[1]?.content).toBe('Fourth message')
  })
})