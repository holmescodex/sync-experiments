import { NetworkEvent } from './simulator'

/**
 * Common interface for network operations that can be implemented by
 * NetworkSimulator, SecureNetworkAdapter, or other network layers
 */
export interface NetworkInterface {
  /**
   * Send a packet to a specific device
   */
  sendPacket(targetDevice: string, payload: any, type?: string): void | Promise<void>
  
  /**
   * Broadcast a packet to all peers
   */
  broadcastPacket(payload: any, type?: string): void | Promise<void>
  
  /**
   * Register an event handler for incoming network events
   */
  onNetworkEvent(handler: (event: NetworkEvent) => void): void
  
  /**
   * Get list of active peer devices
   */
  getActivePeers(): string[]
}