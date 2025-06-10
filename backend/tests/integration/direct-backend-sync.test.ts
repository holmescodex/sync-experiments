import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import fetch from 'node-fetch'
import { findAvailablePorts } from '../../src/utils/port-finder'

/**
 * Direct backend-to-backend sync test
 * Tests bloom filter sync WITHOUT message broadcasting
 * Proves that sync works purely through bloom filter exchange
 */
describe('Direct Backend Sync (No Broadcast)', () => {
  let aliceProcess: ChildProcess
  let bobProcess: ChildProcess
  let alicePort: number
  let bobPort: number
  let aliceUdpPort: number
  let bobUdpPort: number
  let aliceUrl: string
  let bobUrl: string
  
  beforeAll(async () => {
    // Find available ports
    const ports = await findAvailablePorts(9600, 4)
    alicePort = ports[0]
    bobPort = ports[1]
    aliceUdpPort = ports[2]
    bobUdpPort = ports[3]
    
    aliceUrl = `http://localhost:${alicePort}`
    bobUrl = `http://localhost:${bobPort}`
    
    console.log('\n=== Direct Backend Sync Test ===')
    console.log('Testing bloom filter sync with broadcasting DISABLED')
    console.log(`Alice: HTTP ${alicePort}, UDP ${aliceUdpPort}`)
    console.log(`Bob: HTTP ${bobPort}, UDP ${bobUdpPort}`)
    
    // Start Alice backend
    aliceProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      env: {
        ...process.env,
        DEVICE_ID: 'alice',
        PORT: alicePort.toString(),
        UDP_PORT: aliceUdpPort.toString(),
        SYNC_INTERVAL: '500', // Fast sync for testing
        DISABLE_MESSAGE_BROADCAST: 'true' // Key setting!
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    
    // Log Alice output for debugging
    aliceProcess.stdout?.on('data', (data) => {
      console.log(`[Alice]: ${data.toString()}`)
    })
    aliceProcess.stderr?.on('data', (data) => {
      console.error(`[Alice ERROR]: ${data.toString()}`)
    })
    
    // Start Bob backend
    bobProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      env: {
        ...process.env,
        DEVICE_ID: 'bob',
        PORT: bobPort.toString(),
        UDP_PORT: bobUdpPort.toString(),
        SYNC_INTERVAL: '500',
        DISABLE_MESSAGE_BROADCAST: 'true' // Key setting!
      },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    
    // Log Bob output for debugging
    bobProcess.stdout?.on('data', (data) => {
      console.log(`[Bob]: ${data.toString()}`)
    })
    bobProcess.stderr?.on('data', (data) => {
      console.error(`[Bob ERROR]: ${data.toString()}`)
    })
    
    // Set up trust between devices
    console.log('\n--- Setting up trust ---')
    await waitForBackend(aliceUrl)
    await waitForBackend(bobUrl)
    
    // Exchange trust
    await fetch(`${aliceUrl}/api/add-peer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'bob',
        address: 'localhost',
        port: bobUdpPort
      })
    })
    
    await fetch(`${bobUrl}/api/add-peer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        deviceId: 'alice',
        address: 'localhost',
        port: aliceUdpPort
      })
    })
    
    console.log('✓ Trust established')
  }, 30000)
  
  afterAll(async () => {
    aliceProcess?.kill()
    bobProcess?.kill()
    
    // Wait for processes to clean up
    await new Promise(r => setTimeout(r, 1000))
  })
  
  async function waitForBackend(url: string, maxAttempts = 30) {
    console.log(`Waiting for backend at ${url}...`)
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(`${url}/api/health`)
        if (response.ok) {
          console.log(`Backend at ${url} is ready`)
          return
        }
        console.log(`Backend at ${url} returned ${response.status}`)
      } catch (error: any) {
        // Expected while starting
        if (i % 10 === 0) {
          console.log(`Still waiting for ${url}... (${error.message})`)
        }
      }
      await new Promise(r => setTimeout(r, 100))
    }
    throw new Error(`Backend at ${url} failed to start after ${maxAttempts} attempts`)
  }
  
  it('should sync messages using ONLY bloom filters (no broadcast)', async () => {
    console.log('\n\n=== Test: Bloom-Only Sync ===')
    
    // Wait a bit for backends to fully initialize
    await new Promise(r => setTimeout(r, 1000))
    
    // Clear any existing messages
    const clearAlice = await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' })
    if (!clearAlice.ok) {
      console.error(`Failed to clear Alice messages: ${clearAlice.status} ${clearAlice.statusText}`)
    }
    
    const clearBob = await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' })
    if (!clearBob.ok) {
      console.error(`Failed to clear Bob messages: ${clearBob.status} ${clearBob.statusText}`)
    }
    
    console.log('\n--- Step 1: Alice creates messages (broadcast disabled) ---')
    const aliceMessages = []
    
    for (let i = 0; i < 3; i++) {
      const response = await fetch(`${aliceUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: `Bloom-only message ${i}`
        })
      })
      
      if (response.ok) {
        const msg = await response.json()
        aliceMessages.push(msg)
        console.log(`  Created: ${msg.id} - "${msg.content}"`)
      }
    }
    
    // Verify Bob doesn't have them immediately (no broadcast)
    await new Promise(r => setTimeout(r, 200))
    let bobResp = await fetch(`${bobUrl}/api/messages`)
    
    // Check if response is OK before parsing JSON
    if (!bobResp.ok) {
      console.error(`Failed to get Bob messages: ${bobResp.status} ${bobResp.statusText}`)
      const text = await bobResp.text()
      console.error(`Response body: ${text.substring(0, 200)}...`)
      throw new Error(`Failed to get messages from Bob: ${bobResp.status}`)
    }
    
    let bobData = await bobResp.json()
    console.log(`\n  Bob has ${bobData.messages.length} messages (should be 0 - no broadcast)`)
    expect(bobData.messages.length).toBe(0)
    
    console.log('\n--- Step 2: Wait for bloom filter exchange ---')
    console.log('  Bloom filters will be exchanged at next sync interval...')
    console.log('  Bob will detect missing messages via bloom filter and request them...')
    
    // Poll for sync via bloom filters
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
  }, 20000)
  
  it('should handle offline/online sync with bloom filters only', async () => {
    console.log('\n\n=== Test: Offline/Online Bloom Sync ===')
    
    // Clear messages
    await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' })
    
    console.log('\n--- Step 1: Set Bob offline ---')
    await fetch(`${bobUrl}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: false })
    })
    
    await new Promise(r => setTimeout(r, 500))
    
    console.log('\n--- Step 2: Alice creates messages while Bob is offline ---')
    const offlineMessages = []
    
    for (let i = 0; i < 5; i++) {
      const response = await fetch(`${aliceUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          content: `Offline message ${i}`
        })
      })
      
      if (response.ok) {
        const msg = await response.json()
        offlineMessages.push(msg)
        console.log(`  Created: "${msg.content}"`)
      }
    }
    
    // Verify Bob has no messages
    let bobResp = await fetch(`${bobUrl}/api/messages`)
    let bobData = await bobResp.json()
    console.log(`\n  Bob has ${bobData.messages.length} messages (should be 0 - offline)`)
    expect(bobData.messages.length).toBe(0)
    
    console.log('\n--- Step 3: Bring Bob back online ---')
    await fetch(`${bobUrl}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true })
    })
    
    console.log('\n--- Step 4: Wait for bloom sync (no broadcast) ---')
    console.log('  Bob will exchange bloom filters and detect missing messages...')
    
    // Poll for sync
    let syncComplete = false
    let attempts = 0
    
    while (!syncComplete && attempts < 30) {
      await new Promise(r => setTimeout(r, 500))
      
      bobResp = await fetch(`${bobUrl}/api/messages`)
      bobData = await bobResp.json()
      
      if (bobData.messages.length >= 5) {
        syncComplete = true
        console.log(`\n✓ Offline sync complete! Bob received ${bobData.messages.length} messages`)
      } else {
        console.log(`  Bob has ${bobData.messages.length}/5 messages`)
      }
      
      attempts++
    }
    
    expect(syncComplete).toBe(true)
    expect(bobData.messages.length).toBe(5)
    
    console.log('\n✓ Offline messages synced using ONLY bloom filters!')
  }, 30000)
  
  it('should handle bidirectional bloom-only sync', async () => {
    console.log('\n\n=== Test: Bidirectional Bloom-Only Sync ===')
    
    // Clear messages
    await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' })
    
    console.log('\n--- Both create messages (no broadcast) ---')
    
    // Both create messages simultaneously
    const promises = []
    for (let i = 0; i < 2; i++) {
      promises.push(
        fetch(`${aliceUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content: `Alice bloom ${i}`
          })
        })
      )
      
      promises.push(
        fetch(`${bobUrl}/api/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            content: `Bob bloom ${i}`
          })
        })
      )
    }
    
    await Promise.all(promises)
    console.log('  Created 4 messages (2 each)')
    
    // Initially each should only have their own
    let aliceResp = await fetch(`${aliceUrl}/api/messages`).then(r => r.json())
    let bobResp = await fetch(`${bobUrl}/api/messages`).then(r => r.json())
    
    console.log(`\n  Initial state:`)
    console.log(`    Alice: ${aliceResp.messages.length} messages (own messages only)`)
    console.log(`    Bob: ${bobResp.messages.length} messages (own messages only)`)
    
    console.log('\n--- Waiting for bloom exchange ---')
    
    // Poll until both have all 4 messages
    let syncComplete = false
    let attempts = 0
    
    while (!syncComplete && attempts < 30) {
      await new Promise(r => setTimeout(r, 500))
      
      const responses = await Promise.all([
        fetch(`${aliceUrl}/api/messages`).then(r => r.json()),
        fetch(`${bobUrl}/api/messages`).then(r => r.json())
      ])
      aliceResp = responses[0]
      bobResp = responses[1]
      
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
  }, 30000)
  
  it('should verify sync statistics', async () => {
    console.log('\n\n=== Test: Sync Statistics ===')
    
    // Check sync stats after all the syncing
    const [aliceStats, bobStats] = await Promise.all([
      fetch(`${aliceUrl}/api/stats`).then(r => r.json()),
      fetch(`${bobUrl}/api/stats`).then(r => r.json())
    ])
    
    console.log('\nSync Statistics:')
    console.log(`  Alice: ${aliceStats.messageCount} messages, ${aliceStats.syncPercentage}% synced`)
    console.log(`  Bob: ${bobStats.messageCount} messages, ${bobStats.syncPercentage}% synced`)
    
    // Both should have same message count
    expect(aliceStats.messageCount).toBe(bobStats.messageCount)
    
    // Both should show high sync percentage
    expect(aliceStats.syncPercentage).toBeGreaterThanOrEqual(90)
    expect(bobStats.syncPercentage).toBeGreaterThanOrEqual(90)
    
    console.log('\n✓ Sync statistics confirmed!')
  })
})