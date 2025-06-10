import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { randomBytes } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'

// Initialize sha512 for the ed25519 library
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

export interface DeviceKeyPair {
  publicKey: Uint8Array
  privateKey: Uint8Array
  deviceId: string
}

/**
 * Manages Ed25519 keys for device authentication in the backend
 * 
 * IMPORTANT: This class distinguishes between:
 * - Known peers: Devices whose public keys we have (for verification)
 * - Trusted peers: Devices we explicitly trust (for accepting messages)
 * 
 * All peers can verify signatures, but only trusted peers' messages are accepted
 */
export class KeyManager {
  private keyPair: DeviceKeyPair | null = null
  private knownPeers: Map<string, Uint8Array> = new Map()
  private trustedPeerIds: Set<string> = new Set()
  private keyDir: string
  private trustFile: string
  private usingEnvironmentKeys: boolean = false
  
  constructor(private deviceId: string) {
    // Store keys in a directory relative to backend
    this.keyDir = path.join(__dirname, '..', '..', 'keys')
    this.trustFile = path.join(this.keyDir, `${this.deviceId}.trust`)
  }
  
  /**
   * Initialize key manager - load existing keys or generate new ones
   */
  async initialize(): Promise<void> {
    // Check for keys from environment first (for simulation)
    if (process.env.PRIVATE_KEY && process.env.PUBLIC_KEY) {
      const privateKey = Buffer.from(process.env.PRIVATE_KEY, 'base64')
      const publicKey = Buffer.from(process.env.PUBLIC_KEY, 'base64')
      
      this.keyPair = {
        deviceId: this.deviceId,
        privateKey: new Uint8Array(privateKey),
        publicKey: new Uint8Array(publicKey)
      }
      
      this.usingEnvironmentKeys = true
      console.log(`[KeyManager] Loaded keys from environment for ${this.deviceId}`)
      
      // Load peer keys from environment
      if (process.env.PEER_KEYS) {
        const peerKeys = JSON.parse(process.env.PEER_KEYS)
        for (const [peerId, keyBase64] of Object.entries(peerKeys)) {
          const peerPublicKey = Buffer.from(keyBase64 as string, 'base64')
          this.addPeerPublicKey(peerId, new Uint8Array(peerPublicKey))
        }
      }
      
      // Load trusted peers from environment
      if (process.env.TRUSTED_PEERS) {
        const trustedPeers = process.env.TRUSTED_PEERS.split(',').filter(p => p)
        for (const peerId of trustedPeers) {
          this.trustPeer(peerId)
        }
      }
      
      return
    }
    
    // Ensure key directory exists
    if (!fs.existsSync(this.keyDir)) {
      fs.mkdirSync(this.keyDir, { recursive: true })
    }
    
    const privateKeyPath = path.join(this.keyDir, `${this.deviceId}.key`)
    const publicKeyPath = path.join(this.keyDir, `${this.deviceId}.pub`)
    
    if (fs.existsSync(privateKeyPath)) {
      // Load existing keys
      const privateKey = new Uint8Array(fs.readFileSync(privateKeyPath))
      const publicKey = new Uint8Array(fs.readFileSync(publicKeyPath))
      
      this.keyPair = {
        privateKey,
        publicKey,
        deviceId: this.deviceId
      }
      
      console.log(`[KeyManager] Loaded existing keys for ${this.deviceId}`)
    } else {
      // Generate new keypair
      const privateKey = randomBytes(32)
      const publicKey = await ed.getPublicKey(privateKey)
      
      this.keyPair = {
        privateKey: new Uint8Array(privateKey),
        publicKey,
        deviceId: this.deviceId
      }
      
      // Save keys
      fs.writeFileSync(privateKeyPath, Buffer.from(this.keyPair.privateKey))
      fs.writeFileSync(publicKeyPath, Buffer.from(this.keyPair.publicKey))
      
      console.log(`[KeyManager] Generated new keys for ${this.deviceId}`)
    }
    
    // Load known peers and trust relationships
    this.loadKnownPeers()
    this.loadTrustRelationships()
  }
  
  /**
   * Load all known peer public keys (for signature verification)
   */
  private loadKnownPeers(): void {
    const files = fs.readdirSync(this.keyDir)
    
    for (const file of files) {
      if (file.endsWith('.pub') && !file.startsWith(this.deviceId)) {
        const peerId = file.replace('.pub', '')
        const publicKey = new Uint8Array(fs.readFileSync(path.join(this.keyDir, file)))
        this.knownPeers.set(peerId, publicKey)
        console.log(`[KeyManager] Loaded public key for peer: ${peerId}`)
      }
    }
  }
  
  /**
   * Load trust relationships from file
   */
  private loadTrustRelationships(): void {
    if (fs.existsSync(this.trustFile)) {
      const trustData = fs.readFileSync(this.trustFile, 'utf-8')
      const trustedIds = trustData.split('\n').filter(id => id.trim())
      trustedIds.forEach(id => this.trustedPeerIds.add(id))
      console.log(`[KeyManager] Loaded trust relationships: ${Array.from(this.trustedPeerIds).join(', ')}`)
    } else {
      console.log(`[KeyManager] No trust relationships found for ${this.deviceId}`)
    }
  }
  
  /**
   * Save trust relationships to file
   */
  private saveTrustRelationships(): void {
    if (this.usingEnvironmentKeys) {
      return
    }
    const trustData = Array.from(this.trustedPeerIds).join('\n')
    fs.writeFileSync(this.trustFile, trustData)
  }
  
  /**
   * Add a peer's public key (for verification)
   */
  addPeerPublicKey(peerId: string, publicKey: Uint8Array): void {
    this.knownPeers.set(peerId, publicKey)
    console.log(`[KeyManager] Added public key for peer: ${peerId}`)
  }
  
  /**
   * Get this device's keypair
   */
  getKeyPair(): DeviceKeyPair {
    if (!this.keyPair) {
      throw new Error('KeyManager not initialized')
    }
    return this.keyPair
  }
  
  /**
   * Get all known peers (for signature verification)
   */
  getKnownPeers(): Map<string, Uint8Array> {
    return this.knownPeers
  }
  
  /**
   * Get only trusted peers (for accepting messages)
   */
  getTrustedPeers(): Map<string, Uint8Array> {
    const trusted = new Map<string, Uint8Array>()
    for (const [peerId, publicKey] of this.knownPeers) {
      if (this.trustedPeerIds.has(peerId)) {
        trusted.set(peerId, publicKey)
      }
    }
    return trusted
  }
  
  /**
   * Check if a peer is trusted
   */
  isTrusted(peerId: string): boolean {
    return this.trustedPeerIds.has(peerId)
  }
  
  /**
   * Add a peer to the trust list
   */
  trustPeer(peerId: string): void {
    if (!this.knownPeers.has(peerId) && !this.usingEnvironmentKeys) {
      throw new Error(`Cannot trust unknown peer: ${peerId}`)
    }
    this.trustedPeerIds.add(peerId)
    this.saveTrustRelationships()
    console.log(`[KeyManager] Added ${peerId} to trust list`)
  }
  
  /**
   * Remove a peer from the trust list
   */
  untrustPeer(peerId: string): void {
    this.trustedPeerIds.delete(peerId)
    this.saveTrustRelationships()
    console.log(`[KeyManager] Removed ${peerId} from trust list`)
  }
  
  /**
   * Export public key as base64 for easy sharing
   */
  exportPublicKeyBase64(): string {
    if (!this.keyPair) {
      throw new Error('KeyManager not initialized')
    }
    return Buffer.from(this.keyPair.publicKey).toString('base64')
  }
}