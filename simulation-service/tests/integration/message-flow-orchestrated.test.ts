import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawn, ChildProcess } from 'child_process'
import fetch from 'node-fetch'
import { getOptimalPorts, PortRegistry } from '../../utils/port-finder'

describe('Message Flow with Orchestrator', () => {
  let orchestratorProcess: ChildProcess | null = null
  let ports: any
  let instanceId: string

  const waitForService = async (url: string, maxAttempts = 30): Promise<boolean> => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const response = await fetch(url)
        if (response.ok) return true
      } catch (e) {
        // Not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    return false
  }

  beforeAll(async () => {
    // Get unique ports for this test
    instanceId = `message-flow-test-${Date.now()}`
    ports = await getOptimalPorts('test', instanceId)
    
    console.log(`[Test] Starting orchestrator with ports:`, ports)
    
    // Start orchestrator with our ports
    orchestratorProcess = spawn('npx', ['tsx', 'src/scripts/start-backend-orchestrator.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ALICE_PORT: ports.alice.toString(),
        BOB_PORT: ports.bob.toString(),
        NETWORK_SIMULATOR_PORT: ports.networkSimulator.toString(),
        NETWORK_HTTP_PORT: ports.networkHttp.toString(),
        INSTANCE_ID: instanceId
      }
    })

    // Capture output for debugging
    orchestratorProcess.stdout?.on('data', (data) => {
      const output = data.toString()
      console.log('[Orchestrator]', output.trim())
    })
    
    orchestratorProcess.stderr?.on('data', (data) => {
      const output = data.toString().trim()
      if (output) {
        console.error('[Orchestrator Error]', output)
      }
    })

    // Wait for all services
    console.log('[Test] Waiting for services to start...')
    const ready = await Promise.all([
      waitForService(`http://localhost:${ports.alice}/api/health`),
      waitForService(`http://localhost:${ports.bob}/api/health`),
      waitForService(`http://localhost:${ports.networkHttp}/api/health`)
    ])

    if (!ready.every(r => r)) {
      throw new Error('Services failed to start')
    }
    
    console.log('[Test] All services ready')
    
    // Give services time to fully initialize
    await new Promise(resolve => setTimeout(resolve, 2000))
  }, 60000)

  afterAll(async () => {
    if (orchestratorProcess) {
      orchestratorProcess.kill('SIGTERM')
      await new Promise(resolve => setTimeout(resolve, 1000))
      if (!orchestratorProcess.killed) {
        orchestratorProcess.kill('SIGKILL')
      }
    }
    
    // Release ports
    PortRegistry.releasePorts(instanceId)
  })

  it('should broadcast message from Alice API to network', async () => {
    const testMessage = `Broadcast test ${Date.now()}`
    
    // Send message via Alice's API
    const response = await fetch(`http://localhost:${ports.alice}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: testMessage })
    })
    
    expect(response.ok).toBe(true)
    const sentMessage = await response.json()
    expect(sentMessage.content).toBe(testMessage)
    expect(sentMessage.author).toBe('alice')
    
    // Check network events to see if it was broadcast
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const networkEvents = await fetch(`http://localhost:${ports.networkHttp}/api/network-events?limit=10`)
      .then(r => r.json())
    
    // Find broadcast event
    const broadcastEvent = networkEvents.events.find((e: any) => 
      e.type === 'message' && 
      e.sourceDevice === 'alice' &&
      e.payload?.event_id === sentMessage.id
    )
    
    expect(broadcastEvent).toBeDefined()
    expect(broadcastEvent.targetDevice).toBe('bob')
  })

  it('should deliver message from Alice to Bob', async () => {
    const testMessage = `E2E delivery test ${Date.now()}`
    
    // Send from Alice
    const sendResponse = await fetch(`http://localhost:${ports.alice}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: testMessage })
    })
    
    expect(sendResponse.ok).toBe(true)
    const sentMessage = await sendResponse.json()
    
    // Wait for propagation
    console.log('[Test] Waiting for message propagation...')
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Check Bob's messages
    const bobMessages = await fetch(`http://localhost:${ports.bob}/api/messages`)
      .then(r => r.json())
    
    const receivedMessage = bobMessages.find((m: any) => m.content === testMessage)
    
    if (!receivedMessage) {
      // Debug information
      console.log('[Test] Bob has', bobMessages.length, 'messages')
      console.log('[Test] Looking for:', testMessage)
      
      // Check sync status
      const aliceStats = await fetch(`http://localhost:${ports.alice}/api/stats`).then(r => r.json())
      const bobStats = await fetch(`http://localhost:${ports.bob}/api/stats`).then(r => r.json())
      console.log('[Test] Alice stats:', aliceStats)
      console.log('[Test] Bob stats:', bobStats)
      
      // Check network stats
      const networkStats = await fetch(`http://localhost:${ports.networkHttp}/api/stats`).then(r => r.json())
      console.log('[Test] Network stats:', networkStats)
    }
    
    expect(receivedMessage).toBeDefined()
    expect(receivedMessage.author).toBe('alice')
    expect(receivedMessage.id).toBe(sentMessage.id)
  })

  it('should handle rapid message sending', async () => {
    const messagePrefix = `Rapid test ${Date.now()}`
    const messageCount = 3
    const sentMessages: any[] = []
    
    // Send multiple messages rapidly
    for (let i = 0; i < messageCount; i++) {
      const response = await fetch(`http://localhost:${ports.alice}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `${messagePrefix} - Message ${i}` })
      })
      
      expect(response.ok).toBe(true)
      sentMessages.push(await response.json())
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Wait for all to propagate
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Check Bob received all
    const bobMessages = await fetch(`http://localhost:${ports.bob}/api/messages`)
      .then(r => r.json())
    
    // Count how many Bob received
    const receivedCount = bobMessages.filter((m: any) => 
      m.content.startsWith(messagePrefix)
    ).length
    
    expect(receivedCount).toBe(messageCount)
  })

  it('should sync when device comes back online', async () => {
    const offlineMessage = `Offline test ${Date.now()}`
    
    // Set Bob offline
    await fetch(`http://localhost:${ports.bob}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: false })
    })
    
    // Wait a moment
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // Send message from Alice while Bob is offline
    const response = await fetch(`http://localhost:${ports.alice}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: offlineMessage })
    })
    
    expect(response.ok).toBe(true)
    const sentMessage = await response.json()
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Check Bob doesn't have it yet
    let bobMessages = await fetch(`http://localhost:${ports.bob}/api/messages`)
      .then(r => r.json())
    let hasMessage = bobMessages.some((m: any) => m.content === offlineMessage)
    expect(hasMessage).toBe(false)
    
    // Bring Bob back online
    await fetch(`http://localhost:${ports.bob}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true })
    })
    
    // Wait for sync
    console.log('[Test] Waiting for sync after coming online...')
    await new Promise(resolve => setTimeout(resolve, 7000)) // Wait for bloom filter exchange
    
    // Check Bob now has the message
    bobMessages = await fetch(`http://localhost:${ports.bob}/api/messages`)
      .then(r => r.json())
    hasMessage = bobMessages.some((m: any) => m.content === offlineMessage)
    
    if (!hasMessage) {
      console.log('[Test] Bob still missing message after coming online')
      console.log('[Test] Bob has', bobMessages.length, 'total messages')
    }
    
    expect(hasMessage).toBe(true)
  })
})