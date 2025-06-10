import { UnifiedOrchestrator } from '../src/orchestrator/UnifiedOrchestrator'

/**
 * Start the UnifiedOrchestrator for development
 */
async function main() {
  const mode = process.env.MODE || 'direct-udp'
  const devices = process.env.DEVICES ? process.env.DEVICES.split(',') : ['alice', 'bob']
  
  console.log(`Starting UnifiedOrchestrator in ${mode} mode with devices: ${devices.join(', ')}`)
  
  const orchestrator = new UnifiedOrchestrator({
    devices,
    mode: mode as any,
    setupTrust: true,
    syncInterval: 1000,
    basePort: 7000
  })
  
  await orchestrator.start()
  
  const status = orchestrator.getStatus()
  console.log('\nOrchestrator ready!')
  console.log('Device URLs:')
  for (const [deviceId, port] of Object.entries(status.ports.devices as any)) {
    console.log(`  ${deviceId}: http://localhost:${port}`)
  }
  
  if (mode === 'direct-udp') {
    console.log('\nUDP Ports:')
    for (const [deviceId, port] of Object.entries(status.ports.udpPorts || {})) {
      console.log(`  ${deviceId}: ${port}`)
    }
  }

  // Export ports as environment variables for frontend
  process.env.VITE_ALICE_BACKEND_URL = `http://localhost:${status.ports.devices.alice}`
  process.env.VITE_BOB_BACKEND_URL = `http://localhost:${status.ports.devices.bob}`
  
  console.log('\nEnvironment variables set for frontend:')
  console.log(`  VITE_ALICE_BACKEND_URL=${process.env.VITE_ALICE_BACKEND_URL}`)
  console.log(`  VITE_BOB_BACKEND_URL=${process.env.VITE_BOB_BACKEND_URL}`)
  console.log('\nTo start frontend with these ports, run:')
  console.log(`  cd ../app && VITE_ALICE_BACKEND_URL=${process.env.VITE_ALICE_BACKEND_URL} VITE_BOB_BACKEND_URL=${process.env.VITE_BOB_BACKEND_URL} npm run dev`)
  
  // Keep running
  process.on('SIGINT', async () => {
    console.log('\nShutting down...')
    await orchestrator.stop()
    process.exit(0)
  })
}

main().catch(console.error)