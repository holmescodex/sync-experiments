import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'
import { createChatAPI } from '../../api/ChatAPI'

describe('Reaction Sync Tests', () => {
  let engine: SimulationEngine
  let aliceAPI: any
  let bobAPI: any

  beforeEach(async () => {
    engine = new SimulationEngine()
    
    // Set up two devices
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true }
    ])
    
    // Create chat APIs
    aliceAPI = createChatAPI('alice', engine)
    bobAPI = createChatAPI('bob', engine)
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterEach(() => {
    aliceAPI?.destroy()
    bobAPI?.destroy()
    engine.reset()
  })

  it('should sync reactions between devices', async () => {
    // Alice sends a message
    await aliceAPI.sendMessage('Hello Bob!')
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Bob should see the message
    const bobMessages = await bobAPI.loadMessages()
    expect(bobMessages).toHaveLength(1)
    expect(bobMessages[0].content).toBe('Hello Bob!')
    const messageId = bobMessages[0].id
    
    // Bob reacts to Alice's message
    await bobAPI.addReaction(messageId, '👍')
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Both should see the reaction
    const aliceMessages = await aliceAPI.loadMessages()
    const bobMessagesWithReaction = await bobAPI.loadMessages()
    
    expect(aliceMessages[0].reactions).toHaveLength(1)
    expect(aliceMessages[0].reactions![0]).toMatchObject({
      emoji: '👍',
      author: 'bob'
    })
    
    expect(bobMessagesWithReaction[0].reactions).toHaveLength(1)
    expect(bobMessagesWithReaction[0].reactions![0]).toMatchObject({
      emoji: '👍',
      author: 'bob'
    })
  })

  it('should handle multiple reactions on same message', async () => {
    // Alice sends a message
    await aliceAPI.sendMessage('Great news!')
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const bobMessages = await bobAPI.loadMessages()
    const messageId = bobMessages[0].id
    
    // Bob adds multiple reactions
    await bobAPI.addReaction(messageId, '🎉')
    await bobAPI.addReaction(messageId, '❤️')
    
    // Alice also reacts
    await aliceAPI.addReaction(messageId, '🎉')
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Check reactions
    const finalMessages = await aliceAPI.loadMessages()
    const reactions = finalMessages[0].reactions!
    
    // Should have 3 reactions total
    expect(reactions).toHaveLength(3)
    
    // Count by emoji
    const emojiCounts = reactions.reduce((acc, r) => {
      acc[r.emoji] = (acc[r.emoji] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    expect(emojiCounts['🎉']).toBe(2) // Both Alice and Bob
    expect(emojiCounts['❤️']).toBe(1) // Only Bob
  })

  it('should handle reaction removal', async () => {
    // Alice sends a message
    await aliceAPI.sendMessage('Testing removal')
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const bobMessages = await bobAPI.loadMessages()
    const messageId = bobMessages[0].id
    
    // Bob reacts
    await bobAPI.addReaction(messageId, '😊')
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Verify reaction exists
    let messages = await aliceAPI.loadMessages()
    expect(messages[0].reactions).toHaveLength(1)
    
    // Bob removes reaction
    await bobAPI.removeReaction(messageId, '😊')
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 200))
    
    // Reaction should be removed
    messages = await aliceAPI.loadMessages()
    expect(messages[0].reactions).toHaveLength(0)
  })

  it('should handle offline reaction sync', async () => {
    // Alice sends a message
    await aliceAPI.sendMessage('Offline test')
    
    // Wait for initial sync
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const bobMessages = await bobAPI.loadMessages()
    const messageId = bobMessages[0].id
    
    // Bob goes offline
    engine.setDeviceOnlineStatus('bob', false)
    
    // Bob reacts while offline
    await bobAPI.addReaction(messageId, '🔥')
    
    // Alice shouldn't see it yet
    let aliceMessages = await aliceAPI.loadMessages()
    expect(aliceMessages[0].reactions || []).toHaveLength(0)
    
    // Bob comes back online
    engine.setDeviceOnlineStatus('bob', true)
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Now Alice should see the reaction
    aliceMessages = await aliceAPI.loadMessages()
    expect(aliceMessages[0].reactions).toHaveLength(1)
    expect(aliceMessages[0].reactions![0]).toMatchObject({
      emoji: '🔥',
      author: 'bob'
    })
  })

  it('should handle concurrent reactions correctly', async () => {
    // Alice sends a message
    await aliceAPI.sendMessage('Race condition test')
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 200))
    
    const aliceMessages = await aliceAPI.loadMessages()
    const bobMessages = await bobAPI.loadMessages()
    const messageId = aliceMessages[0].id
    
    // Both react at nearly the same time
    await Promise.all([
      aliceAPI.addReaction(messageId, '👏'),
      bobAPI.addReaction(messageId, '👏')
    ])
    
    // Wait for sync
    await new Promise(resolve => setTimeout(resolve, 300))
    
    // Both reactions should be preserved
    const finalMessages = await aliceAPI.loadMessages()
    const reactions = finalMessages[0].reactions!
    
    const clapReactions = reactions.filter(r => r.emoji === '👏')
    expect(clapReactions).toHaveLength(2)
    
    const authors = clapReactions.map(r => r.author).sort()
    expect(authors).toEqual(['alice', 'bob'])
  })
})