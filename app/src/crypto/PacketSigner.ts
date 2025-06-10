import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { KeyManager } from './KeyManager'

// Initialize sha512 for the ed25519 library
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

export interface SignedPacket {
  payload: Uint8Array      // The actual packet data
  deviceId: string         // Sender's device ID
  timestamp: number        // Unix timestamp for replay protection
  signature: Uint8Array    // Ed25519 signature
}

export interface PacketSignerConfig {
  maxClockSkew: number     // Max allowed time difference in ms (default: 60000)
  replayWindow: number     // How long to remember seen packets in ms (default: 300000)
}

/**
 * Handles signing and verification of UDP packets using Ed25519
 */
export class PacketSigner {
  private seenPackets: Map<string, number> = new Map() // packet hash -> timestamp
  private config: PacketSignerConfig
  
  constructor(
    private keyManager: KeyManager,
    config?: Partial<PacketSignerConfig>
  ) {
    this.config = {
      maxClockSkew: config?.maxClockSkew ?? 60000,    // 1 minute
      replayWindow: config?.replayWindow ?? 300000     // 5 minutes
    }
    
    // Periodically clean up old packet hashes
    setInterval(() => this.cleanupSeenPackets(), 60000) // Every minute
  }
  
  /**
   * Sign a packet payload
   */
  async signPacket(payload: Uint8Array, deviceId: string): Promise<SignedPacket> {
    const timestamp = Date.now()
    
    // Create signing input: payload || deviceId || timestamp
    const deviceIdBytes = new TextEncoder().encode(deviceId)
    const timestampBytes = new Uint8Array(8)
    new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(timestamp), false)
    
    const signingInput = new Uint8Array(
      payload.length + deviceIdBytes.length + timestampBytes.length
    )
    signingInput.set(payload, 0)
    signingInput.set(deviceIdBytes, payload.length)
    signingInput.set(timestampBytes, payload.length + deviceIdBytes.length)
    
    // Sign with private key
    const signature = await ed.sign(signingInput, this.keyManager.getPrivateKey())
    
    return {
      payload,
      deviceId,
      timestamp,
      signature
    }
  }
  
  /**
   * Verify a signed packet
   */
  async verifyPacket(packet: SignedPacket): Promise<boolean> {
    try {
      // Check if sender is trusted
      const senderPublicKey = this.keyManager.getPeerPublicKey(packet.deviceId)
      if (!senderPublicKey) {
        console.warn(`[PacketSigner] Unknown sender: ${packet.deviceId}`)
        return false
      }
      
      // Check timestamp (prevent replay attacks)
      const now = Date.now()
      const timeDiff = Math.abs(now - packet.timestamp)
      if (timeDiff > this.config.maxClockSkew) {
        console.warn(`[PacketSigner] Packet timestamp too far off: ${timeDiff}ms`)
        return false
      }
      
      // Check for replay
      const packetHash = await this.hashPacket(packet)
      if (this.seenPackets.has(packetHash)) {
        console.warn(`[PacketSigner] Replay detected for packet from ${packet.deviceId}`)
        return false
      }
      
      // Reconstruct signing input
      const deviceIdBytes = new TextEncoder().encode(packet.deviceId)
      const timestampBytes = new Uint8Array(8)
      new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(packet.timestamp), false)
      
      const signingInput = new Uint8Array(
        packet.payload.length + deviceIdBytes.length + timestampBytes.length
      )
      signingInput.set(packet.payload, 0)
      signingInput.set(deviceIdBytes, packet.payload.length)
      signingInput.set(timestampBytes, packet.payload.length + deviceIdBytes.length)
      
      // Verify signature
      const isValid = await ed.verify(packet.signature, signingInput, senderPublicKey)
      
      if (isValid) {
        // Remember this packet to prevent replay
        this.seenPackets.set(packetHash, now)
      }
      
      return isValid
    } catch (error) {
      console.error('[PacketSigner] Verification error:', error)
      return false
    }
  }
  
  /**
   * Serialize a signed packet for network transmission
   */
  serializePacket(packet: SignedPacket): Uint8Array {
    const deviceIdBytes = new TextEncoder().encode(packet.deviceId)
    const timestampBytes = new Uint8Array(8)
    new DataView(timestampBytes.buffer).setBigUint64(0, BigInt(packet.timestamp), false)
    
    // Format: [1 byte deviceId length][deviceId][8 bytes timestamp][64 bytes signature][payload]
    const totalLength = 1 + deviceIdBytes.length + 8 + 64 + packet.payload.length
    const serialized = new Uint8Array(totalLength)
    
    let offset = 0
    
    // Device ID length and data
    serialized[offset++] = deviceIdBytes.length
    serialized.set(deviceIdBytes, offset)
    offset += deviceIdBytes.length
    
    // Timestamp
    serialized.set(timestampBytes, offset)
    offset += 8
    
    // Signature (Ed25519 signatures are always 64 bytes)
    serialized.set(packet.signature, offset)
    offset += 64
    
    // Payload
    serialized.set(packet.payload, offset)
    
    return serialized
  }
  
  /**
   * Deserialize a packet from network format
   */
  deserializePacket(data: Uint8Array): SignedPacket | null {
    try {
      let offset = 0
      
      // Device ID length and data
      const deviceIdLength = data[offset++]
      const deviceIdBytes = data.slice(offset, offset + deviceIdLength)
      const deviceId = new TextDecoder().decode(deviceIdBytes)
      offset += deviceIdLength
      
      // Timestamp
      const timestampBytes = data.slice(offset, offset + 8)
      const timestamp = Number(new DataView(timestampBytes.buffer, timestampBytes.byteOffset).getBigUint64(0, false))
      offset += 8
      
      // Signature
      const signature = data.slice(offset, offset + 64)
      offset += 64
      
      // Payload (rest of the data)
      const payload = data.slice(offset)
      
      return {
        payload,
        deviceId,
        timestamp,
        signature
      }
    } catch (error) {
      console.error('[PacketSigner] Deserialization error:', error)
      return null
    }
  }
  
  /**
   * Hash a packet for replay detection
   */
  private async hashPacket(packet: SignedPacket): Promise<string> {
    const data = new Uint8Array(packet.signature.length + 8)
    data.set(packet.signature, 0)
    new DataView(data.buffer, packet.signature.length).setBigUint64(0, BigInt(packet.timestamp), false)
    
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    return Buffer.from(hashBuffer).toString('hex')
  }
  
  /**
   * Clean up old packet hashes to prevent memory leak
   */
  private cleanupSeenPackets(): void {
    const now = Date.now()
    const cutoff = now - this.config.replayWindow
    
    for (const [hash, timestamp] of this.seenPackets.entries()) {
      if (timestamp < cutoff) {
        this.seenPackets.delete(hash)
      }
    }
  }
}