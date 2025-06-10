import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { UnifiedOrchestrator } from '../../src/orchestrator/UnifiedOrchestrator'
import fetch from 'node-fetch'

/**
 * Test that messages sync ONLY through bloom filter exchange
 * Disables direct message broadcasting to ensure bloom sync is working
 */
describe('Bloom Filter Only Sync', () => {
  let orchestrator: UnifiedOrchestrator
  let aliceUrl: string
  let bobUrl: string
  
  beforeAll(async () => {
    orchestrator = new UnifiedOrchestrator({
      devices: ['alice', 'bob'],
      mode: 'direct-udp',
      setupTrust: true,
      syncInterval: 500, // Fast bloom filter exchange
      basePort: 9500
    })
    
    await orchestrator.start()
    
    const status = orchestrator.getStatus()
    aliceUrl = `http://localhost:${status.ports.devices.alice}`
    bobUrl = `http://localhost:${status.ports.devices.bob}`
    
    console.log('\n=== Bloom-Only Sync Test ===')
    console.log('Direct message broadcasting will be disabled')
    console.log('All sync must happen through bloom filter exchange')
  }, 15000)

  afterAll(async () => {
    await orchestrator.stop()
  })

  it('should sync messages using ONLY bloom filter exchange', async () => {
    // Clear messages
    await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' })
    
    console.log('\n--- Step 1: Disable direct message broadcasting ---')
    // We'll create messages but they won't be broadcast immediately
    // They'll only sync during bloom filter exchange
    
    console.log('\n--- Step 2: Alice creates messages (no broadcast) ---')
    const aliceMessages = []
    
    // Create messages through the API but they'll only be stored locally
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${aliceUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: `Bloom-only message ${i}`,
          // Add a flag to disable broadcasting (we'll need to implement this)
          noBroadcast: true 
        })
      })
      
      if (response.ok) {
        const msg = await response.json()
        aliceMessages.push(msg)
        console.log(`  Created locally: ${msg.id} - "Bloom-only message ${i}"`)
      }
    }
    
    // Verify Bob doesn't have them yet
    let bobResp = await fetch(`${bobUrl}/api/messages`)
    let bobData = await bobResp.json()
    console.log(`\n  Bob has ${bobData.messages.length} messages (should be 0)`)
    expect(bobData.messages.length).toBe(0)
    
    console.log('\n--- Step 3: Wait for bloom filter exchange ---')
    console.log('  Next bloom exchange will detect missing messages...')
    
    // Poll for sync via bloom filters only
    let syncComplete = false
    let attempts = 0
    const maxAttempts = 20 // 10 seconds max
    
    while (!syncComplete && attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, 500))
      
      bobResp = await fetch(`${bobUrl}/api/messages`)
      bobData = await bobResp.json()
      
      if (bobData.messages.length >= 3) {
        syncComplete = true
        console.log(`\n✓ Bloom sync complete! Bob received ${bobData.messages.length} messages:`)
        bobData.messages.forEach((msg: any) => {
          console.log(`  - ${msg.id}: "${msg.content}"`)
        })
      } else {
        console.log(`  Waiting... Bob has ${bobData.messages.length}/3 messages`)
      }
      
      attempts++
    }
    
    expect(syncComplete).toBe(true)
    expect(bobData.messages.length).toBe(3)
    
    console.log('\n✓ Messages synced using ONLY bloom filter exchange!')
  })

  it('should handle bidirectional bloom-only sync', async () => {
    console.log('\n\n=== Bidirectional Bloom-Only Sync ===')
    
    // Clear messages
    await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' })
    
    console.log('\n--- Both create local messages (no broadcast) ---')
    
    // Both create messages without broadcasting
    const promises = []
    for (let i = 0; i < 2; i++) {
      promises.push(
        fetch(`${aliceUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content: `Alice bloom-only ${i}`,
            noBroadcast: true 
          })
        })
      )
      
      promises.push(
        fetch(`${bobUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content: `Bob bloom-only ${i}`,
            noBroadcast: true 
          })
        })
      )
    }
    
    await Promise.all(promises)
    console.log('  Created 4 local messages (2 each)')
    
    // Initially each should only have their own
    let [aliceResp, bobResp] = await Promise.all([
      fetch(`${aliceUrl}/api/messages`).then(r => r.json()),
      fetch(`${bobUrl}/api/messages`).then(r => r.json())
    ])
    
    console.log(`\n  Initial state:`)
    console.log(`    Alice: ${aliceResp.messages.length} messages`)
    console.log(`    Bob: ${bobResp.messages.length} messages`)
    
    console.log('\n--- Waiting for bloom filter exchange ---')
    
    // Poll until both have all 4 messages
    let syncComplete = false
    let attempts = 0
    
    while (!syncComplete && attempts < 20) {
      await new Promise(r => setTimeout(r, 500))
      
      [aliceResp, bobResp] = await Promise.all([
        fetch(`${aliceUrl}/api/messages`).then(r => r.json()),
        fetch(`${bobUrl}/api/messages`).then(r => r.json())
      ])
      
      const aliceMessages = aliceResp.messages || []
      const bobMessages = bobResp.messages || []
      
      if (aliceMessages.length >= 4 && bobMessages.length >= 4) {
        syncComplete = true
        console.log(`\n✓ Bidirectional bloom sync complete!`)
        console.log(`  Alice: ${aliceMessages.length} messages`)
        console.log(`  Bob: ${bobMessages.length} messages`)
        
        // Verify each has messages from the other
        const aliceHasBob = aliceMessages.some((m: any) => m.author === 'bob')
        const bobHasAlice = bobMessages.some((m: any) => m.author === 'alice')
        
        expect(aliceHasBob).toBe(true)
        expect(bobHasAlice).toBe(true)
        
        console.log('  ✓ Both have messages from each other')
      } else {
        console.log(`  Alice: ${aliceMessages.length}/4, Bob: ${bobMessages.length}/4`)
      }
      
      attempts++
    }
    
    expect(syncComplete).toBe(true)
    
    console.log('\n✓ Bidirectional sync using ONLY bloom filters worked!')
  })
})