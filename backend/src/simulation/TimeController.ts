import { EventEmitter } from 'events'

export interface TimeEvent {
  type: 'tick'
  simulationTime: number
  deltaTime: number
}

export interface TimeListener {
  onTimeTick(event: TimeEvent): void
}

/**
 * TimeController manages simulation time for the entire system.
 * It dispatches time events to all registered components, allowing
 * deterministic testing and replay at any speed.
 */
export class TimeController extends EventEmitter {
  private simulationTime: number = 0
  private lastTickTime: number = 0
  private isRunning: boolean = false
  private speedMultiplier: number = 1
  private tickInterval: number = 100 // Base tick interval in ms
  private realTimeMode: boolean = false
  private listeners: Set<TimeListener> = new Set()

  constructor() {
    super()
  }

  /**
   * Start the time controller
   */
  start() {
    this.isRunning = true
    this.lastTickTime = this.simulationTime
  }

  /**
   * Stop the time controller
   */
  stop() {
    this.isRunning = false
  }

  /**
   * Advance simulation time by a specific amount
   * @param deltaMs Milliseconds to advance
   */
  advance(deltaMs: number) {
    if (!this.isRunning) return

    const previousTime = this.simulationTime
    this.simulationTime += deltaMs

    // Emit time event
    const event: TimeEvent = {
      type: 'tick',
      simulationTime: this.simulationTime,
      deltaTime: deltaMs
    }

    // Notify all listeners
    for (const listener of this.listeners) {
      listener.onTimeTick(event)
    }

    // Also emit as event for backward compatibility
    this.emit('tick', event)
  }

  /**
   * Tick the simulation forward by the configured interval
   */
  tick() {
    if (!this.isRunning) return
    
    // In real-time mode, advance by actual elapsed time
    // In simulation mode, advance by fixed tick * speed
    const deltaTime = this.realTimeMode 
      ? this.tickInterval 
      : this.tickInterval * this.speedMultiplier

    this.advance(deltaTime)
  }

  /**
   * Set simulation speed multiplier
   * @param multiplier Speed multiplier (1 = normal, 2 = 2x speed, etc)
   */
  setSpeed(multiplier: number) {
    this.speedMultiplier = Math.max(0.1, Math.min(100, multiplier))
  }

  /**
   * Get current simulation time
   */
  getCurrentTime(): number {
    return this.simulationTime
  }

  /**
   * Reset simulation time to zero
   */
  reset() {
    this.simulationTime = 0
    this.lastTickTime = 0
    this.isRunning = false
    this.speedMultiplier = 1
  }

  /**
   * Set real-time mode (for live operation) or simulation mode (for tests)
   */
  setRealTimeMode(enabled: boolean) {
    this.realTimeMode = enabled
  }

  /**
   * Register a time listener
   */
  addListener(listener: TimeListener) {
    this.listeners.add(listener)
  }

  /**
   * Unregister a time listener
   */
  removeListener(listener: TimeListener) {
    this.listeners.delete(listener)
  }

  /**
   * Jump to a specific time (useful for replay)
   */
  jumpToTime(targetTime: number) {
    if (targetTime < this.simulationTime) {
      throw new Error('Cannot jump backwards in time')
    }

    const deltaTime = targetTime - this.simulationTime
    this.advance(deltaTime)
  }

  /**
   * Get time controller state (for debugging)
   */
  getState() {
    return {
      simulationTime: this.simulationTime,
      isRunning: this.isRunning,
      speedMultiplier: this.speedMultiplier,
      realTimeMode: this.realTimeMode,
      listenerCount: this.listeners.size
    }
  }
}