#!/usr/bin/env node

import { SimulationControlServer } from '../simulation/SimulationControlServer'

async function main() {
  const port = parseInt(process.env.SIMULATION_CONTROL_PORT || '3005')
  
  console.log(`[SimControl] Starting Simulation Control Server on port ${port}...`)
  
  const server = new SimulationControlServer(port)
  
  try {
    await server.start()
    console.log('[SimControl] Server ready')
    
    // Keep running until killed
    process.on('SIGTERM', async () => {
      console.log('[SimControl] Received SIGTERM, shutting down...')
      server.stop()
      process.exit(0)
    })
    
    process.on('SIGINT', async () => {
      console.log('[SimControl] Received SIGINT, shutting down...')
      server.stop()
      process.exit(0)
    })
    
  } catch (error) {
    console.error('[SimControl] Error:', error)
    process.exit(1)
  }
}

main()