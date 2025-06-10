import { NetworkSimulator, NetworkEvent } from './simulator'
import { SecureMessageLayer, EncryptedPacket } from '../crypto/SecureMessageLayer'
import { NetworkInterface } from './NetworkInterface'

/**
 * Adapter that wraps NetworkSimulator with secure message handling
 * Automatically signs and encrypts outgoing messages, verifies and decrypts incoming
 */
export class SecureNetworkAdapter implements NetworkInterface {
  private eventHandlers: Array<(event: NetworkEvent) => void> = []
  
  constructor(
    private deviceId: string,
    private network: NetworkSimulator,
    private secureLayer: SecureMessageLayer
  ) {
    // Set up network event interception
    this.network.onNetworkEvent(async (event) => {
      if (event.targetDevice === this.deviceId && event.status === 'delivered') {
        await this.handleIncomingPacket(event)
      }
    })
  }
  
  /**
   * Send a secure packet to a specific device
   */
  async sendPacket(targetDevice: string, payload: any, type: string = 'sync'): Promise<void> {
    // Sign and encrypt the payload
    const encrypted = await this.secureLayer.prepareOutgoingMessage(payload)
    
    // Convert to JSON-serializable format
    const packetData = {
      nonce: Array.from(encrypted.nonce),
      ciphertext: Array.from(encrypted.ciphertext)
    }
    
    // Send through network simulator
    this.network.sendPacket(this.deviceId, targetDevice, packetData, type)
  }
  
  /**
   * Broadcast a secure packet to all peers
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
   * Handle incoming packets - decrypt and verify
   */
  private async handleIncomingPacket(event: NetworkEvent): Promise<void> {
    try {
      // Check if this is an encrypted packet
      if (event.payload?.nonce && event.payload?.ciphertext) {
        // Convert arrays back to Uint8Arrays
        const encrypted: EncryptedPacket = {
          nonce: new Uint8Array(event.payload.nonce),
          ciphertext: new Uint8Array(event.payload.ciphertext)
        }
        
        // Decrypt and verify
        const result = await this.secureLayer.processIncomingPacket(encrypted)
        
        if (!result) {
          console.warn(`[SecureNetwork] Failed to process packet from ${event.sourceDevice}`)
          return
        }
        
        if (!result.verified) {
          console.warn(`[SecureNetwork] Unverified packet from ${result.deviceId}`)
          // Still process but mark as unverified
        }
        
        // Create verified event with decrypted payload
        const verifiedEvent: NetworkEvent = {
          ...event,
          payload: result.payload,
          verified: result.verified
        }
        
        // Dispatch to handlers
        for (const handler of this.eventHandlers) {
          handler(verifiedEvent)
        }
      } else {
        // Legacy unencrypted packet
        console.warn(`[SecureNetwork] Received unencrypted packet from ${event.sourceDevice}`)
        
        // For backwards compatibility during migration
        const unverifiedEvent = { ...event, verified: false }
        for (const handler of this.eventHandlers) {
          handler(unverifiedEvent)
        }
      }
    } catch (error) {
      console.error(`[SecureNetwork] Error processing packet from ${event.sourceDevice}:`, error)
    }
  }
  
  /**
   * Register a handler for verified network events
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
}