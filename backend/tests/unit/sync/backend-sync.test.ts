import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import request from 'supertest'

describe('Backend Sync', () => {
  const aliceUrl = process.env.ALICE_BACKEND_URL || 'http://localhost:3001'
  const bobUrl = process.env.BOB_BACKEND_URL || 'http://localhost:3002'
  
  beforeAll(async () => {
    // Clear messages
    await request(aliceUrl).delete('/api/messages/clear').catch(() => {})
    await request(bobUrl).delete('/api/messages/clear').catch(() => {})
    
    // Wait for sync managers to initialize
    await new Promise(resolve => setTimeout(resolve, 2000))
  })
  
  it('should sync messages between backends', async () => {
    // 1. Alice sends a message
    const aliceMessage = await request(aliceUrl)
      .post('/api/messages')
      .send({
        content: 'Hello from Alice!'
      })
    
    expect(aliceMessage.status).toBe(200)
    expect(aliceMessage.body.content).toBe('Hello from Alice!')
    
    // 2. Wait for sync to happen (bloom filter exchange + message transfer)
    console.log('[Test] Waiting for sync...')
    await new Promise(resolve => setTimeout(resolve, 8000)) // Wait for sync interval + network delay
    
    // 3. Check if Bob received Alice's message
    const bobMessages = await request(bobUrl).get('/api/messages')
    expect(bobMessages.status).toBe(200)
    expect(Array.isArray(bobMessages.body.messages)).toBe(true)
    
    console.log(`[Test] Bob has ${bobMessages.body.messages.length} messages`)
    
    const aliceMessageInBob = bobMessages.body.messages.find((m: any) => 
      m.content === 'Hello from Alice!' && m.author === 'alice'
    )
    
    expect(aliceMessageInBob).toBeDefined()
    expect(aliceMessageInBob.author).toBe('alice')
    
    // 4. Bob sends a message
    const bobMessage = await request(bobUrl)
      .post('/api/messages')
      .send({
        content: 'Hi Alice!'
      })
    
    expect(bobMessage.status).toBe(200)
    
    // 5. Wait for sync again
    console.log('[Test] Waiting for reverse sync...')
    await new Promise(resolve => setTimeout(resolve, 8000))
    
    // 6. Check if Alice received Bob's message
    const aliceMessages = await request(aliceUrl).get('/api/messages')
    expect(aliceMessages.status).toBe(200)
    
    console.log(`[Test] Alice has ${aliceMessages.body.messages.length} messages`)
    
    const bobMessageInAlice = aliceMessages.body.messages.find((m: any) => 
      m.content === 'Hi Alice!' && m.author === 'bob'
    )
    
    expect(bobMessageInAlice).toBeDefined()
    expect(bobMessageInAlice.author).toBe('bob')
    
    // Both should have 2 messages total
    expect(aliceMessages.body.messages.length).toBe(2)
    expect(bobMessages.body.messages.length).toBe(2)
  }, 20000) // 20 second timeout for this test
})