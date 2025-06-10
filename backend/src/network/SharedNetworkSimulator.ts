import { NetworkSimulator } from './NetworkSimulator'

// Singleton shared network simulator
// In production, this would be a separate microservice
class SharedNetworkSimulator {
  private static instance: NetworkSimulator | null = null
  
  static getInstance(): NetworkSimulator {
    if (!SharedNetworkSimulator.instance) {
      SharedNetworkSimulator.instance = new NetworkSimulator()
      console.log('[SharedNetworkSimulator] Created shared network instance')
    }
    return SharedNetworkSimulator.instance
  }
  
  static reset(): void {
    if (SharedNetworkSimulator.instance) {
      SharedNetworkSimulator.instance.reset()
    }
    SharedNetworkSimulator.instance = null
  }
}

export { SharedNetworkSimulator }