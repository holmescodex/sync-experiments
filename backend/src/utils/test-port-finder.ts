#!/usr/bin/env node

import { isPortAvailable, findAvailablePort, findAvailablePorts, getPortsForEnvironment } from './port-finder'

async function test() {
  console.log('Testing port finder utilities...\n')
  
  // Test single port availability
  console.log('1. Testing port availability:')
  console.log(`   Port 3001 available: ${await isPortAvailable(3001)}`)
  console.log(`   Port 80 available: ${await isPortAvailable(80)}`)
  
  // Test finding next available port
  console.log('\n2. Finding next available port from 5001:')
  try {
    const port = await findAvailablePort(5001)
    console.log(`   Found: ${port}`)
  } catch (e) {
    console.log(`   Error: ${e.message}`)
  }
  
  // Test finding consecutive ports
  console.log('\n3. Finding 4 consecutive ports from 5001:')
  try {
    const ports = await findAvailablePorts(5001, 4)
    console.log(`   Found: ${ports.join(', ')}`)
  } catch (e) {
    console.log(`   Error: ${e.message}`)
  }
  
  // Test environment port allocation
  console.log('\n4. Testing environment port allocation:')
  for (const env of ['DEVELOPMENT', 'SECONDARY_DEV', 'TERTIARY_DEV'] as const) {
    try {
      const ports = await getPortsForEnvironment(env)
      console.log(`   ${env}:`)
      console.log(`     - Alice: ${ports.alice}`)
      console.log(`     - Bob: ${ports.bob}`)
      console.log(`     - Network: ${ports.networkSimulator}`)
      console.log(`     - HTTP: ${ports.networkHttp}`)
    } catch (e) {
      console.log(`   ${env}: Error - ${e.message}`)
    }
  }
}

test().catch(console.error)