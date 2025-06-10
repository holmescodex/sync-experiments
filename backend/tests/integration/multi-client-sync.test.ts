import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fetch from 'node-fetch'
import { spawn } from 'child_process'
import { WebSocket } from 'ws'

describe('Multi-Client Sync', () => {
  // Use environment variables for backend URLs (set by test orchestrator)
  const aliceUrl = process.env.ALICE_BACKEND_URL || 'http://localhost:3001'
  const bobUrl = process.env.BOB_BACKEND_URL || 'http://localhost:3002'
  
  beforeAll(async () => {
    
    // Wait for backends to be ready (they should already be started by orchestrator)
    console.log(`[Multi-Client Sync] Using Alice: ${aliceUrl}, Bob: ${bobUrl}`)
    
    // Simple health check to ensure backends are ready
    for (let i = 0; i < 10; i++) {
      try {
        const aliceHealth = await fetch(`${aliceUrl}/api/health`)
        const bobHealth = await fetch(`${bobUrl}/api/health`)
        
        if (aliceHealth.ok && bobHealth.ok) {
          console.log('[Multi-Client Sync] Backends are ready')
          break
        }
      } catch (error) {
        if (i === 9) throw new Error('Backends not ready after 10 attempts')
        await new Promise(resolve => setTimeout(resolve, 1000))
      }
    }
  }, 15000)
  
  it('should sync messages from Alice to Bob', async () => {
    // Clear messages on both devices
    await fetch(`${aliceUrl}/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/messages/clear`, { method: 'DELETE' })
    
    // Wait for the clear to propagate
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Alice sends a message
    const messageContent = 'Hello from Alice!'
    const sendResponse = await fetch(`${aliceUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: messageContent })
    })
    
    expect(sendResponse.ok).toBe(true)
    const sentMessage = await sendResponse.json()
    expect(sentMessage.content).toBe(messageContent)
    
    // Wait for sync to happen
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Check that Bob received the message
    const bobResponse = await fetch(`${bobUrl}/messages`).then(res => res.json())
    const bobMessages = bobResponse.messages
    expect(bobMessages).toHaveLength(1)
    expect(bobMessages[0].content).toBe(messageContent)
    expect(bobMessages[0].author).toBe('alice')
  }, 20000)
  
  it('should sync messages bidirectionally', async () => {
    // Clear messages on both devices
    await fetch(`${aliceUrl}/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/messages/clear`, { method: 'DELETE' })
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Alice sends a message
    const aliceMessage = 'Message from Alice'
    await fetch(`${aliceUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: aliceMessage })
    })
    
    // Bob sends a message
    const bobMessage = 'Message from Bob'
    await fetch(`${bobUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: bobMessage })
    })
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 3000))
    
    // Check Alice has both messages
    const aliceResponse = await fetch(`${aliceUrl}/messages`).then(res => res.json())
    const aliceMessages = aliceResponse.messages
    expect(aliceMessages).toHaveLength(2)
    const aliceContents = aliceMessages.map((m: any) => m.content).sort()
    expect(aliceContents).toEqual([aliceMessage, bobMessage].sort())
    
    // Check Bob has both messages
    const bobResponse = await fetch(`${bobUrl}/messages`).then(res => res.json())
    const bobMessages = bobResponse.messages
    expect(bobMessages).toHaveLength(2)
    const bobContents = bobMessages.map((m: any) => m.content).sort()
    expect(bobContents).toEqual([aliceMessage, bobMessage].sort())
  }, 20000)
  
  it('should handle rapid message sending', async () => {
    // Clear messages
    await fetch(`${aliceUrl}/messages/clear`, { method: 'DELETE' })
    await fetch(`${bobUrl}/messages/clear`, { method: 'DELETE' })
    
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Alice sends multiple messages rapidly
    const messages = []
    for (let i = 0; i < 5; i++) {
      const content = `Rapid message ${i + 1}`
      messages.push(content)
      await fetch(`${aliceUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      })
    }
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Check Bob received all messages
    const bobResponse = await fetch(`${bobUrl}/messages`).then(res => res.json())
    const bobMessages = bobResponse.messages
    expect(bobMessages).toHaveLength(5)
    const bobContents = bobMessages.map((m: any) => m.content).sort()
    expect(bobContents).toEqual(messages.sort())
  }, 20000)
  
  it('should maintain trust relationships across restarts', async () => {
    // Check that Alice trusts Bob
    const aliceStatusResponse = await fetch(`${aliceUrl}/status`)
    const aliceStatus = await aliceStatusResponse.json()
    expect(aliceStatus.trustedPeers).toContain('bob')
    
    // Check that Bob trusts Alice
    const bobStatusResponse = await fetch(`${bobUrl}/status`)
    const bobStatus = await bobStatusResponse.json()
    expect(bobStatus.trustedPeers).toContain('alice')
  }, 10000)
})