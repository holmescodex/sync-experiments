import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { UnifiedOrchestrator } from '../../src/orchestrator/UnifiedOrchestrator'
import fetch from 'node-fetch'

/**
 * Demonstrates bloom filter synchronization over UDP
 * Shows how devices discover missing messages and sync them
 */
describe('Bloom Filter Sync Demo', () => {
  let orchestrator: UnifiedOrchestrator
  let aliceUrl: string
  let bobUrl: string
  
  beforeAll(async () => {
    orchestrator = new UnifiedOrchestrator({
      devices: ['alice', 'bob'],
      mode: 'direct-udp',
      setupTrust: true,
      syncInterval: 1000, // Bloom filter exchange every second
      basePort: 9400
    })
    
    await orchestrator.start()
    
    const status = orchestrator.getStatus()
    aliceUrl = `http://localhost:${status.ports.devices.alice}`
    bobUrl = `http://localhost:${status.ports.devices.bob}`
    
    console.log('\n=== Bloom Sync Demo Started ===')
    console.log(`Alice: ${aliceUrl} (UDP: ${status.ports.udpPorts.alice})`)
    console.log(`Bob: ${bobUrl} (UDP: ${status.ports.udpPorts.bob})`)
  }, 15000)

  afterAll(async () => {
    await orchestrator.stop()
  })

  it('should sync messages via bloom filter exchange', async () => {
    console.log('\n--- Step 1: Clear all messages ---')
    await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' })
    
    // Step 1: Alice creates messages while Bob is "offline"
    console.log('\n--- Step 2: Set Bob offline ---')
    await fetch(`${bobUrl}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: false })
    })
    
    // Wait a moment for status to take effect
    await new Promise(r => setTimeout(r, 500))
    
    console.log('\n--- Step 3: Alice creates 5 messages while Bob is offline ---')
    const aliceMessages = []
    for (let i = 0; i < 5; i++) {
      const response = await fetch(`${aliceUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `Message ${i} from Alice` })
      })
      const msg = await response.json()
      aliceMessages.push(msg)
      console.log(`  Created: ${msg.id} - "Message ${i} from Alice"`)
    }
    
    // Verify Bob has no messages
    const bobOfflineResp = await fetch(`${bobUrl}/api/messages`)
    const bobOfflineData = await bobOfflineResp.json()
    console.log(`\n  Bob has ${bobOfflineData.messages.length} messages (should be 0)`)
    expect(bobOfflineData.messages.length).toBe(0)
    
    // Step 2: Bring Bob online - bloom sync should kick in
    console.log('\n--- Step 4: Bring Bob back online ---')
    await fetch(`${bobUrl}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true })
    })
    
    console.log('\n--- Step 5: Wait for bloom filter exchange ---')
    console.log('  Bloom filters will be exchanged at next sync interval...')
    console.log('  Bob will detect missing messages and request them...')
    
    // Poll for sync completion
    let syncComplete = false
    let attempts = 0
    const maxAttempts = 30 // 3 seconds
    
    while (!syncComplete && attempts < maxAttempts) {
      const bobResp = await fetch(`${bobUrl}/api/messages`)
      const bobData = await bobResp.json()
      
      if (bobData.messages.length >= 5) {
        syncComplete = true
        console.log(`\n✓ Sync complete! Bob now has ${bobData.messages.length} messages:`)
        bobData.messages.forEach((msg: any) => {
          console.log(`  - ${msg.id}: "${msg.content}" by ${msg.author}`)
        })
      } else if (attempts % 10 === 0) {
        console.log(`  Waiting... Bob has ${bobData.messages.length}/5 messages`)
      }
      
      attempts++
      await new Promise(r => setTimeout(r, 100))
    }
    
    expect(syncComplete).toBe(true)
    
    // Step 3: Show sync stats
    console.log('\n--- Step 6: Check sync statistics ---')
    const [aliceStats, bobStats] = await Promise.all([
      fetch(`${aliceUrl}/api/stats`).then(r => r.json()),
      fetch(`${bobUrl}/api/stats`).then(r => r.json())
    ])
    
    console.log(`\nAlice stats:`)
    console.log(`  Messages: ${aliceStats.messageCount}`)
    console.log(`  Sync %: ${aliceStats.syncPercentage}`)
    
    console.log(`\nBob stats:`)
    console.log(`  Messages: ${bobStats.messageCount}`)
    console.log(`  Sync %: ${bobStats.syncPercentage}`)
    
    // Both should show 100% sync
    expect(aliceStats.messageCount).toBe(bobStats.messageCount)
    expect(bobStats.syncPercentage).toBeGreaterThanOrEqual(90)
  }, 10000)

  it('should handle bidirectional bloom sync', async () => {
    console.log('\n\n=== Bidirectional Bloom Sync Demo ===')
    
    // Clear messages
    await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' })
    
    // Both create messages simultaneously
    console.log('\n--- Both devices create messages ---')
    const promises = []
    
    for (let i = 0; i < 3; i++) {
      promises.push(
        fetch(`${aliceUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `Alice message ${i}` })
        }).then(r => r.json())
      )
      
      promises.push(
        fetch(`${bobUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `Bob message ${i}` })
        }).then(r => r.json())
      )
    }
    
    const results = await Promise.all(promises)
    console.log(`  Created ${results.length} messages total`)
    
    console.log('\n--- Waiting for bloom sync to exchange all messages ---')
    
    // Poll until both have all 6 messages
    let syncComplete = false
    let attempts = 0
    
    while (!syncComplete && attempts < 50) {
      const [aliceResp, bobResp] = await Promise.all([
        fetch(`${aliceUrl}/api/messages`).then(r => r.json()),
        fetch(`${bobUrl}/api/messages`).then(r => r.json())
      ])
      
      const aliceMessages = aliceResp.messages || []
      const bobMessages = bobResp.messages || []
      
      if (aliceMessages.length >= 6 && bobMessages.length >= 6) {
        syncComplete = true
        
        console.log(`\n✓ Bidirectional sync complete!`)
        console.log(`\nAlice has ${aliceMessages.length} messages:`)
        aliceMessages.forEach((msg: any) => {
          console.log(`  - "${msg.content}" by ${msg.author}`)
        })
        
        console.log(`\nBob has ${bobMessages.length} messages:`)
        bobMessages.forEach((msg: any) => {
          console.log(`  - "${msg.content}" by ${msg.author}`)
        })
      } else if (attempts % 10 === 0) {
        console.log(`  Alice: ${aliceMessages.length}/6, Bob: ${bobMessages.length}/6`)
      }
      
      attempts++
      await new Promise(r => setTimeout(r, 100))
    }
    
    expect(syncComplete).toBe(true)
    
    console.log('\n✓ Bloom filter sync successfully synchronized all messages!')
  }, 10000)
})