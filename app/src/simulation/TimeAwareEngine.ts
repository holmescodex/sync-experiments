import { SimulationEngine, SimulationEvent, DeviceFrequency } from './engine'

/**
 * TimeAwareEngine extends SimulationEngine to work with backend TimeController
 * for deterministic simulation time management
 */
export class TimeAwareEngine extends SimulationEngine {
  private simulationEngineUrl = 'http://localhost:3000'
  private timeControllerConnected = false
  private eventSource: EventSource | null = null
  
  constructor() {
    super()
    this.connectToTimeController()
  }
  
  /**
   * Connect to backend time controller via SSE
   */
  private connectToTimeController() {
    try {
      this.eventSource = new EventSource(`${this.simulationEngineUrl}/api/events/stream`)
      
      this.eventSource.onopen = () => {
        console.log('[TimeAwareEngine] Connected to time controller')
        this.timeControllerConnected = true
      }
      
      this.eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data)
        
        if (data.type === 'time_tick') {
          // Update our simulation time from backend
          this.setSimulationTime(data.simulationTime)
        } else if (data.type === 'connected') {
          // Sync initial time
          this.setSimulationTime(data.simulationTime)
        }
      }
      
      this.eventSource.onerror = (error) => {
        console.error('[TimeAwareEngine] Time controller connection error:', error)
        this.timeControllerConnected = false
      }
    } catch (error) {
      console.warn('[TimeAwareEngine] Could not connect to time controller:', error)
    }
  }
  
  /**
   * Set simulation time from backend
   */
  private setSimulationTime(time: number) {
    // Access private currentTime through inheritance
    (this as any).currentTime = time
  }
  
  /**
   * Override tick to request time advance from backend
   */
  async tick() {
    if (!this.isRunning) return
    
    if (this.timeControllerConnected) {
      // Request time advance from backend
      try {
        const response = await fetch(`${this.simulationEngineUrl}/api/time/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'advance',
            deltaMs: this.tickInterval * this.speedMultiplier
          })
        })
        
        if (response.ok) {
          const result = await response.json()
          this.setSimulationTime(result.state.simulationTime)
        }
      } catch (error) {
        console.warn('[TimeAwareEngine] Failed to advance time:', error)
      }
    }
    
    // Continue with normal tick processing
    await super.tick()
  }
  
  /**
   * Override speed control to sync with backend
   */
  setSpeed(multiplier: number) {
    super.setSpeed(multiplier)
    
    if (this.timeControllerConnected) {
      fetch(`${this.simulationEngineUrl}/api/time/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'setSpeed',
          speed: multiplier
        })
      }).catch(error => {
        console.warn('[TimeAwareEngine] Failed to set speed:', error)
      })
    }
  }
  
  /**
   * Override reset to sync with backend
   */
  reset(): void {
    super.reset()
    
    if (this.timeControllerConnected) {
      fetch(`${this.simulationEngineUrl}/api/time/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'reset'
        })
      }).catch(error => {
        console.warn('[TimeAwareEngine] Failed to reset time:', error)
      })
    }
  }
  
  /**
   * Start backend time controller
   */
  async startTimeController() {
    if (this.timeControllerConnected) {
      try {
        await fetch(`${this.simulationEngineUrl}/api/time/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'start' })
        })
      } catch (error) {
        console.warn('[TimeAwareEngine] Failed to start time controller:', error)
      }
    }
  }
  
  /**
   * Stop backend time controller
   */
  async stopTimeController() {
    if (this.timeControllerConnected) {
      try {
        await fetch(`${this.simulationEngineUrl}/api/time/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'stop' })
        })
      } catch (error) {
        console.warn('[TimeAwareEngine] Failed to stop time controller:', error)
      }
    }
  }
  
  /**
   * Clean up SSE connection
   */
  destroy() {
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }
  
  /**
   * Get time controller connection status
   */
  isTimeControllerConnected(): boolean {
    return this.timeControllerConnected
  }
}