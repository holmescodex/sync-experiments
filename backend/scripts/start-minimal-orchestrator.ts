#!/usr/bin/env node

import { MinimalOrchestrator } from '../orchestrators/MinimalOrchestrator'

async function main() {
  const instanceId = process.env.INSTANCE_ID || 'minimal-orchestrator'
  const alicePort = parseInt(process.env.ALICE_PORT || '7001')
  const bobPort = parseInt(process.env.BOB_PORT || '7002')
  
  const ports = {
    alice: alicePort,
    bob: bobPort,
    networkSimulator: 0,
    networkHttp: 0
  }
  
  const orchestrator = new MinimalOrchestrator(ports, instanceId)
  
  try {
    await orchestrator.start()
    console.log('[MinimalOrchestrator] Ready for tests')
    
    // Keep running until killed
    process.on('SIGTERM', async () => {
      console.log('[MinimalOrchestrator] Received SIGTERM, shutting down...')
      await orchestrator.stop()
      process.exit(0)
    })
    
    process.on('SIGINT', async () => {
      console.log('[MinimalOrchestrator] Received SIGINT, shutting down...')
      await orchestrator.stop()
      process.exit(0)
    })
    
    // Run forever
    while (true) {
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  } catch (error) {
    console.error('[MinimalOrchestrator] Error:', error)
    process.exit(1)
  }
}

main()