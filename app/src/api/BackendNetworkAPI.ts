import type { NetworkEvent } from '../network/simulator'

export class BackendNetworkAPI {
  private networkServiceUrl: string
  
  constructor(networkServiceUrl: string = 'http://localhost:3004') {
    this.networkServiceUrl = networkServiceUrl
  }
  
  async getNetworkEvents(limit: number = 100): Promise<NetworkEvent[]> {
    try {
      const response = await fetch(`${this.networkServiceUrl}/api/network-events?limit=${limit}`)
      if (!response.ok) {
        throw new Error(`Failed to fetch network events: ${response.statusText}`)
      }
      
      const data = await response.json()
      return data.events || []
    } catch (error) {
      console.error('[BackendNetworkAPI] Error fetching network events:', error)
      return []
    }
  }
  
  async getNetworkStats(): Promise<any> {
    try {
      const response = await fetch(`${this.networkServiceUrl}/api/stats`)
      if (!response.ok) {
        throw new Error(`Failed to fetch network stats: ${response.statusText}`)
      }
      
      return await response.json()
    } catch (error) {
      console.error('[BackendNetworkAPI] Error fetching network stats:', error)
      return null
    }
  }
  
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.networkServiceUrl}/health`)
      return response.ok
    } catch (error) {
      return false
    }
  }
}