import { describe, it, expect, beforeEach } from 'vitest'
import { KeyManager } from '../../crypto/KeyManager'
import { PacketSigner } from '../../crypto/PacketSigner'
import { SecureMessageLayer } from '../../crypto/SecureMessageLayer'

describe('Packet Signing and Encryption', () => {
  let aliceKeyManager: KeyManager
  let bobKeyManager: KeyManager
  let aliceSigner: PacketSigner
  let bobSigner: PacketSigner
  let aliceSecureLayer: SecureMessageLayer
  let bobSecureLayer: SecureMessageLayer
  const communityPSK = 'test-community-key'
  
  beforeEach(async () => {
    // Initialize Alice
    aliceKeyManager = new KeyManager('alice')
    await aliceKeyManager.initialize()
    aliceSigner = new PacketSigner(aliceKeyManager)
    aliceSecureLayer = new SecureMessageLayer('alice', aliceKeyManager, aliceSigner, communityPSK)
    
    // Initialize Bob
    bobKeyManager = new KeyManager('bob')
    await bobKeyManager.initialize()
    bobSigner = new PacketSigner(bobKeyManager)
    bobSecureLayer = new SecureMessageLayer('bob', bobKeyManager, bobSigner, communityPSK)
    
    // Exchange public keys
    aliceKeyManager.addTrustedPeer('bob', bobKeyManager.getPublicKey())
    bobKeyManager.addTrustedPeer('alice', aliceKeyManager.getPublicKey())
  })
  
  it('should sign and verify packets', async () => {
    const payload = new TextEncoder().encode('Hello from Alice')
    
    // Alice signs a packet
    const signedPacket = await aliceSigner.signPacket(payload, 'alice')
    expect(signedPacket.signature).toHaveLength(64)
    
    // Bob verifies the packet
    const isValid = await bobSigner.verifyPacket(signedPacket)
    expect(isValid).toBe(true)
  })
  
  it('should encrypt, sign, decrypt and verify messages', async () => {
    const message = { 
      type: 'message',
      content: 'Hello from Alice',
      timestamp: Date.now()
    }
    
    // Alice prepares the message (sign + encrypt)
    const encrypted = await aliceSecureLayer.prepareOutgoingMessage(message)
    expect(encrypted.nonce).toHaveLength(12)
    expect(encrypted.ciphertext.length).toBeGreaterThan(0)
    
    // Bob processes the message (decrypt + verify)
    const result = await bobSecureLayer.processIncomingPacket(encrypted)
    expect(result).toBeTruthy()
    expect(result?.verified).toBe(true)
    expect(result?.deviceId).toBe('alice')
    expect(result?.payload).toEqual(message)
  })
  
  it('should reject messages with invalid signatures', async () => {
    const message = { content: 'Test message' }
    
    // Alice prepares a message
    const encrypted = await aliceSecureLayer.prepareOutgoingMessage(message)
    
    // Create a Charlie key manager that Bob doesn't trust
    const charlieKeyManager = new KeyManager('charlie')
    await charlieKeyManager.initialize()
    const charlieSigner = new PacketSigner(charlieKeyManager)
    const charlieSecureLayer = new SecureMessageLayer('charlie', charlieKeyManager, charlieSigner, communityPSK)
    
    // Charlie tries to send a message to Bob
    const charlieEncrypted = await charlieSecureLayer.prepareOutgoingMessage(message)
    
    // Bob should reject it (unknown sender)
    const result = await bobSecureLayer.processIncomingPacket(charlieEncrypted)
    expect(result).toBe(null)
  })
  
  it('should reject messages with wrong PSK', async () => {
    const message = { content: 'Test message' }
    
    // Create Eve with wrong PSK
    const eveKeyManager = new KeyManager('eve')
    await eveKeyManager.initialize()
    const eveSigner = new PacketSigner(eveKeyManager)
    const eveSecureLayer = new SecureMessageLayer('eve', eveKeyManager, eveSigner, 'wrong-psk')
    
    // Eve prepares a message with wrong PSK
    const encrypted = await eveSecureLayer.prepareOutgoingMessage(message)
    
    // Bob should fail to decrypt (wrong PSK)
    const result = await bobSecureLayer.processIncomingPacket(encrypted)
    expect(result).toBe(null)
  })
})