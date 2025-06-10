import { createHash } from 'crypto'
import { EventCrypto, EncryptedEvent } from './EventCrypto'
import { KeyManager } from './KeyManager'

export interface MessageEvent {
  type: 'message'
  content: string
  timestamp: number
  author: string
  attachments?: any[]
}

export interface ReactionEvent {
  type: 'reaction'
  messageId: string
  emoji: string
  author: string
  timestamp: number
  remove: boolean
}

export type EventPayload = MessageEvent | ReactionEvent

export class MessageGenerator {
  private eventCrypto: EventCrypto | null = null
  private keyManager: KeyManager
  private communityPSK = 'test-community-psk' // In production, load from config
  
  constructor(private deviceId: string) {
    this.keyManager = new KeyManager(deviceId)
  }
  
  /**
   * Initialize crypto - must be called before use
   */
  async initialize(): Promise<void> {
    await this.keyManager.initialize()
    
    const keyPair = this.keyManager.getKeyPair()
    this.eventCrypto = new EventCrypto(
      this.deviceId,
      keyPair.privateKey,
      keyPair.publicKey,
      this.keyManager.getKnownPeers(),
      this.keyManager.getTrustedPeers(),
      this.communityPSK
    )
  }

  /**
   * Create a signed and encrypted message event
   */
  async createMessage(content: string, timestamp: number, attachments?: any[]): Promise<{
    device_id: string
    created_at: number
    received_at: number
    encrypted: Buffer
  }> {
    if (!this.eventCrypto) {
      throw new Error('MessageGenerator not initialized')
    }
    
    // Create the message payload
    const payload: MessageEvent = {
      type: 'message',
      content,
      timestamp,
      author: this.deviceId,
      attachments: attachments || []
    }

    // Sign and encrypt the event
    const encrypted = await this.eventCrypto.signAndEncryptEvent(payload)
    const encryptedBuffer = EventCrypto.encryptedEventToBuffer(encrypted)

    return {
      device_id: this.deviceId,
      created_at: timestamp,
      received_at: timestamp,
      encrypted: encryptedBuffer
    }
  }

  /**
   * Decrypt and verify a message event
   */
  async decryptMessage(event: { encrypted: Buffer }): Promise<MessageEvent | null> {
    if (!this.eventCrypto) {
      throw new Error('MessageGenerator not initialized')
    }
    
    const encrypted = EventCrypto.bufferToEncryptedEvent(event.encrypted)
    const signedEvent = await this.eventCrypto.decryptAndVerifyEvent(encrypted)
    
    if (!signedEvent) {
      return null
    }
    
    // Return the payload which should be a MessageEvent
    return signedEvent.payload as MessageEvent
  }

  /**
   * Create a signed and encrypted generic event
   */
  async createEvent(payload: EventPayload, timestamp: number): Promise<{
    device_id: string
    created_at: number
    received_at: number
    encrypted: Buffer
  }> {
    if (!this.eventCrypto) {
      throw new Error('MessageGenerator not initialized')
    }

    // Sign and encrypt the event
    const encrypted = await this.eventCrypto.signAndEncryptEvent(payload)
    const encryptedBuffer = EventCrypto.encryptedEventToBuffer(encrypted)

    return {
      device_id: this.deviceId,
      created_at: timestamp,
      received_at: timestamp,
      encrypted: encryptedBuffer
    }
  }

  /**
   * Decrypt and verify any event type
   */
  async decryptEvent(event: { encrypted: Buffer }): Promise<EventPayload | null> {
    if (!this.eventCrypto) {
      throw new Error('MessageGenerator not initialized')
    }
    
    const encrypted = EventCrypto.bufferToEncryptedEvent(event.encrypted)
    const signedEvent = await this.eventCrypto.decryptAndVerifyEvent(encrypted)
    
    if (!signedEvent) {
      return null
    }
    
    // Return the payload which could be any event type
    return signedEvent.payload as EventPayload
  }

  /**
   * Generate event ID from encrypted content
   */
  computeEventId(encrypted: Buffer): string {
    const hash = createHash('sha256')
    hash.update(encrypted)
    const hashBytes = hash.digest()
    return hashBytes.slice(0, 8).toString('hex')
  }
}