import { describe, test, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'

describe('SimulationEngine', () => {
  let engine: SimulationEngine

  beforeEach(() => {
    engine = new SimulationEngine()
  })

  test('starts at simulation time 0', () => {
    expect(engine.currentSimTime()).toBe(0)
  })
  
  test('advances simulation time by tick interval', () => {
    engine.tick()
    expect(engine.currentSimTime()).toBe(100) // 100ms default tick
  })
  
  test('speed multiplier compresses simulation time', () => {
    engine.setSpeed(10) // 10x speed
    engine.tick()
    expect(engine.currentSimTime()).toBe(1000) // 100ms * 10x = 1000ms sim-time
  })
  
  test('can pause and resume simulation', () => {
    engine.pause()
    engine.tick()
    expect(engine.currentSimTime()).toBe(0) // No advancement when paused
    
    engine.resume()
    engine.tick()
    expect(engine.currentSimTime()).toBe(100)
  })
  
  test('executes events at correct simulation time', () => {
    const executedEvents: any[] = []
    
    // Start with paused engine for controlled testing
    engine.pause()
    
    // Mock event execution by providing a callback
    engine.onEventExecute((event) => {
      executedEvents.push(event)
    })
    
    // Create events that happen at specific sim-times
    const timeline = [
      {simTime: 500, type: 'message' as const, deviceId: 'alice', data: {content: 'Hello'}},
      {simTime: 1000, type: 'message' as const, deviceId: 'bob', data: {content: 'World'}}
    ]
    engine.loadEventTimeline(timeline)
    
    // Resume and advance to exactly first event time (5 ticks = 500ms)
    engine.resume()
    for (let i = 0; i < 5; i++) {
      engine.tick()
    }
    expect(executedEvents).toHaveLength(1) // Should execute at exactly 500ms
    expect(executedEvents[0].data.content).toBe('Hello')
  })
  
  test('can save and load event timelines', () => {
    // Generate some events
    engine.createMessageEvent('alice', 'Hello', 1000)
    engine.createMessageEvent('bob', 'Hi there', 2000)
    
    const timeline = engine.exportEventTimeline()
    expect(timeline.events).toHaveLength(2)
    expect(timeline.events[0].simTime).toBe(1000)
    expect(timeline.duration).toBe(2000)
    
    // Load into new engine
    const engine2 = new SimulationEngine()
    engine2.loadEventTimeline(timeline.events)
    
    // Should be able to replay exact same sequence
    const replayedTimeline = engine2.exportEventTimeline()
    expect(replayedTimeline).toEqual(timeline)
  })
})