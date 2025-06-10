import { PacketSigner, SignedPacket } from './PacketSigner'
import { KeyManager } from './KeyManager'

export interface SecureMessage {
  payload: any           // The actual message/data
  deviceId: string       // Sender's device ID  
  timestamp: number      // Unix timestamp
  signature: Uint8Array  // Ed25519 signature
}

export interface EncryptedPacket {
  nonce: Uint8Array     // Random nonce for encryption
  ciphertext: Uint8Array // Encrypted(signed message)
}

/**
 * Handles the complete security flow:
 * Outgoing: Sign → Encrypt with PSK → Send
 * Incoming: Decrypt with PSK → Verify signature → Process
 */
export class SecureMessageLayer {
  private psk: Uint8Array | null = null // Pre-shared key for community encryption
  private pskPromise: Promise<void> | null = null
  
  constructor(
    private deviceId: string,
    private keyManager: KeyManager,
    private packetSigner: PacketSigner,
    psk: string | Uint8Array
  ) {
    // Convert PSK to bytes if needed
    if (typeof psk === 'string') {
      // Use SHA-256 to derive a consistent 32-byte key from string
      this.pskPromise = this.initializePSK(psk)
    } else {
      this.psk = psk
      this.pskPromise = Promise.resolve()
    }
  }
  
  private async initializePSK(pskString: string): Promise<void> {
    const encoder = new TextEncoder()
    const data = encoder.encode(pskString)
    const hash = await crypto.subtle.digest('SHA-256', data)
    this.psk = new Uint8Array(hash)
  }
  
  private async ensurePSK(): Promise<Uint8Array> {
    if (this.pskPromise) {
      await this.pskPromise
    }
    if (!this.psk) {
      throw new Error('PSK not initialized')
    }
    return this.psk
  }
  
  /**
   * Prepare a message for secure transmission:
   * 1. Sign the payload
   * 2. Encrypt the signed message with PSK
   */
  async prepareOutgoingMessage(payload: any): Promise<EncryptedPacket> {
    const timestamp = Date.now()
    
    // Step 1: Create the message with metadata
    const message: SecureMessage = {
      payload,
      deviceId: this.deviceId,
      timestamp,
      signature: new Uint8Array() // Will be filled next
    }
    
    // Step 2: Sign the message (payload + deviceId + timestamp)
    const messageBytes = this.serializeMessageForSigning(message)
    const signature = await this.signMessage(messageBytes)
    message.signature = signature
    
    // Step 3: Encrypt the complete signed message with PSK
    const signedMessageBytes = this.serializeMessage(message)
    const encrypted = await this.encryptWithPSK(signedMessageBytes)
    
    return encrypted
  }
  
  /**
   * Process an incoming encrypted packet:
   * 1. Decrypt with PSK (fails fast if wrong community)
   * 2. Verify signature
   * 3. Return verified payload
   */
  async processIncomingPacket(packet: EncryptedPacket): Promise<{ payload: any, verified: boolean, deviceId: string } | null> {
    try {
      // Step 1: Decrypt with PSK
      const decrypted = await this.decryptWithPSK(packet)
      if (!decrypted) {
        console.warn('[SecureMessage] Failed to decrypt - wrong PSK or corrupted data')
        return null
      }
      
      // Step 2: Deserialize the signed message
      const message = this.deserializeMessage(decrypted)
      if (!message) {
        console.warn('[SecureMessage] Failed to deserialize decrypted message')
        return null
      }
      
      // Step 3: Check timestamp for replay protection
      const now = Date.now()
      const timeDiff = Math.abs(now - message.timestamp)
      if (timeDiff > 60000) { // 1 minute clock skew tolerance
        console.warn(`[SecureMessage] Message timestamp too old: ${timeDiff}ms`)
        return null
      }
      
      // Step 4: Verify signature
      const messageBytes = this.serializeMessageForSigning(message)
      const isValid = await this.verifySignature(messageBytes, message.signature, message.deviceId)
      
      if (!isValid) {
        console.warn(`[SecureMessage] Invalid signature from ${message.deviceId}`)
        return { payload: message.payload, verified: false, deviceId: message.deviceId }
      }
      
      // Step 5: Return verified payload
      return { payload: message.payload, verified: true, deviceId: message.deviceId }
      
    } catch (error) {
      console.error('[SecureMessage] Error processing packet:', error)
      return null
    }
  }
  
  /**
   * Encrypt data with community PSK using AES-256-GCM
   */
  private async encryptWithPSK(data: Uint8Array): Promise<EncryptedPacket> {
    const psk = await this.ensurePSK()
    const nonce = new Uint8Array(12) // 96-bit nonce for GCM
    crypto.getRandomValues(nonce)
    
    // Import PSK as CryptoKey
    const key = await crypto.subtle.importKey(
      'raw',
      psk,
      { name: 'AES-GCM' },
      false,
      ['encrypt']
    )
    
    // Encrypt with AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce },
      key,
      data
    )
    
    return {
      nonce,
      ciphertext: new Uint8Array(ciphertext)
    }
  }
  
  /**
   * Decrypt data with community PSK
   */
  private async decryptWithPSK(packet: EncryptedPacket): Promise<Uint8Array | null> {
    try {
      const psk = await this.ensurePSK()
      // Import PSK as CryptoKey
      const key = await crypto.subtle.importKey(
        'raw',
        psk,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
      )
      
      // Decrypt with AES-GCM
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: packet.nonce },
        key,
        packet.ciphertext
      )
      
      return new Uint8Array(plaintext)
    } catch (error) {
      // Decryption failed - wrong PSK or corrupted data
      return null
    }
  }
  
  /**
   * Sign message data
   */
  private async signMessage(data: Uint8Array): Promise<Uint8Array> {
    const signedPacket = await this.packetSigner.signPacket(data, this.deviceId)
    return signedPacket.signature
  }
  
  /**
   * Verify message signature
   */
  private async verifySignature(data: Uint8Array, signature: Uint8Array, deviceId: string): Promise<boolean> {
    // Create a SignedPacket structure for verification
    const signedPacket: SignedPacket = {
      payload: data,
      deviceId,
      timestamp: Date.now(), // Not used in verification since timestamp is in the data
      signature
    }
    
    // Check if we trust this device
    if (!this.keyManager.isTrustedPeer(deviceId)) {
      console.warn(`[SecureMessage] Unknown device: ${deviceId}`)
      return false
    }
    
    // Use the packet signer's verification (but skip timestamp check since we already did it)
    return await this.verifySignatureOnly(data, signature, deviceId)
  }
  
  /**
   * Direct signature verification without timestamp checks
   */
  private async verifySignatureOnly(data: Uint8Array, signature: Uint8Array, deviceId: string): Promise<boolean> {
    const publicKey = this.keyManager.getPeerPublicKey(deviceId)
    if (!publicKey) return false
    
    try {
      const ed = await import('@noble/ed25519')
      const { sha512 } = await import('@noble/hashes/sha512')
      // Initialize sha512 for the ed25519 library
      ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))
      return await ed.verify(signature, data, publicKey)
    } catch (error) {
      console.error('[SecureMessage] Signature verification error:', error)
      return false
    }
  }
  
  /**
   * Serialize message for signing (excludes the signature field)
   */
  private serializeMessageForSigning(message: SecureMessage): Uint8Array {
    const data = {
      payload: message.payload,
      deviceId: message.deviceId,
      timestamp: message.timestamp
    }
    return new TextEncoder().encode(JSON.stringify(data))
  }
  
  /**
   * Serialize complete message including signature
   */
  private serializeMessage(message: SecureMessage): Uint8Array {
    // Convert signature to base64 for JSON serialization
    const messageWithBase64Sig = {
      ...message,
      signature: Buffer.from(message.signature).toString('base64')
    }
    return new TextEncoder().encode(JSON.stringify(messageWithBase64Sig))
  }
  
  /**
   * Deserialize message from bytes
   */
  private deserializeMessage(data: Uint8Array): SecureMessage | null {
    try {
      const json = JSON.parse(new TextDecoder().decode(data))
      
      // Convert base64 signature back to Uint8Array
      return {
        payload: json.payload,
        deviceId: json.deviceId,
        timestamp: json.timestamp,
        signature: new Uint8Array(Buffer.from(json.signature, 'base64'))
      }
    } catch (error) {
      console.error('[SecureMessage] Deserialization error:', error)
      return null
    }
  }
}