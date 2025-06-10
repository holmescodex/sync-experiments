import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import fetch from 'node-fetch'
import { findAvailablePorts } from '../../utils/port-finder'

/**
 * Direct P2P backend sync test
 * Tests two backends communicating directly via UDP without any network service
 * Only uses the frontend HTTP API to interact with backends
 */
describe('Direct Backend P2P Sync', () => {
  let aliceProcess: ChildProcess
  let bobProcess: ChildProcess
  let alicePort: number
  let bobPort: number
  let aliceUdpPort: number
  let bobUdpPort: number
  
  const waitForBackend = async (port: number, name: string): Promise<boolean> => {
    console.log(`Waiting for ${name} backend on port ${port}...`)
    for (let i = 0; i < 30; i++) {
      try {
        const response = await fetch(`http://localhost:${port}/api/health`)
        if (response.ok) {
          console.log(`✓ ${name} backend is ready`)
          return true
        }
      } catch (e) {
        // Not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    console.log(`✗ ${name} backend failed to start`)
    return false
  }

  beforeAll(async () => {
    // Find available ports
    const ports = await findAvailablePorts(9000, 4)
    alicePort = ports[0]
    bobPort = ports[1]
    aliceUdpPort = ports[2]
    bobUdpPort = ports[3]
    
    console.log(`Starting backends:`)
    console.log(`  Alice: HTTP ${alicePort}, UDP ${aliceUdpPort}`)
    console.log(`  Bob: HTTP ${bobPort}, UDP ${bobUdpPort}`)
    
    // Start Alice backend with direct UDP
    aliceProcess = spawn('npx', ['tsx', 'src/server-direct-udp.ts'], {
      env: {
        ...process.env,
        DEVICE_ID: 'alice',
        PORT: alicePort.toString(),
        UDP_PORT: aliceUdpPort.toString(),
        // Tell Alice about Bob's UDP endpoint
        PEER_ENDPOINTS: `bob:localhost:${bobUdpPort}`,
        SYNC_INTERVAL: '1000' // 1 second for faster tests
      }
    })
    
    // Start Bob backend with direct UDP
    bobProcess = spawn('npx', ['tsx', 'src/server-direct-udp.ts'], {
      env: {
        ...process.env,
        DEVICE_ID: 'bob',
        PORT: bobPort.toString(),
        UDP_PORT: bobUdpPort.toString(),
        // Tell Bob about Alice's UDP endpoint
        PEER_ENDPOINTS: `alice:localhost:${aliceUdpPort}`,
        SYNC_INTERVAL: '1000'
      }
    })
    
    // Capture output
    aliceProcess.stdout?.on('data', (data) => {
      console.log('[Alice]', data.toString().trim())
    })
    aliceProcess.stderr?.on('data', (data) => {
      console.error('[Alice Error]', data.toString().trim())
    })
    
    bobProcess.stdout?.on('data', (data) => {
      console.log('[Bob]', data.toString().trim())
    })
    bobProcess.stderr?.on('data', (data) => {
      console.error('[Bob Error]', data.toString().trim())
    })
    
    // Wait for both backends to be ready
    const ready = await Promise.all([
      waitForBackend(alicePort, 'Alice'),
      waitForBackend(bobPort, 'Bob')
    ])
    
    if (!ready.every(r => r)) {
      throw new Error('Backends failed to start')
    }
    
    // Give them time to establish UDP connections
    await new Promise(resolve => setTimeout(resolve, 2000))
  }, 60000)

  afterAll(async () => {
    // Clean shutdown
    aliceProcess?.kill('SIGTERM')
    bobProcess?.kill('SIGTERM')
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Force kill if needed
    if (!aliceProcess?.killed) aliceProcess?.kill('SIGKILL')
    if (!bobProcess?.killed) bobProcess?.kill('SIGKILL')
  })

  it('should sync messages between online devices', async () => {
    // Clear any existing messages
    await fetch(`http://localhost:${alicePort}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`http://localhost:${bobPort}/api/messages/clear`, { method: 'DELETE' })
    
    // Alice sends a message
    const testMessage = `Direct P2P test ${Date.now()}`
    const response = await fetch(`http://localhost:${alicePort}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: testMessage })
    })
    
    expect(response.ok).toBe(true)
    const sentMessage = await response.json()
    console.log(`Alice sent message: ${sentMessage.id}`)
    
    // Wait for sync (bloom filter exchange happens every second)
    console.log('Waiting for direct P2P sync...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Check Bob received the message
    const bobResponse = await fetch(`http://localhost:${bobPort}/api/messages`)
      .then(r => r.json())
    
    const bobMessages = bobResponse.messages || []
    const receivedMessage = bobMessages.find((m: any) => m.content === testMessage)
    expect(receivedMessage).toBeDefined()
    expect(receivedMessage.author).toBe('alice')
    expect(receivedMessage.id).toBe(sentMessage.id)
    
    console.log('✓ Message synced directly from Alice to Bob via UDP')
  })

  it('should sync bidirectionally', async () => {
    // Clear messages
    await fetch(`http://localhost:${alicePort}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`http://localhost:${bobPort}/api/messages/clear`, { method: 'DELETE' })
    
    // Both send messages
    const aliceMsg = `From Alice P2P ${Date.now()}`
    const bobMsg = `From Bob P2P ${Date.now()}`
    
    const [aliceResponse, bobResponse] = await Promise.all([
      fetch(`http://localhost:${alicePort}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: aliceMsg })
      }),
      fetch(`http://localhost:${bobPort}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: bobMsg })
      })
    ])
    
    expect(aliceResponse.ok).toBe(true)
    expect(bobResponse.ok).toBe(true)
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Check both have both messages
    const [aliceMessagesResponse, bobMessagesResponse] = await Promise.all([
      fetch(`http://localhost:${alicePort}/api/messages`).then(r => r.json()),
      fetch(`http://localhost:${bobPort}/api/messages`).then(r => r.json())
    ])
    
    const aliceMessages = aliceMessagesResponse.messages || []
    const bobMessages = bobMessagesResponse.messages || []
    
    // Alice should have both
    expect(aliceMessages.some((m: any) => m.content === aliceMsg)).toBe(true)
    expect(aliceMessages.some((m: any) => m.content === bobMsg)).toBe(true)
    
    // Bob should have both
    expect(bobMessages.some((m: any) => m.content === aliceMsg)).toBe(true)
    expect(bobMessages.some((m: any) => m.content === bobMsg)).toBe(true)
    
    console.log('✓ Bidirectional P2P sync working')
  })

  it('should sync messages when device comes back online', async () => {
    // Clear messages
    await fetch(`http://localhost:${alicePort}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`http://localhost:${bobPort}/api/messages/clear`, { method: 'DELETE' })
    
    // Set Bob offline (this should stop UDP communication)
    console.log('Setting Bob offline...')
    await fetch(`http://localhost:${bobPort}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: false })
    })
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Alice sends messages while Bob is offline
    const offlineMessages = []
    for (let i = 0; i < 5; i++) {
      const response = await fetch(`http://localhost:${alicePort}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `Offline message ${i} at ${Date.now()}` })
      })
      const msg = await response.json()
      offlineMessages.push(msg)
      console.log(`Alice sent offline message ${i}: ${msg.id}`)
    }
    
    // Verify Bob doesn't have them yet
    let bobResponse = await fetch(`http://localhost:${bobPort}/api/messages`)
      .then(r => r.json())
    expect(bobResponse.messages.length).toBe(0)
    console.log('✓ Bob has no messages while offline')
    
    // Bring Bob back online
    console.log('Bringing Bob back online...')
    await fetch(`http://localhost:${bobPort}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true })
    })
    
    // Wait for bloom filter exchange and sync
    console.log('Waiting for sync after coming online...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Check Bob now has all messages
    bobResponse = await fetch(`http://localhost:${bobPort}/api/messages`)
      .then(r => r.json())
    
    const bobMessages = bobResponse.messages || []
    expect(bobMessages.length).toBe(5)
    
    // Verify all offline messages were received
    for (const offlineMsg of offlineMessages) {
      const found = bobMessages.find((m: any) => m.id === offlineMsg.id)
      expect(found).toBeDefined()
      expect(found.author).toBe('alice')
    }
    
    console.log('✓ All offline messages synced after coming online via P2P')
  })

  it('should handle UDP packet loss gracefully', async () => {
    // Clear messages
    await fetch(`http://localhost:${alicePort}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`http://localhost:${bobPort}/api/messages/clear`, { method: 'DELETE' })
    
    // In real P2P, packet loss means messages might not sync immediately
    // but bloom filter exchanges should eventually sync everything
    
    // Send multiple messages rapidly
    const messages = []
    for (let i = 0; i < 10; i++) {
      const response = await fetch(`http://localhost:${alicePort}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `Rapid message ${i}` })
      })
      messages.push(await response.json())
    }
    
    // Wait for sync - might take longer due to potential packet loss
    console.log('Waiting for eventual consistency...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Check Bob eventually receives all messages
    const bobResponse = await fetch(`http://localhost:${bobPort}/api/messages`)
      .then(r => r.json())
    
    const bobMessages = bobResponse.messages || []
    // With bloom filters, we should eventually get all messages
    expect(bobMessages.length).toBe(10)
    
    console.log('✓ P2P sync handles network unreliability')
  })

  it('should track sync percentage accurately', async () => {
    // Get stats from both backends
    const [aliceStats, bobStats] = await Promise.all([
      fetch(`http://localhost:${alicePort}/api/stats`).then(r => r.json()),
      fetch(`http://localhost:${bobPort}/api/stats`).then(r => r.json())
    ])
    
    console.log('Alice stats:', aliceStats)
    console.log('Bob stats:', bobStats)
    
    // Both should show high sync percentage if they have the same messages
    if (aliceStats.messageCount === bobStats.messageCount && aliceStats.messageCount > 0) {
      expect(aliceStats.syncPercentage).toBeGreaterThanOrEqual(90)
      expect(bobStats.syncPercentage).toBeGreaterThanOrEqual(90)
    }
  })
})