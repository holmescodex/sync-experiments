import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import fetch from 'node-fetch'

describe('Message Flow Trace - Alice to Bob', () => {
  let orchestratorProcess: ChildProcess | null = null
  const TRACE_MESSAGE = `TRACE_TEST_${Date.now()}`
  const ports = {
    alice: 5001,
    bob: 5002,
    network: 5003,
    networkHttp: 5004
  }

  // Helper to wait for service to be ready
  const waitForService = async (url: string, name: string, maxAttempts = 30): Promise<boolean> => {
    console.log(`Waiting for ${name} at ${url}...`)
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(url)
        if (response.ok) {
          console.log(`✓ ${name} is ready`)
          return true
        }
      } catch (e) {
        // Service not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    console.log(`✗ ${name} failed to start`)
    return false
  }

  beforeAll(async () => {
    console.log('\n=== Starting Message Flow Trace Test ===\n')
    
    // Start the orchestrator with known ports
    orchestratorProcess = spawn('./run-dev-with-unique-ports.sh', [], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ALICE_PORT: ports.alice.toString(),
        BOB_PORT: ports.bob.toString(),
        NETWORK_SIMULATOR_PORT: ports.network.toString(),
        NETWORK_HTTP_PORT: ports.networkHttp.toString()
      }
    })

    // Capture output for debugging
    orchestratorProcess.stdout?.on('data', (data) => {
      console.log('[Orchestrator]', data.toString().trim())
    })
    
    orchestratorProcess.stderr?.on('data', (data) => {
      console.error('[Orchestrator Error]', data.toString().trim())
    })

    // Wait for all services to be ready
    const servicesReady = await Promise.all([
      waitForService(`http://localhost:${ports.alice}/api/health`, 'Alice Backend'),
      waitForService(`http://localhost:${ports.bob}/api/health`, 'Bob Backend'),
      waitForService(`http://localhost:${ports.networkHttp}/api/health`, 'Network Service')
    ])

    if (!servicesReady.every(ready => ready)) {
      throw new Error('Not all services started successfully')
    }

    // Give services a moment to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000))
  }, 60000)

  it('should trace message from Alice to Bob', async () => {
    console.log('\n--- Step 1: Sending message from Alice ---')
    console.log(`Message content: "${TRACE_MESSAGE}"`)
    
    // Send message from Alice
    const sendResponse = await fetch(`http://localhost:${ports.alice}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: TRACE_MESSAGE })
    })
    
    expect(sendResponse.ok).toBe(true)
    const sentMessage = await sendResponse.json()
    console.log(`✓ Message sent with ID: ${sentMessage.id}`)
    
    // Verify message is in Alice's store
    console.log('\n--- Step 2: Verifying message in Alice\'s backend ---')
    const aliceMessages = await fetch(`http://localhost:${ports.alice}/api/messages`).then(r => r.json())
    const aliceHasMessage = aliceMessages.some((m: any) => m.content === TRACE_MESSAGE)
    expect(aliceHasMessage).toBe(true)
    console.log(`✓ Message found in Alice's backend (${aliceMessages.length} total messages)`)
    
    // Check network statistics to see if message was broadcast
    console.log('\n--- Step 3: Checking network broadcast ---')
    const networkStats = await fetch(`http://localhost:${ports.networkHttp}/api/stats`).then(r => r.json())
    console.log('Network stats:', JSON.stringify(networkStats, null, 2))
    
    // Wait for network propagation
    console.log('\n--- Step 4: Waiting for network propagation ---')
    console.log('Waiting 5 seconds for message to propagate through network...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Check if Bob received the message
    console.log('\n--- Step 5: Checking Bob\'s backend for message ---')
    let bobHasMessage = false
    let attempts = 0
    const maxAttempts = 10
    
    while (!bobHasMessage && attempts < maxAttempts) {
      const bobMessages = await fetch(`http://localhost:${ports.bob}/api/messages`).then(r => r.json())
      bobHasMessage = bobMessages.some((m: any) => m.content === TRACE_MESSAGE)
      
      console.log(`Attempt ${attempts + 1}: Bob has ${bobMessages.length} messages`)
      if (bobHasMessage) {
        console.log(`✓ Message found in Bob's backend!`)
        const bobMessage = bobMessages.find((m: any) => m.content === TRACE_MESSAGE)
        console.log(`  Author: ${bobMessage.author}`)
        console.log(`  Timestamp: ${new Date(bobMessage.timestamp).toISOString()}`)
      } else {
        console.log(`✗ Message not yet in Bob's backend`)
        await new Promise(resolve => setTimeout(resolve, 2000))
      }
      attempts++
    }
    
    // Get sync status from both devices
    console.log('\n--- Step 6: Checking sync status ---')
    const aliceStats = await fetch(`http://localhost:${ports.alice}/api/stats`).then(r => r.json())
    const bobStats = await fetch(`http://localhost:${ports.bob}/api/stats`).then(r => r.json())
    
    console.log('Alice stats:', JSON.stringify(aliceStats, null, 2))
    console.log('Bob stats:', JSON.stringify(bobStats, null, 2))
    
    // Check network events to trace the path
    console.log('\n--- Step 7: Tracing network events ---')
    const networkEvents = await fetch(`http://localhost:${ports.networkHttp}/api/events?limit=20`).then(r => r.json())
    
    const relevantEvents = networkEvents.filter((e: any) => 
      e.type === 'packet_sent' || e.type === 'packet_delivered' || e.type === 'packet_dropped'
    )
    
    console.log('Recent network events:')
    relevantEvents.forEach((event: any) => {
      console.log(`  ${event.timestamp}: ${event.type} from ${event.from} to ${event.to}`)
    })
    
    // Final assertion
    expect(bobHasMessage).toBe(true)
    
    if (!bobHasMessage) {
      console.log('\n❌ MESSAGE DELIVERY FAILED')
      console.log('Possible failure points:')
      console.log('1. Message not broadcast from Alice\'s SyncManager')
      console.log('2. Network simulator not forwarding messages')
      console.log('3. Bob\'s backend not receiving WebSocket messages')
      console.log('4. Message decryption failure on Bob\'s side')
    } else {
      console.log('\n✅ MESSAGE SUCCESSFULLY DELIVERED FROM ALICE TO BOB')
    }
  }, 60000)

  afterAll(async () => {
    console.log('\nCleaning up...')
    if (orchestratorProcess) {
      orchestratorProcess.kill('SIGTERM')
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (!orchestratorProcess.killed) {
        orchestratorProcess.kill('SIGKILL')
      }
    }
  })
})