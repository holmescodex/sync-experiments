#!/usr/bin/env node

import { BackendOrchestrator } from '../orchestrators/BackendOrchestrator'

async function main() {
  const instanceId = process.env.INSTANCE_ID || 'backend-orchestrator'
  const alicePort = parseInt(process.env.ALICE_PORT || '6001')
  const bobPort = parseInt(process.env.BOB_PORT || '6002')
  const networkSimulatorPort = parseInt(process.env.NETWORK_SIMULATOR_PORT || '6003')
  const networkHttpPort = parseInt(process.env.NETWORK_HTTP_PORT || '6004')
  
  const ports = {
    alice: alicePort,
    bob: bobPort,
    networkSimulator: networkSimulatorPort,
    networkHttp: networkHttpPort
  }
  
  const orchestrator = new BackendOrchestrator(ports, instanceId)
  
  try {
    await orchestrator.start()
    console.log('[BackendOrchestrator] Ready for tests')
    
    // Keep running until killed
    process.on('SIGTERM', async () => {
      console.log('[BackendOrchestrator] Received SIGTERM, shutting down...')
      await orchestrator.stop()
      process.exit(0)
    })
    
    process.on('SIGINT', async () => {
      console.log('[BackendOrchestrator] Received SIGINT, shutting down...')
      await orchestrator.stop()
      process.exit(0)
    })
    
    // Run forever
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  } catch (error) {
    console.error('[BackendOrchestrator] Error:', error)
    process.exit(1)
  }
}

main()