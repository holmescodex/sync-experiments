#!/usr/bin/env node

import { PortRegistry } from './port-finder'

/**
 * Release ports for a specific instance
 */
async function main() {
  const instanceId = process.argv[2]
  
  if (!instanceId) {
    console.error('Usage: release-ports.ts <instanceId>')
    console.error('Available instances:')
    const stats = PortRegistry.getUsageStats()
    stats.instances.forEach(id => console.error(`  ${id}`))
    process.exit(1)
  }
  
  try {
    PortRegistry.releasePorts(instanceId)
    
    const stats = PortRegistry.getUsageStats()
    console.log(`[PortRegistry] Released ports for ${instanceId}`)
    console.log(`[PortRegistry] Remaining usage: ${stats.total} ports (${stats.instances.length} instances)`)
    
  } catch (error) {
    console.error('[PortRegistry] Error releasing ports:', error)
    process.exit(1)
  }
}

main()