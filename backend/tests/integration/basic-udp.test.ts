import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import fetch from 'node-fetch'
import { findAvailablePorts } from '../../utils/port-finder'

/**
 * Basic UDP test - just send one message and verify it arrives
 */
describe('Basic UDP Message Test', () => {
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
    const ports = await findAvailablePorts(9100, 4)
    alicePort = ports[0]
    bobPort = ports[1]
    aliceUdpPort = ports[2]
    bobUdpPort = ports[3]
    
    console.log(`Starting backends:`)
    console.log(`  Alice: HTTP ${alicePort}, UDP ${aliceUdpPort}`)
    console.log(`  Bob: HTTP ${bobPort}, UDP ${bobUdpPort}`)
    
    // Start Alice backend
    aliceProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      env: {
        ...process.env,
        DEVICE_ID: 'alice',
        PORT: alicePort.toString(),
        UDP_PORT: aliceUdpPort.toString(),
        PEER_ENDPOINTS: `bob:localhost:${bobUdpPort}`,
        SYNC_INTERVAL: '1000' // 1 second for faster testing
      }
    })
    
    // Start Bob backend
    bobProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      env: {
        ...process.env,
        DEVICE_ID: 'bob',
        PORT: bobPort.toString(),
        UDP_PORT: bobUdpPort.toString(),
        PEER_ENDPOINTS: `alice:localhost:${aliceUdpPort}`,
        SYNC_INTERVAL: '1000' // 1 second for faster testing
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
    
    // Give them a moment to initialize
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Establish trust between Alice and Bob
    console.log('\nEstablishing trust between Alice and Bob...')
    await fetch(`http://localhost:${alicePort}/api/trust/bob`, { method: 'POST' })
    await fetch(`http://localhost:${bobPort}/api/trust/alice`, { method: 'POST' })
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

  it('should send multiple messages and receive some', async () => {
    // Clear messages first
    await fetch(`http://localhost:${alicePort}/api/messages/clear`, { method: 'DELETE' })
    await fetch(`http://localhost:${bobPort}/api/messages/clear`, { method: 'DELETE' })
    
    // Alice sends 10 messages rapidly
    console.log('\n=== Alice sending 10 messages ===')
    const sentMessages = []
    
    for (let i = 0; i < 10; i++) {
      const response = await fetch(`http://localhost:${alicePort}/api/messages`, {
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
    
    console.log(`\nSent ${sentMessages.length} messages total`)
    
    // Wait just 2 seconds for direct message delivery or bloom sync
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Check what Bob received
    const bobResponse = await fetch(`http://localhost:${bobPort}/api/messages`)
    const bobData = await bobResponse.json()
    const bobMessages = bobData.messages || []
    
    console.log(`\nBob received ${bobMessages.length} messages:`)
    bobMessages.forEach((m: any) => {
      console.log(`  - ${m.content} (id: ${m.id})`)
    })
    
    // Success if Bob got at least half the messages
    expect(bobMessages.length).toBeGreaterThanOrEqual(5)
    console.log(`\n✓ Test passed: Bob received ${bobMessages.length}/10 messages`)
  })
})