export interface DeviceStats {
  deviceId: string
  eventCount: number
  messageCount: number
  syncPercentage: number
  isOnline: boolean
  timestamp: number
}

export class BackendStatsAPI {
  private backendUrl: string
  
  constructor(backendUrl: string) {
    this.backendUrl = backendUrl
  }
  
  async getStats(): Promise<DeviceStats | null> {
    try {
      const response = await fetch(`${this.backendUrl}/api/stats`)
      if (!response.ok) {
        throw new Error(`Failed to fetch stats: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('[BackendStatsAPI] Error fetching stats:', error)
      return null
    }
  }
  
  async setDeviceStatus(online: boolean): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/api/device-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ online })
      })
      
      if (!response.ok) {
        throw new Error(`Failed to set device status: ${response.statusText}`)
      }
      
      const result = await response.json()
      return result.success
    } catch (error) {
      console.error('[BackendStatsAPI] Error setting device status:', error)
      return false
    }
  }
  
  async getNetworkConfig(): Promise<any> {
    try {
      const response = await fetch(`${this.backendUrl}/api/network-config`)
      if (!response.ok) {
        throw new Error(`Failed to fetch network config: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('[BackendStatsAPI] Error fetching network config:', error)
      return null
    }
  }
  
  async updateNetworkConfig(config: any): Promise<boolean> {
    try {
      const response = await fetch(`${this.backendUrl}/api/network-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(config)
      })
      
      if (!response.ok) {
        throw new Error(`Failed to update network config: ${response.statusText}`)
      }
      
      const result = await response.json()
      return result.success
    } catch (error) {
      console.error('[BackendStatsAPI] Error updating network config:', error)
      return false
    }
  }
  
  async getNetworkStats(): Promise<any> {
    try {
      const response = await fetch(`${this.backendUrl}/api/network-stats`)
      if (!response.ok) {
        throw new Error(`Failed to fetch network stats: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('[BackendStatsAPI] Error fetching network stats:', error)
      return null
    }
  }
}