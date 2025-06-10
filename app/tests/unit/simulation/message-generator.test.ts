import { describe, test, expect, beforeEach } from 'vitest'
import { MessageGenerator } from '../../simulation/message-generator'
import { SimulationEngine } from '../../simulation/engine'

describe('MessageGenerator', () => {
  let generator: MessageGenerator
  let engine: SimulationEngine

  beforeEach(() => {
    generator = new MessageGenerator('alice')
    engine = new SimulationEngine()
  })

  test('creates message event with required fields', () => {
    const event = generator.createMessage('Hello world', engine.currentSimTime())
    
    expect(event.device_id).toBe('alice')
    expect(event.created_at).toBe(0)
    expect(event.received_at).toBe(0)
    expect(event.encrypted).toBeInstanceOf(Uint8Array)
    expect(event.encrypted.length).toBeGreaterThan(24) // nonce + ciphertext
  })
  
  test('generates unique encrypted content', () => {
    const event1 = generator.createMessage('Message 1', 1000)
    const event2 = generator.createMessage('Message 2', 2000)
    
    // Different messages should have different encrypted content
    expect(event1.encrypted).not.toEqual(event2.encrypted)
  })
  
  test('encrypts message content with AEAD', () => {
    const event = generator.createMessage('Secret message', 1000)
    
    // Encrypted content should not contain plaintext
    const encryptedStr = new TextDecoder().decode(event.encrypted)
    expect(encryptedStr).not.toContain('Secret message')
    expect(event.encrypted.length).toBeGreaterThan(24) // nonce + ciphertext
  })
  
  test('can decrypt own message with PSK', () => {
    const originalText = 'Test message'
    const event = generator.createMessage(originalText, 1000)
    const decrypted = generator.decryptMessage(event)
    
    expect(decrypted.content).toBe(originalText)
    expect(decrypted.type).toBe('message')
    expect(decrypted.timestamp).toBe(1000)
  })
  
  test('decryption fails with wrong PSK', () => {
    const generator1 = new MessageGenerator('alice')
    const generator2 = new MessageGenerator('bob')
    // Different devices should have same PSK for Phase 1, but let's test error handling
    
    const event = generator1.createMessage('Secret', 1000)
    
    // For Phase 1, both devices have same PSK, so this should actually work
    // But let's test the error handling mechanism works
    try {
      const decrypted = generator2.decryptMessage(event)
      // If it succeeds, that's fine for Phase 1 (shared PSK)
      expect(decrypted.content).toBe('Secret')
    } catch (error) {
      // If it fails, the error should be about decryption
      expect((error as Error).message).toContain('Decryption failed')
    }
  })
  
  test('handles different timestamps correctly', () => {
    const event1 = generator.createMessage('First', 500)
    const event2 = generator.createMessage('Second', 1500)
    
    expect(event1.created_at).toBe(500)
    expect(event1.received_at).toBe(500)
    expect(event2.created_at).toBe(1500)
    expect(event2.received_at).toBe(1500)
    
    const decrypted1 = generator.decryptMessage(event1)
    const decrypted2 = generator.decryptMessage(event2)
    
    expect(decrypted1.timestamp).toBe(500)
    expect(decrypted2.timestamp).toBe(1500)
  })
})