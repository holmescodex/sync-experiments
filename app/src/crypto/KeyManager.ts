import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'

// Initialize sha512 for the ed25519 library
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

export interface DeviceKeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
  deviceId: string
}

export interface PublicKeyInfo {
  publicKey: Uint8Array
  deviceId: string
}

/**
 * Manages Ed25519 keys for device authentication and packet signing
 */
export class KeyManager {
  private deviceKeyPair: DeviceKeyPair | null = null
  private trustedPeers: Map<string, Uint8Array> = new Map()
  
  constructor(private deviceId: string) {}
  
  /**
   * Initialize key manager with a new or existing keypair
   */
  async initialize(existingPrivateKey?: Uint8Array): Promise<void> {
    if (existingPrivateKey) {
      // Restore from existing private key
      const publicKey = await ed.getPublicKey(existingPrivateKey)
      this.deviceKeyPair = {
        publicKey,
        privateKey: existingPrivateKey,
        deviceId: this.deviceId
      }
    } else {
      // Generate new keypair
      await this.generateKeyPair()
    }
  }
  
  /**
   * Generate a new Ed25519 keypair for this device
   */
  private async generateKeyPair(): Promise<void> {
    // Generate random 32 bytes for private key
    const privateKey = new Uint8Array(32)
    crypto.getRandomValues(privateKey)
    const publicKey = await ed.getPublicKey(privateKey)
    
    this.deviceKeyPair = {
      publicKey,
      privateKey,
      deviceId: this.deviceId
    }
  }
  
  /**
   * Get this device's public key
   */
  getPublicKey(): Uint8Array {
    if (!this.deviceKeyPair) {
      throw new Error('KeyManager not initialized')
    }
    return this.deviceKeyPair.publicKey
  }
  
  /**
   * Get this device's private key (for signing)
   */
  getPrivateKey(): Uint8Array {
    if (!this.deviceKeyPair) {
      throw new Error('KeyManager not initialized')
    }
    return this.deviceKeyPair.privateKey
  }
  
  /**
   * Add a trusted peer's public key
   */
  addTrustedPeer(deviceId: string, publicKey: Uint8Array): void {
    this.trustedPeers.set(deviceId, publicKey)
  }
  
  /**
   * Remove a peer from trusted list
   */
  removeTrustedPeer(deviceId: string): void {
    this.trustedPeers.delete(deviceId)
  }
  
  /**
   * Get a peer's public key
   */
  getPeerPublicKey(deviceId: string): Uint8Array | undefined {
    return this.trustedPeers.get(deviceId)
  }
  
  /**
   * Check if a peer is trusted
   */
  isTrustedPeer(deviceId: string): boolean {
    return this.trustedPeers.has(deviceId)
  }
  
  /**
   * Get all trusted peers
   */
  getTrustedPeers(): PublicKeyInfo[] {
    return Array.from(this.trustedPeers.entries()).map(([deviceId, publicKey]) => ({
      deviceId,
      publicKey
    }))
  }
  
  /**
   * Export public key as base64 for easy sharing
   */
  exportPublicKeyBase64(): string {
    if (!this.deviceKeyPair) {
      throw new Error('KeyManager not initialized')
    }
    return Buffer.from(this.deviceKeyPair.publicKey).toString('base64')
  }
  
  /**
   * Import peer public key from base64
   */
  importPeerPublicKeyBase64(deviceId: string, publicKeyBase64: string): void {
    const publicKey = new Uint8Array(Buffer.from(publicKeyBase64, 'base64'))
    this.addTrustedPeer(deviceId, publicKey)
  }
}