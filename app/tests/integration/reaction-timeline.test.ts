import { describe, it, expect, beforeEach, vi } from 'vitest'
import { SimulationEngine, type SimulationEvent } from '../../simulation/engine'
import { createChatAPI } from '../../api/ChatAPI'

describe('Reaction Timeline Test', () => {
  let engine: SimulationEngine

  beforeEach(() => {
    engine = new SimulationEngine()
  })

  it('creates and syncs reactions through deterministic timeline', async () => {
    // Initialize devices
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true, isOnline: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true, isOnline: true }
    ])

    // Create APIs for both devices
    const aliceAPI = createChatAPI('alice', engine)
    const bobAPI = createChatAPI('bob', engine)
    
    expect(aliceAPI).toBeTruthy()
    expect(bobAPI).toBeTruthy()

    // Create deterministic timeline of events
    const timeline: SimulationEvent[] = [
      {
        simTime: 1000,
        type: 'message',
        deviceId: 'alice',
        eventId: 'msg-1',
        data: { content: 'Hello Bob!', eventId: 'msg-1' }
      },
      {
        simTime: 2000,
        type: 'reaction',
        deviceId: 'bob',
        eventId: 'react-1',
        data: { 
          messageId: 'msg-1', 
          emoji: '👍',
          remove: false,
          eventId: 'react-1',
          author: 'bob'
        }
      },
      {
        simTime: 3000,
        type: 'reaction',
        deviceId: 'alice',
        eventId: 'react-2',
        data: { 
          messageId: 'msg-1', 
          emoji: '❤️',
          remove: false,
          eventId: 'react-2',
          author: 'alice'
        }
      }
    ]

    // Load timeline into engine
    engine.loadEventTimeline(timeline)

    // Resume engine (it starts paused in tests)
    engine.resume()

    // Execute events up to time 1500 (Alice sends message)
    // Each tick advances 100ms * speed (1) = 100ms
    for (let i = 0; i < 15; i++) {
      await engine.tick()
    }

    console.log('Current sim time:', engine.currentSimTime())
    console.log('Timeline events:', engine.exportEventTimeline())

    // Check Alice has the message
    let aliceMessages = await aliceAPI!.loadMessages()
    console.log('Alice messages:', aliceMessages.length)
    expect(aliceMessages).toHaveLength(1)
    expect(aliceMessages[0].content).toBe('Hello Bob!')
    expect(aliceMessages[0].reactions).toEqual([])

    // Continue to time 2500 (Bob adds reaction)
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }

    // Wait for sync
    for (let i = 0; i < 20; i++) {
      await engine.tick()
    }

    // Check Bob sees the message with his reaction
    let bobMessages = await bobAPI!.loadMessages()
    expect(bobMessages).toHaveLength(1)
    expect(bobMessages[0].content).toBe('Hello Bob!')
    expect(bobMessages[0].reactions).toHaveLength(1)
    expect(bobMessages[0].reactions![0]).toMatchObject({
      emoji: '👍',
      author: 'bob'
    })

    // Check Alice sees Bob's reaction after sync
    aliceMessages = await aliceAPI!.loadMessages()
    expect(aliceMessages).toHaveLength(1)
    expect(aliceMessages[0].reactions).toHaveLength(1)
    expect(aliceMessages[0].reactions![0]).toMatchObject({
      emoji: '👍',
      author: 'bob'
    })

    // Continue to time 3500 (Alice adds heart reaction)
    for (let i = 0; i < 10; i++) {
      await engine.tick()
    }

    // Wait for sync
    for (let i = 0; i < 20; i++) {
      await engine.tick()
    }

    // Check both devices see both reactions
    aliceMessages = await aliceAPI!.loadMessages()
    expect(aliceMessages[0].reactions).toHaveLength(2)
    
    const aliceReactions = aliceMessages[0].reactions!.sort((a, b) => a.emoji.localeCompare(b.emoji))
    expect(aliceReactions[0]).toMatchObject({ emoji: '❤️', author: 'alice' })
    expect(aliceReactions[1]).toMatchObject({ emoji: '👍', author: 'bob' })

    bobMessages = await bobAPI!.loadMessages()
    expect(bobMessages[0].reactions).toHaveLength(2)
    
    const bobReactions = bobMessages[0].reactions!.sort((a, b) => a.emoji.localeCompare(b.emoji))
    expect(bobReactions[0]).toMatchObject({ emoji: '❤️', author: 'alice' })
    expect(bobReactions[1]).toMatchObject({ emoji: '👍', author: 'bob' })
  })

  it('handles reaction removal through timeline', async () => {
    // Initialize devices
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true, isOnline: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true, isOnline: true }
    ])

    const aliceAPI = createChatAPI('alice', engine)
    const bobAPI = createChatAPI('bob', engine)

    // Timeline with reaction addition and removal
    const timeline: SimulationEvent[] = [
      {
        simTime: 1000,
        type: 'message',
        deviceId: 'alice',
        eventId: 'msg-1',
        data: { content: 'Test message', eventId: 'msg-1' }
      },
      {
        simTime: 2000,
        type: 'reaction',
        deviceId: 'bob',
        eventId: 'react-1',
        data: { 
          messageId: 'msg-1', 
          emoji: '😊',
          remove: false,
          eventId: 'react-1',
          author: 'bob'
        }
      },
      {
        simTime: 3000,
        type: 'reaction',
        deviceId: 'bob',
        eventId: 'react-2',
        data: { 
          messageId: 'msg-1', 
          emoji: '😊',
          remove: true,
          eventId: 'react-2',
          author: 'bob'
        }
      }
    ]

    engine.loadEventTimeline(timeline)
    
    // Resume engine
    engine.resume()

    // Execute all events
    for (let i = 0; i < 50; i++) {
      await engine.tick()
    }

    // Check both devices see no reactions after removal
    const aliceMessages = await aliceAPI!.loadMessages()
    expect(aliceMessages[0].reactions).toEqual([])

    const bobMessages = await bobAPI!.loadMessages()
    expect(bobMessages[0].reactions).toEqual([])
  })
})