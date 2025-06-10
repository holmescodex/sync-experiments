import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import * as crypto from 'crypto'

// Initialize sha512 for the ed25519 library
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

export interface SignedEvent {
  payload: any           // The actual event data
  author: string         // Device that created it
  timestamp: number      // When created
  signature: Uint8Array  // Ed25519 signature
}

export interface EncryptedEvent {
  nonce: Uint8Array      // Random nonce for encryption
  ciphertext: Uint8Array // Encrypted(SignedEvent)
}

/**
 * Handles event signing and encryption according to the documented approach:
 * - Events are signed by their author for authenticity
 * - Then encrypted with community PSK for privacy
 * - This becomes the canonical representation stored in DB
 * 
 * IMPORTANT: Distinguishes between:
 * - Known peers: Can verify signatures (all peers with public keys)
 * - Trusted peers: Can have their messages accepted
 */
export class EventCrypto {
  private psk: Buffer
  
  constructor(
    private deviceId: string,
    private privateKey: Uint8Array,
    private publicKey: Uint8Array,
    private knownPeers: Map<string, Uint8Array>,
    private trustedPeers: Map<string, Uint8Array>,
    communityPSK: string | Buffer
  ) {
    // Convert PSK to bytes if needed
    if (typeof communityPSK === 'string') {
      // Use SHA-256 to derive a consistent 32-byte key from string
      const hash = crypto.createHash('sha256')
      hash.update(communityPSK)
      this.psk = hash.digest()
    } else {
      this.psk = communityPSK
    }
  }
  
  /**
   * Sign and encrypt an event for storage
   * This is called when creating a new event
   */
  async signAndEncryptEvent(eventData: any): Promise<EncryptedEvent> {
    const timestamp = Date.now()
    
    // Create signed event
    const signedEvent: SignedEvent = {
      payload: eventData,
      author: this.deviceId,
      timestamp,
      signature: new Uint8Array() // Will be filled
    }
    
    // Sign the event
    const dataToSign = this.serializeForSigning(signedEvent)
    signedEvent.signature = await ed.sign(dataToSign, this.privateKey)
    
    // Encrypt the signed event
    const signedEventBytes = this.serializeSignedEvent(signedEvent)
    return await this.encryptWithPSK(signedEventBytes)
  }
  
  /**
   * Decrypt and verify an event from storage or network
   * Returns null if decryption or verification fails
   * 
   * Note: Only returns events from trusted peers, but uses all known peers
   * for signature verification
   */
  async decryptAndVerifyEvent(encrypted: EncryptedEvent, acceptUntrusted: boolean = false): Promise<SignedEvent | null> {
    try {
      // Step 1: Decrypt with PSK
      const decrypted = await this.decryptWithPSK(encrypted)
      if (!decrypted) {
        console.warn('[EventCrypto] Failed to decrypt - wrong PSK or corrupted')
        return null
      }
      
      // Step 2: Deserialize signed event
      const signedEvent = this.deserializeSignedEvent(decrypted)
      if (!signedEvent) {
        console.warn('[EventCrypto] Failed to deserialize signed event')
        return null
      }
      
      // Step 3: Check timestamp for freshness (optional, may skip for stored events)
      const age = Date.now() - signedEvent.timestamp
      if (age < 0 || age > 365 * 24 * 60 * 60 * 1000) { // Reject if from future or > 1 year old
        console.warn(`[EventCrypto] Event timestamp out of range: ${age}ms`)
        return null
      }
      
      // Step 4: Get public key for verification (from all known peers)
      const publicKey = this.getPublicKeyForVerification(signedEvent.author)
      if (!publicKey) {
        console.warn(`[EventCrypto] Unknown author: ${signedEvent.author}`)
        return null
      }
      
      // Step 5: Verify signature
      const dataToVerify = this.serializeForSigning(signedEvent)
      const isValid = await ed.verify(signedEvent.signature, dataToVerify, publicKey)
      
      if (!isValid) {
        console.warn(`[EventCrypto] Invalid signature from ${signedEvent.author}`)
        return null
      }
      
      // Step 6: Check trust (unless explicitly accepting untrusted)
      if (!acceptUntrusted && !this.isTrusted(signedEvent.author)) {
        console.warn(`[EventCrypto] Event from untrusted peer: ${signedEvent.author}`)
        return null
      }
      
      return signedEvent
    } catch (error) {
      console.error('[EventCrypto] Error processing event:', error)
      return null
    }
  }
  
  /**
   * Encrypt data with community PSK using AES-256-GCM
   */
  private async encryptWithPSK(data: Buffer): Promise<EncryptedEvent> {
    const nonce = crypto.randomBytes(12) // 96-bit nonce for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', this.psk, nonce)
    
    const ciphertext = Buffer.concat([
      cipher.update(data),
      cipher.final(),
      cipher.getAuthTag() // 16-byte auth tag
    ])
    
    return {
      nonce: new Uint8Array(nonce),
      ciphertext: new Uint8Array(ciphertext)
    }
  }
  
  /**
   * Decrypt data with community PSK
   */
  private async decryptWithPSK(encrypted: EncryptedEvent): Promise<Buffer | null> {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.psk, Buffer.from(encrypted.nonce))
      
      // Extract auth tag (last 16 bytes)
      const authTag = encrypted.ciphertext.slice(-16)
      const ciphertext = encrypted.ciphertext.slice(0, -16)
      
      decipher.setAuthTag(Buffer.from(authTag))
      
      const plaintext = Buffer.concat([
        decipher.update(Buffer.from(ciphertext)),
        decipher.final()
      ])
      
      return plaintext
    } catch (error) {
      // Decryption failed - wrong PSK or corrupted
      return null
    }
  }
  
  /**
   * Get public key for signature verification (from all known peers)
   */
  private getPublicKeyForVerification(deviceId: string): Uint8Array | null {
    if (deviceId === this.deviceId) {
      return this.publicKey
    }
    return this.knownPeers.get(deviceId) || null
  }
  
  /**
   * Check if a device is trusted
   */
  private isTrusted(deviceId: string): boolean {
    if (deviceId === this.deviceId) {
      return true // Always trust ourselves
    }
    return this.trustedPeers.has(deviceId)
  }
  
  /**
   * Serialize signed event for signing (excludes signature field)
   */
  private serializeForSigning(event: SignedEvent): Buffer {
    const data = {
      payload: event.payload,
      author: event.author,
      timestamp: event.timestamp
    }
    return Buffer.from(JSON.stringify(data))
  }
  
  /**
   * Serialize complete signed event including signature
   */
  private serializeSignedEvent(event: SignedEvent): Buffer {
    // Convert signature to base64 for JSON serialization
    const eventWithBase64Sig = {
      ...event,
      signature: Buffer.from(event.signature).toString('base64')
    }
    return Buffer.from(JSON.stringify(eventWithBase64Sig))
  }
  
  /**
   * Deserialize signed event from bytes
   */
  private deserializeSignedEvent(data: Buffer): SignedEvent | null {
    try {
      const json = JSON.parse(data.toString())
      
      // Convert base64 signature back to Uint8Array
      return {
        payload: json.payload,
        author: json.author,
        timestamp: json.timestamp,
        signature: new Uint8Array(Buffer.from(json.signature, 'base64'))
      }
    } catch (error) {
      return null
    }
  }
  
  /**
   * Convert encrypted event to bytes for storage
   * Format: [12 bytes nonce][remaining bytes ciphertext]
   */
  static encryptedEventToBuffer(encrypted: EncryptedEvent): Buffer {
    return Buffer.concat([
      Buffer.from(encrypted.nonce),
      Buffer.from(encrypted.ciphertext)
    ])
  }
  
  /**
   * Convert bytes from storage back to encrypted event
   */
  static bufferToEncryptedEvent(buffer: Buffer): EncryptedEvent {
    return {
      nonce: new Uint8Array(buffer.slice(0, 12)),
      ciphertext: new Uint8Array(buffer.slice(12))
    }
  }
}