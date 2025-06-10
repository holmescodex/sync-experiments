#!/usr/bin/env node

/**
 * Test script to verify bloom filter sync is working
 */

import { SimulationEngine } from './dist/simulation/engine.js'

async function testSync() {
  console.log('=== Bloom Filter Sync Test ===')
  
  const engine = new SimulationEngine()
  
  // Initialize devices
  await engine.setDeviceFrequencies([
    { deviceId: 'alice', messagesPerHour: 0, enabled: true },
    { deviceId: 'bob', messagesPerHour: 0, enabled: true }
  ])
  
  // Get databases
  const aliceDb = engine.getDeviceDatabase('alice')
  const bobDb = engine.getDeviceDatabase('bob')
  
  // Alice sends a manual message
  console.log('Alice sending manual message...')
  await engine.createMessageEvent('alice', 'Hello from test script!')
  
  // Run simulation for 5 seconds
  console.log('Running simulation...')
  for (let i = 0; i < 50; i++) {
    await engine.tick()
    
    if (i % 10 === 0) {
      const aliceCount = (await aliceDb.getAllEvents()).length
      const bobCount = (await bobDb.getAllEvents()).length
      console.log(`Time: ${engine.currentSimTime()}ms - Alice: ${aliceCount} events, Bob: ${bobCount} events`)
    }
  }
  
  // Final check
  const finalAliceEvents = await aliceDb.getAllEvents()
  const finalBobEvents = await bobDb.getAllEvents()
  
  console.log('\n=== Final Results ===')
  console.log(`Alice has ${finalAliceEvents.length} events`)
  console.log(`Bob has ${finalBobEvents.length} events`)
  
  if (finalBobEvents.length > 0) {
    console.log('✅ Sync successful! Bob received Alice\'s message')
  } else {
    console.log('❌ Sync failed! Bob did not receive Alice\'s message')
  }
  
  process.exit(finalBobEvents.length > 0 ? 0 : 1)
}

testSync().catch(console.error)