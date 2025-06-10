// API client for the simulation engine
export class SimulationEngineAPI {
  private baseUrl: string
  private eventSource: EventSource | null = null

  constructor(baseUrl = 'http://localhost:3000') {
    this.baseUrl = baseUrl
  }

  // Record an event
  async recordEvent(event: {
    type: 'message' | 'device_status' | 'sync'
    device: string
    content?: string
    attachments?: any[]
    online?: boolean
    source?: 'manual' | 'simulation'
  }): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/api/events/record`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(event)
      })
      
      if (!response.ok) {
        throw new Error(`Failed to record event: ${response.statusText}`)
      }
    } catch (error) {
      console.error('[SimulationEngineAPI] Error recording event:', error)
    }
  }

  // Subscribe to event stream
  subscribeToEvents(onEvent: (event: any) => void): () => void {
    this.eventSource = new EventSource(`${this.baseUrl}/api/events/stream`)
    
    this.eventSource.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        onEvent(event)
      } catch (error) {
        console.error('[SimulationEngineAPI] Error parsing event:', error)
      }
    }
    
    this.eventSource.onerror = (error) => {
      console.error('[SimulationEngineAPI] EventSource error:', error)
    }
    
    // Return cleanup function
    return () => {
      if (this.eventSource) {
        this.eventSource.close()
        this.eventSource = null
      }
    }
  }

  // Start replay
  async startReplay(scenario: string, mode: 'test' | 'live' = 'live', speed = 1): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/replay/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ scenario, mode, speed })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to start replay: ${response.statusText}`)
    }
  }

  // Stop replay
  async stopReplay(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/replay/stop`, {
      method: 'POST'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to stop replay: ${response.statusText}`)
    }
  }

  // Save scenario
  async saveScenario(name: string, description?: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/scenarios/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to save scenario: ${response.statusText}`)
    }
  }

  // List scenarios
  async listScenarios(): Promise<any[]> {
    const response = await fetch(`${this.baseUrl}/api/scenarios`)
    
    if (!response.ok) {
      throw new Error(`Failed to list scenarios: ${response.statusText}`)
    }
    
    const data = await response.json()
    return data.scenarios
  }

  // Clear events
  async clearEvents(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/events/clear`, {
      method: 'DELETE'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to clear events: ${response.statusText}`)
    }
  }

  // Check if simulation engine is available
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`)
      return response.ok
    } catch {
      return false
    }
  }
}

// Singleton instance
export const simulationEngineAPI = new SimulationEngineAPI()