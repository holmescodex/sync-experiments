import { SimulationEngine } from './simulation/engine'

async function debugDatabaseIssue() {
  console.log('=== Debugging Database Storage ===')
  
  const engine = new SimulationEngine()
  
  // Initialize devices
  await engine.setDeviceFrequencies([
    { deviceId: 'alice', messagesPerHour: 0, enabled: true },
    { deviceId: 'bob', messagesPerHour: 0, enabled: true }
  ])
  
  // Get databases
  const aliceDb = engine.getDeviceDatabase('alice')
  const bobDb = engine.getDeviceDatabase('bob')
  
  console.log('Alice DB exists:', !!aliceDb)
  console.log('Bob DB exists:', !!bobDb)
  
  if (!aliceDb || !bobDb) {
    console.error('Databases not initialized!')
    return
  }
  
  // Check initial state
  const initialAlice = await aliceDb.getAllEvents()
  const initialBob = await bobDb.getAllEvents()
  
  console.log('\nInitial state:')
  console.log('  Alice:', initialAlice.length, 'events')
  console.log('  Bob:', initialBob.length, 'events')
  
  // Alice sends a manual message
  console.log('\nAlice sending manual message...')
  await engine.createMessageEvent('alice', 'Test message from debug script')
  
  // Check immediately
  const afterManual = await aliceDb.getAllEvents()
  console.log('After manual message:')
  console.log('  Alice:', afterManual.length, 'events')
  
  if (afterManual.length > 0) {
    console.log('  First event:', {
      id: afterManual[0].event_id,
      device: afterManual[0].device_id,
      created: new Date(afterManual[0].created_at).toISOString()
    })
  }
  
  // Run a few ticks
  console.log('\nRunning simulation for 3 seconds...')
  for (let i = 0; i < 30; i++) {
    await engine.tick()
  }
  
  // Final check
  const finalAlice = await aliceDb.getAllEvents()
  const finalBob = await bobDb.getAllEvents()
  
  console.log('\nFinal state:')
  console.log('  Alice:', finalAlice.length, 'events')
  console.log('  Bob:', finalBob.length, 'events')
  
  if (finalBob.length > 0) {
    console.log('  ✅ Sync successful!')
  } else {
    console.log('  ❌ Sync failed - Bob has no events')
  }
}

debugDatabaseIssue().catch(console.error)