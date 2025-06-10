import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'
import { createChatAPI } from '../../api/ChatAPI'

describe('Alice reacting to Bob\'s message', () => {
  let engine: SimulationEngine
  let aliceAPI: any
  let bobAPI: any

  beforeEach(async () => {
    engine = new SimulationEngine()
    
    // Set up Alice and Bob devices
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true }
    ])
    
    // Create chat APIs for both devices
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

  it('should allow Alice to react to Bob\'s message and Bob should see the reaction', async () => {
    // Bob sends a message to Alice
    console.log('Bob sending message...')
    await bobAPI.sendMessage('Hey Alice, how are you doing?')
    
    // Advance simulation time to trigger sync
    for (let i = 0; i < 20; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Verify Alice received Bob's message
    const aliceMessages = await aliceAPI.loadMessages()
    console.log('Alice messages:', aliceMessages)
    expect(aliceMessages).toHaveLength(1)
    expect(aliceMessages[0].content).toBe('Hey Alice, how are you doing?')
    expect(aliceMessages[0].author).toBe('bob')
    expect(aliceMessages[0].isOwn).toBe(false)
    
    const messageId = aliceMessages[0].id
    
    // Alice reacts to Bob's message with a heart emoji
    console.log('Alice adding reaction...')
    await aliceAPI.addReaction(messageId, '❤️')
    
    // Wait for the reaction to sync back to Bob
    for (let i = 0; i < 20; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Bob should see Alice's reaction on his message
    const bobMessages = await bobAPI.loadMessages()
    console.log('Bob messages with reactions:', bobMessages)
    expect(bobMessages).toHaveLength(1)
    expect(bobMessages[0].reactions).toBeDefined()
    expect(bobMessages[0].reactions).toHaveLength(1)
    expect(bobMessages[0].reactions![0]).toMatchObject({
      emoji: '❤️',
      author: 'alice'
    })
    
    // Alice should also see her own reaction
    const aliceMessagesWithReaction = await aliceAPI.loadMessages()
    console.log('Alice messages with reactions:', aliceMessagesWithReaction)
    expect(aliceMessagesWithReaction[0].reactions).toHaveLength(1)
    expect(aliceMessagesWithReaction[0].reactions![0]).toMatchObject({
      emoji: '❤️',
      author: 'alice'
    })
  })

  it('should support multiple reactions from different users', async () => {
    // Bob sends a funny message
    await bobAPI.sendMessage('Why did the developer go broke? Because he used up all his cache!')
    
    // Wait for sync
    for (let i = 0; i < 20; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    const aliceMessages = await aliceAPI.loadMessages()
    const messageId = aliceMessages[0].id
    
    // Alice reacts with laughing emoji
    await aliceAPI.addReaction(messageId, '😂')
    
    // Bob also reacts to his own message
    await bobAPI.addReaction(messageId, '🤓')
    
    // Wait for all reactions to sync
    for (let i = 0; i < 20; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Both should see both reactions
    const finalAliceMessages = await aliceAPI.loadMessages()
    const finalBobMessages = await bobAPI.loadMessages()
    
    // Verify both users see both reactions
    for (const messages of [finalAliceMessages, finalBobMessages]) {
      expect(messages[0].reactions).toHaveLength(2)
      
      const reactions = messages[0].reactions!
      const emojiMap = reactions.reduce((acc, r) => {
        acc[r.emoji] = r.author
        return acc
      }, {} as Record<string, string>)
      
      expect(emojiMap['😂']).toBe('alice')
      expect(emojiMap['🤓']).toBe('bob')
    }
  })

  it('should handle reaction updates in real-time conversation', async () => {
    // Simulate a conversation
    await bobAPI.sendMessage('Good morning Alice!')
    for (let i = 0; i < 15; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    await aliceAPI.sendMessage('Good morning Bob! ☀️')
    for (let i = 0; i < 15; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    await bobAPI.sendMessage('Ready for the meeting?')
    for (let i = 0; i < 15; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Get message IDs
    const aliceMessages = await aliceAPI.loadMessages()
    expect(aliceMessages).toHaveLength(3)
    
    // Alice reacts to Bob's first message
    await aliceAPI.addReaction(aliceMessages[0].id, '👋')
    
    // Bob reacts to Alice's message
    const bobMessages = await bobAPI.loadMessages()
    const aliceMessageInBobView = bobMessages.find(m => m.content.includes('☀️'))!
    await bobAPI.addReaction(aliceMessageInBobView.id, '😊')
    
    // Alice gives thumbs up to Bob's question
    await aliceAPI.addReaction(aliceMessages[2].id, '👍')
    
    // Wait for all reactions to sync
    for (let i = 0; i < 20; i++) {
      engine.tick()
      await new Promise(resolve => setTimeout(resolve, 50))
    }
    
    // Verify all reactions are visible to both users
    const finalAliceMessages = await aliceAPI.loadMessages()
    const finalBobMessages = await bobAPI.loadMessages()
    
    // Check Bob's first message has Alice's wave
    const bobFirstMsg = finalBobMessages.find(m => m.content === 'Good morning Alice!')!
    expect(bobFirstMsg.reactions).toHaveLength(1)
    expect(bobFirstMsg.reactions![0]).toMatchObject({ emoji: '👋', author: 'alice' })
    
    // Check Alice's message has Bob's smile
    const aliceMsg = finalBobMessages.find(m => m.content.includes('☀️'))!
    expect(aliceMsg.reactions).toHaveLength(1)
    expect(aliceMsg.reactions![0]).toMatchObject({ emoji: '😊', author: 'bob' })
    
    // Check Bob's question has Alice's thumbs up
    const bobQuestion = finalBobMessages.find(m => m.content === 'Ready for the meeting?')!
    expect(bobQuestion.reactions).toHaveLength(1)
    expect(bobQuestion.reactions![0]).toMatchObject({ emoji: '👍', author: 'alice' })
  })
})