import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { UnifiedOrchestrator } from '../../src/orchestrator/UnifiedOrchestrator'
import fetch from 'node-fetch'

describe('Simple UDP Test', () => {
  let orchestrator: UnifiedOrchestrator
  let aliceUrl: string
  let bobUrl: string
  
  beforeAll(async () => {
    orchestrator = new UnifiedOrchestrator({
      devices: ['alice', 'bob'],
      mode: 'direct-udp',
      setupTrust: true,
      syncInterval: 500, // Fast sync
      basePort: 9300
    })
    
    await orchestrator.start()
    
    const status = orchestrator.getStatus()
    aliceUrl = `http://localhost:${status.ports.devices.alice}`
    bobUrl = `http://localhost:${status.ports.devices.bob}`
  }, 15000)

  afterAll(async () => {
    await orchestrator.stop()
  })

  it('should send one message', async () => {
    // Send from Alice
    const response = await fetch(`${aliceUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello Bob' })
    })
    
    expect(response.ok).toBe(true)
    const sent = await response.json()
    console.log(`Sent: ${sent.id}`)
    
    // Poll Bob for the message
    let found = false
    for (let i = 0; i < 50; i++) { // 5 seconds max
      const bobResp = await fetch(`${bobUrl}/api/messages`)
      const bobData = await bobResp.json()
      
      if (bobData.messages && bobData.messages.length > 0) {
        console.log(`Bob has ${bobData.messages.length} messages`)
        found = true
        break
      }
      
      await new Promise(r => setTimeout(r, 100))
    }
    
    expect(found).toBe(true)
  }, 10000)
})