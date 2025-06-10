#!/usr/bin/env node

import { getOptimalPorts, PortRegistry } from './port-finder'

/**
 * Find available ports for test environments and output them as environment variables
 */
async function main() {
  const testType = process.argv[2] as 'dev' | 'test' | 'cypress' | 'unit'
  const instanceId = process.argv[3] || `${testType}-${Date.now()}`
  
  if (!testType || !['dev', 'test', 'cypress', 'unit'].includes(testType)) {
    console.error('Usage: find-test-ports.ts <dev|test|cypress|unit> [instanceId]')
    process.exit(1)
  }
  
  try {
    const ports = await getOptimalPorts(testType, instanceId)
    
    // Output as shell export commands
    console.log(`export ALICE_PORT="${ports.alice}"`)
    console.log(`export BOB_PORT="${ports.bob}"`)
    
    if (ports.networkSimulator && ports.networkHttp) {
      console.log(`export NETWORK_SIMULATOR_PORT="${ports.networkSimulator}"`)
      console.log(`export NETWORK_HTTP_PORT="${ports.networkHttp}"`)
    }
    
    if (ports.frontend) {
      console.log(`export FRONTEND_PORT="${ports.frontend}"`)
      console.log(`export VITE_PORT="${ports.frontend}"`)
    }
    
    // Backend URL environment variables
    console.log(`export ALICE_BACKEND_URL="http://localhost:${ports.alice}"`)
    console.log(`export BOB_BACKEND_URL="http://localhost:${ports.bob}"`)
    
    if (ports.networkHttp) {
      console.log(`export NETWORK_HTTP_URL="http://localhost:${ports.networkHttp}"`)
    }
    
    // Test mode and instance tracking
    console.log(`export TEST_MODE="orchestrated"`)
    console.log(`export INSTANCE_ID="${instanceId}"`)
    
    // Usage statistics for debugging
    const stats = PortRegistry.getUsageStats()
    console.error(`[PortFinder] Allocated ${testType} ports for ${instanceId}:`)
    console.error(`  Alice: ${ports.alice}, Bob: ${ports.bob}`)
    if (ports.networkSimulator) console.error(`  Network: ${ports.networkSimulator}, HTTP: ${ports.networkHttp}`)
    if (ports.frontend) console.error(`  Frontend: ${ports.frontend}`)
    console.error(`[PortRegistry] Total usage: ${stats.total} ports (${stats.predefined} predefined, ${stats.dynamic} dynamic)`)
    console.error(`[PortRegistry] Active instances: ${stats.instances.length}`)
    
  } catch (error) {
    console.error('[PortFinder] Error finding available ports:', error)
    process.exit(1)
  }
}

main()