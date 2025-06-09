import { secretbox, randomBytes } from 'tweetnacl'
import type { Event } from '../storage/device-db'

interface MessagePayload {
  type: 'message'
  content: string
  timestamp: number
}

export class MessageGenerator {
  private psk: Uint8Array // 32-byte shared key

  public deviceId: string
  
  constructor(deviceId: string) {
    this.deviceId = deviceId
    // Initialize with fixed PSK for Phase 1 (all devices share same key)
    this.psk = new Uint8Array(32)
    this.psk.fill(42) // Simple fixed key for testing
    
    // Verify key length
    if (this.psk.length !== 32) {
      throw new Error('PSK must be exactly 32 bytes')
    }
    
    // TODO: Phase 2 - proper PSK distribution via invite links
  }

  createMessage(content: string, deviceWallClockTime: number): Event {
    const payload: MessagePayload = {
      type: 'message',
      content,
      timestamp: deviceWallClockTime
    }

    const encrypted = this.encrypt(JSON.stringify(payload))

    return {
      device_id: this.deviceId,
      created_at: deviceWallClockTime,
      received_at: deviceWallClockTime, // Same for creator
      encrypted
    }
  }

  decryptMessage(event: Event): MessagePayload {
    const decrypted = this.decrypt(event.encrypted)
    return JSON.parse(decrypted)
  }

  private encrypt(plaintext: string): Uint8Array {
    const nonce = randomBytes(24)
    const messageEncoded = new TextEncoder().encode(plaintext)
    // Ensure message is a proper Uint8Array
    const message = new Uint8Array(messageEncoded)
    
    const ciphertext = secretbox(message, nonce, this.psk)

    if (!ciphertext) {
      throw new Error('Encryption failed')
    }

    // Return nonce + ciphertext (as per design doc)
    const result = new Uint8Array(24 + ciphertext.length)
    result.set(nonce)
    result.set(ciphertext, 24)
    return result
  }

  private decrypt(encrypted: Uint8Array): string {
    const nonce = encrypted.slice(0, 24)
    const ciphertext = encrypted.slice(24)
    const decrypted = secretbox.open(ciphertext, nonce, this.psk)

    if (!decrypted) {
      throw new Error('Decryption failed - invalid PSK or corrupted data')
    }

    return new TextDecoder().decode(decrypted)
  }
}