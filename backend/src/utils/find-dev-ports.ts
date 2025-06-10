#!/usr/bin/env node

import { getPortsForEnvironment, PORT_RANGES } from './port-finder'

/**
 * Find available ports for development and output them as environment variables
 */
async function main() {
  try {
    // Try primary development range first
    let ports
    let environment: keyof typeof PORT_RANGES = 'DEVELOPMENT'
    
    try {
      ports = await getPortsForEnvironment('DEVELOPMENT')
      console.error('[PortFinder] Using primary development ports (5001-5004)')
    } catch (e) {
      // Try secondary range
      try {
        ports = await getPortsForEnvironment('SECONDARY_DEV')
        environment = 'SECONDARY_DEV'
        console.error('[PortFinder] Primary ports in use, using secondary development ports (5101-5104)')
      } catch (e2) {
        // Try tertiary range
        ports = await getPortsForEnvironment('TERTIARY_DEV')
        environment = 'TERTIARY_DEV'
        console.error('[PortFinder] Secondary ports in use, using tertiary development ports (5201-5204)')
      }
    }
    
    // Output as shell export commands
    console.log(`export ALICE_PORT="${ports.alice}"`)
    console.log(`export BOB_PORT="${ports.bob}"`)
    console.log(`export NETWORK_SIMULATOR_PORT="${ports.networkSimulator}"`)
    console.log(`export NETWORK_HTTP_PORT="${ports.networkHttp}"`)
    console.log(`export ALICE_BACKEND_URL="http://localhost:${ports.alice}"`)
    console.log(`export BOB_BACKEND_URL="http://localhost:${ports.bob}"`)
    
    // Also output for frontend env file update
    console.error(`[PortFinder] Frontend should use:`)
    console.error(`  VITE_ALICE_BACKEND_URL=http://localhost:${ports.alice}`)
    console.error(`  VITE_BOB_BACKEND_URL=http://localhost:${ports.bob}`)
    
  } catch (error) {
    console.error('[PortFinder] Error finding available ports:', error)
    process.exit(1)
  }
}

main()