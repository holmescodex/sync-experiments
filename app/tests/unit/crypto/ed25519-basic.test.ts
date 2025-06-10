import { describe, it, expect } from 'vitest'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'

// @noble/ed25519 needs sha512 for node.js environments
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

describe('Ed25519 Basic Tests', () => {
  it('should generate keypair and sign/verify', async () => {
    // Generate private key
    const privateKey = new Uint8Array(32)
    crypto.getRandomValues(privateKey)
    
    // Get public key
    const publicKey = await ed.getPublicKey(privateKey)
    expect(publicKey).toHaveLength(32)
    
    // Sign a message
    const message = new TextEncoder().encode('Hello, World!')
    const signature = await ed.sign(message, privateKey)
    expect(signature).toHaveLength(64)
    
    // Verify signature
    const isValid = await ed.verify(signature, message, publicKey)
    expect(isValid).toBe(true)
    
    // Verify with wrong message should fail
    const wrongMessage = new TextEncoder().encode('Wrong message')
    const isInvalid = await ed.verify(signature, wrongMessage, publicKey)
    expect(isInvalid).toBe(false)
  })
})