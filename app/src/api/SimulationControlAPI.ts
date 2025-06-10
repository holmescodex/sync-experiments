/**
 * API client for Simulation Control Service
 * Manages automatic message generation across all devices
 */
export class SimulationControlAPI {
  private baseUrl: string

  constructor(baseUrl: string = 'http://localhost:3005') {
    this.baseUrl = baseUrl
  }

  /**
   * Get simulation configuration and status
   */
  async getConfig(): Promise<{
    globalMessagesPerHour: number
    imageAttachmentPercentage: number
    enabledDevices: string[]
    simulationSpeed: number
    isRunning: boolean
  }> {
    const response = await fetch(`${this.baseUrl}/api/simulation/config`)
    if (!response.ok) {
      throw new Error(`Failed to get simulation config: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Get simulation status with device rates
   */
  async getStatus(): Promise<{
    globalMessagesPerHour: number
    deviceRates: Record<string, number>
    imageAttachmentPercentage: number
    isRunning: boolean
  }> {
    const response = await fetch(`${this.baseUrl}/api/simulation/status`)
    if (!response.ok) {
      throw new Error(`Failed to get simulation status: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Enable or disable a device
   */
  async setDeviceEnabled(deviceId: string, enabled: boolean): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/devices/${deviceId}/enabled`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to ${enabled ? 'enable' : 'disable'} device ${deviceId}: ${response.statusText}`)
    }
  }

  /**
   * Get device status
   */
  async getDeviceStatus(deviceId: string): Promise<{
    deviceId: string
    enabled: boolean
    messagesPerHour: number
    imageAttachmentPercentage: number
  }> {
    const response = await fetch(`${this.baseUrl}/api/devices/${deviceId}/status`)
    if (!response.ok) {
      throw new Error(`Failed to get device status: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Set global message generation rate
   */
  async setGlobalMessageRate(messagesPerHour: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/simulation/message-rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messagesPerHour })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `Failed to set global message rate: ${response.statusText}`)
    }
  }

  /**
   * Set global image attachment percentage
   */
  async setGlobalAttachmentRate(imageAttachmentPercentage: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/simulation/attachment-rate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageAttachmentPercentage })
    })
    
    if (!response.ok) {
      const error = await response.json()
      throw new Error(error.error || `Failed to set attachment rate: ${response.statusText}`)
    }
  }

  /**
   * Start simulation
   */
  async start(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/simulation/start`, {
      method: 'POST'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to start simulation: ${response.statusText}`)
    }
  }

  /**
   * Pause simulation
   */
  async pause(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/simulation/pause`, {
      method: 'POST'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to pause simulation: ${response.statusText}`)
    }
  }

  /**
   * Set simulation speed
   */
  async setSpeed(speed: number): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/simulation/speed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ speed })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to set simulation speed: ${response.statusText}`)
    }
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/health`)
      return response.ok
    } catch {
      return false
    }
  }
}