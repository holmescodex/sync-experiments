import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { UnifiedOrchestrator } from '../../src/orchestrator/UnifiedOrchestrator'
import fetch from 'node-fetch'

/**
 * Test UDP sync using UnifiedOrchestrator
 */
describe('Unified UDP Sync Test', () => {
  let orchestrator: UnifiedOrchestrator
  let aliceUrl: string
  let bobUrl: string
  
  beforeAll(async () => {
    // Create orchestrator with direct UDP mode
    orchestrator = new UnifiedOrchestrator({
      devices: ['alice', 'bob'],
      mode: 'direct-udp',
      setupTrust: true,
      syncInterval: 1000, // 1 second sync
      basePort: 9200
    })
    
    // Start everything
    await orchestrator.start()
    
    // Get device URLs
    const status = orchestrator.getStatus()
    aliceUrl = `http://localhost:${status.ports.devices.alice}`
    bobUrl = `http://localhost:${status.ports.devices.bob}`
    
    console.log(`\nOrchestrator ready!`)
    console.log(`Alice: ${aliceUrl}`)
    console.log(`Bob: ${bobUrl}`)
  }, 30000)

  afterAll(async () => {
    await orchestrator.stop()
  })

  it('should send messages between devices', async () => {
    // Clear messages
    await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' })
    
    // Alice sends 10 messages
    console.log('\nAlice sending 10 messages...')
    const sentMessages = []
    
    for (let i = 0; i < 10; i++) {
      const response = await fetch(`${aliceUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `Message ${i}` })
      })
      
      if (response.ok) {
        const msg = await response.json()
        sentMessages.push(msg)
        console.log(`Sent message ${i}: ${msg.id}`)
      }
    }
    
    // Wait for sync
    console.log('\nWaiting for P2P sync...')
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Check Bob's messages
    const bobResponse = await fetch(`${bobUrl}/api/messages`)
    const bobData = await bobResponse.json()
    const bobMessages = bobData.messages || []
    
    console.log(`\nBob received ${bobMessages.length} messages:`)
    bobMessages.forEach((m: any) => {
      console.log(`  - ${m.content} (from ${m.author})`)
    })
    
    // Should receive at least half
    expect(bobMessages.length).toBeGreaterThanOrEqual(5)
    console.log(`\n✓ Test passed: ${bobMessages.length}/10 messages synced`)
  })

  it('should sync bidirectionally', async () => {
    // Clear messages
    await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' })
    
    // Both send messages simultaneously
    console.log('\nBoth devices sending messages...')
    
    const promises = []
    for (let i = 0; i < 5; i++) {
      promises.push(
        fetch(`${aliceUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `Alice msg ${i}` })
        })
      )
      promises.push(
        fetch(`${bobUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `Bob msg ${i}` })
        })
      )
    }
    
    await Promise.all(promises)
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Check both have messages from each other
    const [aliceResp, bobResp] = await Promise.all([
      fetch(`${aliceUrl}/api/messages`).then(r => r.json()),
      fetch(`${bobUrl}/api/messages`).then(r => r.json())
    ])
    
    const aliceMessages = aliceResp.messages || []
    const bobMessages = bobResp.messages || []
    
    console.log(`\nAlice has ${aliceMessages.length} messages`)
    console.log(`Bob has ${bobMessages.length} messages`)
    
    // Both should have messages from the other
    const aliceHasBobMsg = aliceMessages.some((m: any) => m.author === 'bob')
    const bobHasAliceMsg = bobMessages.some((m: any) => m.author === 'alice')
    
    expect(aliceHasBobMsg).toBe(true)
    expect(bobHasAliceMsg).toBe(true)
    
    console.log('✓ Bidirectional sync working')
  })
})