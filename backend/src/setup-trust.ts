import { KeyManager } from './crypto/KeyManager'
import * as path from 'path'
import * as fs from 'fs'

/**
 * Setup script to establish trust relationships between devices
 * Run this after initializing device keys but before running the app
 */
async function setupTrust() {
  console.log('Setting up trust relationships...')
  
  // Initialize Alice's key manager
  const aliceKM = new KeyManager('alice')
  await aliceKM.initialize()
  
  // Initialize Bob's key manager
  const bobKM = new KeyManager('bob')
  await bobKM.initialize()
  
  // Reload Alice to pick up Bob's keys
  await aliceKM.initialize()
  
  // Alice trusts Bob
  try {
    aliceKM.trustPeer('bob')
    console.log('✓ Alice now trusts Bob')
  } catch (e) {
    console.log('Alice already trusts Bob')
  }
  
  // Bob trusts Alice
  try {
    bobKM.trustPeer('alice')
    console.log('✓ Bob now trusts Alice')
  } catch (e) {
    console.log('Bob already trusts Alice')
  }
  
  console.log('\nTrust relationships established!')
  console.log('- Alice trusts:', Array.from(aliceKM.getTrustedPeers().keys()).join(', '))
  console.log('- Bob trusts:', Array.from(bobKM.getTrustedPeers().keys()).join(', '))
}

// Run if called directly
if (require.main === module) {
  setupTrust().catch(console.error)
}

export { setupTrust }