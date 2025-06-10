import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fetch from 'node-fetch'
import { getOptimalPorts, PortRegistry } from '../../utils/port-finder'

describe('Fast Message Flow Tests', () => {
  let ports: any
  let instanceId: string
  const isOrchestrated = process.env.TEST_MODE === 'orchestrated'
  
  // Use orchestrated ports if available, otherwise get new ones
  const aliceUrl = process.env.ALICE_BACKEND_URL || 'http://localhost:6001'
  const bobUrl = process.env.BOB_BACKEND_URL || 'http://localhost:6002'
  const networkUrl = process.env.NETWORK_HTTP_PORT ? 
    `http://localhost:${process.env.NETWORK_HTTP_PORT}` : 
    'http://localhost:6004'
  const simControlUrl = process.env.SIMULATION_CONTROL_URL || 'http://localhost:3005'

  beforeAll(async () => {
    if (!isOrchestrated) {
      // Get ports for standalone testing
      instanceId = `fast-flow-test-${Date.now()}`
      ports = await getOptimalPorts('test', instanceId)
      console.log('[FastTest] Running standalone - would need to start services')
      return
    }
    
    console.log('[FastTest] Running in orchestrated environment')
    console.log(`[FastTest] Alice: ${aliceUrl}, Bob: ${bobUrl}`)
    
    // Clear any existing messages
    await fetch(`${aliceUrl}/api/messages/clear`, { method: 'DELETE' }).catch(() => {})
    await fetch(`${bobUrl}/api/messages/clear`, { method: 'DELETE' }).catch(() => {})
    
    // No need to wait - we'll use time control
  })

  afterAll(async () => {
    if (!isOrchestrated && instanceId) {
      PortRegistry.releasePorts(instanceId)
    }
  })

  it('should deliver messages instantly with time control', async () => {
    if (!isOrchestrated) {
      console.log('[FastTest] Skipping - requires orchestrated environment')
      return
    }
    
    const testMessage = `Fast delivery ${Date.now()}`
    
    // 1. Send message from Alice
    const sendResponse = await fetch(`${aliceUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: testMessage })
    })
    
    expect(sendResponse.ok).toBe(true)
    const sentMessage = await sendResponse.json()
    console.log(`[FastTest] Sent message ${sentMessage.id}`)
    
    // 2. Instead of waiting, advance simulation time
    // Try to use simulation control if available
    try {
      // Advance by 10 seconds (should trigger 2 sync cycles)
      await fetch(`${simControlUrl}/api/simulation/time/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltaMs: 10000 })
      })
      console.log('[FastTest] Advanced simulation time by 10 seconds')
    } catch (error) {
      // If simulation control not available, check NetworkSimulatorService
      try {
        await fetch(`${networkUrl}/api/time/advance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deltaMs: 10000 })
        })
        console.log('[FastTest] Advanced network time by 10 seconds')
      } catch {
        // Fall back to minimal wait
        console.log('[FastTest] Time control not available, waiting 1 second')
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
    
    // 3. Check Bob's messages immediately
    const bobMessages = await fetch(`${bobUrl}/api/messages`).then(r => r.json())
    const receivedMessage = bobMessages.find((m: any) => m.content === testMessage)
    
    expect(receivedMessage).toBeDefined()
    expect(receivedMessage.author).toBe('alice')
    expect(receivedMessage.id).toBe(sentMessage.id)
    
    console.log('[FastTest] Message delivered successfully with time control!')
  })

  it('should handle rapid burst messaging', async () => {
    if (!isOrchestrated) return
    
    const burstPrefix = `Burst ${Date.now()}`
    const messageCount = 10
    const sentMessages: any[] = []
    
    // Send all messages at once
    console.log(`[FastTest] Sending ${messageCount} messages rapidly`)
    const startTime = Date.now()
    
    for (let i = 0; i < messageCount; i++) {
      const response = await fetch(`${aliceUrl}/api/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: `${burstPrefix} - Message ${i}` })
      })
      
      expect(response.ok).toBe(true)
      sentMessages.push(await response.json())
    }
    
    const sendTime = Date.now() - startTime
    console.log(`[FastTest] Sent ${messageCount} messages in ${sendTime}ms`)
    
    // Advance time for sync
    try {
      await fetch(`${networkUrl}/api/time/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltaMs: 5000 })
      })
    } catch {
      // Minimal wait if no time control
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    
    // Check Bob received all
    const bobMessages = await fetch(`${bobUrl}/api/messages`).then(r => r.json())
    const receivedCount = bobMessages.filter((m: any) => 
      m.content.startsWith(burstPrefix)
    ).length
    
    console.log(`[FastTest] Bob received ${receivedCount}/${messageCount} messages`)
    expect(receivedCount).toBe(messageCount)
  })

  it('should test offline/online sync rapidly', async () => {
    if (!isOrchestrated) return
    
    const offlineMessage = `Offline sync test ${Date.now()}`
    
    // 1. Set Bob offline
    await fetch(`${bobUrl}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: false })
    })
    
    // 2. Send message immediately (no wait)
    const response = await fetch(`${aliceUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: offlineMessage })
    })
    
    expect(response.ok).toBe(true)
    
    // 3. Verify Bob doesn't have it (no wait needed)
    let bobMessages = await fetch(`${bobUrl}/api/messages`).then(r => r.json())
    expect(bobMessages.some((m: any) => m.content === offlineMessage)).toBe(false)
    
    // 4. Bring Bob online
    await fetch(`${bobUrl}/api/device-status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ online: true })
    })
    
    // 5. Advance time to trigger sync
    try {
      // Advance by 6 seconds to ensure bloom filter exchange
      await fetch(`${networkUrl}/api/time/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltaMs: 6000 })
      })
      console.log('[FastTest] Advanced time for sync')
    } catch {
      // Minimal wait
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    // 6. Check Bob now has the message
    bobMessages = await fetch(`${bobUrl}/api/messages`).then(r => r.json())
    expect(bobMessages.some((m: any) => m.content === offlineMessage)).toBe(true)
    
    console.log('[FastTest] Offline/online sync completed successfully!')
  })

  it('should verify network events are recorded', async () => {
    if (!isOrchestrated) return
    
    const trackMessage = `Track event ${Date.now()}`
    
    // Send a tracked message
    const response = await fetch(`${aliceUrl}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: trackMessage })
    })
    
    const sentMessage = await response.json()
    
    // Advance time slightly
    try {
      await fetch(`${networkUrl}/api/time/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deltaMs: 500 })
      })
    } catch {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    // Check network events
    const networkEvents = await fetch(`${networkUrl}/api/network-events?limit=20`)
      .then(r => r.json())
    
    // Find our message in network events
    const messageEvent = networkEvents.events.find((e: any) => 
      e.type === 'message' && 
      e.payload?.event_id === sentMessage.id
    )
    
    expect(messageEvent).toBeDefined()
    expect(messageEvent.sourceDevice).toBe('alice')
    expect(messageEvent.targetDevice).toBe('bob')
    
    // Check if it was delivered
    const deliveredEvent = networkEvents.events.find((e: any) => 
      e.status === 'delivered' &&
      e.payload?.event_id === sentMessage.id
    )
    
    if (deliveredEvent) {
      console.log('[FastTest] Message was delivered via network')
    } else {
      console.log('[FastTest] Message sent but delivery pending')
    }
  })
})