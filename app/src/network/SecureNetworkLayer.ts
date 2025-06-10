import { NetworkSimulator, NetworkEvent } from './simulator'
import { PacketSigner, SignedPacket } from '../crypto/PacketSigner'

export interface SecureNetworkConfig {
  deviceId: string
  packetSigner: PacketSigner
  network: NetworkSimulator
}

/**
 * Secure network abstraction that automatically signs outgoing packets
 * and verifies incoming packets using Ed25519 signatures
 */
export class SecureNetworkLayer {
  private deviceId: string
  private packetSigner: PacketSigner
  private network: NetworkSimulator
  private eventHandlers: Array<(event: NetworkEvent) => void> = []
  
  constructor(config: SecureNetworkConfig) {
    this.deviceId = config.deviceId
    this.packetSigner = config.packetSigner
    this.network = config.network
    
    // Set up network event interception
    this.network.onNetworkEvent(async (event) => {
      if (event.targetDevice === this.deviceId && event.status === 'delivered') {
        // Verify and process incoming packets
        await this.handleIncomingPacket(event)
      }
    })
  }
  
  /**
   * Send a packet with automatic signing
   */
  async sendPacket(targetDevice: string, payload: any, type: string = 'sync'): Promise<void> {
    // Serialize the payload
    const payloadBytes = new TextEncoder().encode(JSON.stringify(payload))
    
    // Sign the packet
    const signedPacket = await this.packetSigner.signPacket(payloadBytes, this.deviceId)
    
    // Serialize the signed packet for network transmission
    const serializedPacket = this.packetSigner.serializePacket(signedPacket)
    
    // Send through the network simulator with the signed packet as payload
    this.network.sendPacket(this.deviceId, targetDevice, {
      type: 'signed',
      originalType: type,
      data: Array.from(serializedPacket) // Convert to array for JSON serialization
    }, type)
  }
  
  /**
   * Broadcast a packet to all peers with automatic signing
   */
  async broadcastPacket(payload: any, type: string = 'sync'): Promise<void> {
    // Get all peer devices
    const peers = this.network.getActivePeers(this.deviceId)
    
    // Send to each peer
    for (const peer of peers) {
      await this.sendPacket(peer, payload, type)
    }
  }
  
  /**
   * Handle incoming network events, verify signatures, and dispatch to handlers
   */
  private async handleIncomingPacket(event: NetworkEvent): Promise<void> {
    // Check if this is a signed packet
    if (event.payload?.type === 'signed') {
      try {
        // Reconstruct the signed packet from the network payload
        const serializedData = new Uint8Array(event.payload.data)
        const signedPacket = this.packetSigner.deserializePacket(serializedData)
        
        if (!signedPacket) {
          console.warn(`[SecureNetwork] Failed to deserialize packet from ${event.sourceDevice}`)
          return
        }
        
        // Verify the signature
        const isValid = await this.packetSigner.verifyPacket(signedPacket)
        
        if (!isValid) {
          console.warn(`[SecureNetwork] Invalid signature from ${event.sourceDevice}`)
          return
        }
        
        // Deserialize the original payload
        const originalPayload = JSON.parse(new TextDecoder().decode(signedPacket.payload))
        
        // Create a verified event with the original payload
        const verifiedEvent: NetworkEvent = {
          ...event,
          payload: originalPayload,
          type: event.payload.originalType || event.type,
          verified: true // Mark as cryptographically verified
        }
        
        // Dispatch to registered handlers
        for (const handler of this.eventHandlers) {
          handler(verifiedEvent)
        }
      } catch (error) {
        console.error(`[SecureNetwork] Error processing signed packet:`, error)
      }
    } else {
      // Legacy unsigned packet - log warning but allow for backwards compatibility
      console.warn(`[SecureNetwork] Received unsigned packet from ${event.sourceDevice}`)
      
      // Mark as unverified and dispatch
      const unverifiedEvent = { ...event, verified: false }
      for (const handler of this.eventHandlers) {
        handler(unverifiedEvent)
      }
    }
  }
  
  /**
   * Register an event handler for verified network events
   */
  onNetworkEvent(handler: (event: NetworkEvent) => void): void {
    this.eventHandlers.push(handler)
  }
  
  /**
   * Get active peer devices
   */
  getActivePeers(): string[] {
    return this.network.getActivePeers(this.deviceId)
  }
  
  /**
   * Get network statistics
   */
  getNetworkStats() {
    return this.network.getNetworkStats()
  }
}