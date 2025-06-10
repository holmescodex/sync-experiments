import * as net from 'net'

/**
 * Check if a port is available
 */
export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    
    server.once('error', () => {
      resolve(false)
    })
    
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    
    server.listen(port)
  })
}

/**
 * Find the next available port starting from a base port
 */
export async function findAvailablePort(basePort: number, maxAttempts = 100): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = basePort + i
    if (await isPortAvailable(port)) {
      return port
    }
  }
  throw new Error(`No available ports found in range ${basePort}-${basePort + maxAttempts}`)
}

/**
 * Find a set of consecutive available ports
 */
export async function findAvailablePorts(basePort: number, count: number, maxAttempts = 100): Promise<number[]> {
  for (let i = 0; i < maxAttempts; i++) {
    const startPort = basePort + i
    const ports: number[] = []
    let allAvailable = true
    
    // Check if we can get 'count' consecutive ports
    for (let j = 0; j < count; j++) {
      const port = startPort + j
      if (await isPortAvailable(port)) {
        ports.push(port)
      } else {
        allAvailable = false
        break
      }
    }
    
    if (allAvailable && ports.length === count) {
      return ports
    }
  }
  
  throw new Error(`No ${count} consecutive available ports found starting from ${basePort}`)
}

/**
 * Hybrid port allocation strategy: predefined ranges for fast allocation,
 * dynamic allocation for unlimited capacity
 */
export const PORT_STRATEGY = {
  // Fast predefined ranges for common cases (20 concurrent instances)
  PREDEFINED_RANGES: {
    DEFAULT: { base: 3001, count: 4 },
    
    // Development instances (8 fast slots)
    DEV_1: { base: 5001, count: 4 },
    DEV_2: { base: 5101, count: 4 },
    DEV_3: { base: 5201, count: 4 },
    DEV_4: { base: 5301, count: 4 },
    DEV_5: { base: 5401, count: 4 },
    DEV_6: { base: 5501, count: 4 },
    DEV_7: { base: 5601, count: 4 },
    DEV_8: { base: 5701, count: 4 },
    
    // Test instances (8 fast slots)
    TEST_1: { base: 6001, count: 4 },
    TEST_2: { base: 6101, count: 4 },
    TEST_3: { base: 6201, count: 4 },
    TEST_4: { base: 6301, count: 4 },
    TEST_5: { base: 6401, count: 4 },
    TEST_6: { base: 6501, count: 4 },
    TEST_7: { base: 6601, count: 4 },
    TEST_8: { base: 6701, count: 4 },
    
    // Cypress tests (2 fast slots)
    CYPRESS_1: { base: 3011, count: 5 }, // Include frontend port
    CYPRESS_2: { base: 3111, count: 5 },
    
    // Unit tests (2 fast slots - only need 2 ports)
    UNIT_1: { base: 7001, count: 2 },
    UNIT_2: { base: 7101, count: 2 },
  },
  
  // Dynamic allocation settings
  DYNAMIC_SEARCH_START: 10000,
  DYNAMIC_SEARCH_END: 60000,
  ALLOCATION_STEP: 100, // Jump by 100s to avoid clustering
  
  // Port ranges to avoid during dynamic allocation
  RESERVED_RANGES: [
    [0, 1023],      // System ports
    [3000, 3999],   // HTTP development servers
    [4000, 4999],   // Common application ports
    [5000, 7999],   // Our predefined ranges
    [8000, 8999],   // Common dev servers (webpack, etc.)
    [9000, 9999],   // Common test ports
  ] as const
} as const

// Legacy compatibility - keep existing PORT_RANGES for backward compatibility
export const PORT_RANGES = PORT_STRATEGY.PREDEFINED_RANGES

/**
 * Port registry for tracking usage and enabling cleanup
 */
export class PortRegistry {
  private static usedPorts = new Set<number>()
  private static portAllocations = new Map<string, number[]>()
  
  static reservePorts(instanceId: string, ports: number[]): void {
    ports.forEach(port => this.usedPorts.add(port))
    this.portAllocations.set(instanceId, ports)
    console.log(`[PortRegistry] Reserved ports for ${instanceId}: ${ports.join(', ')}`)
  }
  
  static releasePorts(instanceId: string): void {
    const ports = this.portAllocations.get(instanceId)
    if (ports) {
      ports.forEach(port => this.usedPorts.delete(port))
      this.portAllocations.delete(instanceId)
      console.log(`[PortRegistry] Released ports for ${instanceId}: ${ports.join(', ')}`)
    }
  }
  
  static getUsageStats(): { total: number, predefined: number, dynamic: number, instances: string[] } {
    const total = this.usedPorts.size
    const instances = Array.from(this.portAllocations.keys())
    
    // Count predefined vs dynamic usage
    let predefined = 0
    let dynamic = 0
    
    for (const port of this.usedPorts) {
      if (port < PORT_STRATEGY.DYNAMIC_SEARCH_START) {
        predefined++
      } else {
        dynamic++
      }
    }
    
    return { total, predefined, dynamic, instances }
  }
  
  static isPortReserved(port: number): boolean {
    return this.usedPorts.has(port)
  }
}

/**
 * Enhanced port finder with dynamic allocation fallback
 */
export async function findAvailablePortRange(count: number, startSearchFrom?: number): Promise<number[]> {
  const start = startSearchFrom || PORT_STRATEGY.DYNAMIC_SEARCH_START
  const end = PORT_STRATEGY.DYNAMIC_SEARCH_END
  const step = PORT_STRATEGY.ALLOCATION_STEP
  
  for (let base = start; base < end - count; base += step) {
    // Skip reserved ranges
    const inReservedRange = PORT_STRATEGY.RESERVED_RANGES.some(([rangeStart, rangeEnd]) => 
      base >= rangeStart && base <= rangeEnd
    )
    
    if (inReservedRange) {
      continue
    }
    
    // Check if entire range is available and not in our registry
    try {
      const ports = await findAvailablePorts(base, count)
      
      // Double-check against our registry
      const anyReserved = ports.some(port => PortRegistry.isPortReserved(port))
      if (!anyReserved) {
        return ports
      }
    } catch (e) {
      // This range not available, continue searching
      continue
    }
  }
  
  throw new Error(`No available port range of size ${count} found in range ${start}-${end}`)
}

/**
 * Try to allocate from predefined ranges first, fall back to dynamic
 */
export async function getOptimalPorts(testType: 'dev' | 'test' | 'cypress' | 'unit', instanceId?: string): Promise<{
  alice: number
  bob: number
  networkSimulator: number
  networkHttp: number
  frontend?: number
}> {
  const id = instanceId || `${testType}-${Date.now()}`
  
  try {
    // Try predefined ranges first (fast path)
    const predefinedPorts = await tryPredefinedRanges(testType)
    PortRegistry.reservePorts(id, Object.values(predefinedPorts).filter(Boolean))
    return predefinedPorts
  } catch (e) {
    console.log(`[PortFinder] Predefined ranges for ${testType} exhausted, using dynamic allocation`)
  }
  
  // Fall back to dynamic allocation
  const count = getPortCountForTestType(testType)
  const ports = await findAvailablePortRange(count)
  const formattedPorts = formatPortsForTestType(ports, testType)
  
  PortRegistry.reservePorts(id, ports)
  return formattedPorts
}

/**
 * Try predefined ranges for a test type
 */
async function tryPredefinedRanges(testType: 'dev' | 'test' | 'cypress' | 'unit'): Promise<{
  alice: number
  bob: number
  networkSimulator: number
  networkHttp: number
  frontend?: number
}> {
  const prefixes = {
    dev: 'DEV_',
    test: 'TEST_',
    cypress: 'CYPRESS_',
    unit: 'UNIT_'
  }
  
  const prefix = prefixes[testType]
  const ranges = Object.entries(PORT_STRATEGY.PREDEFINED_RANGES)
    .filter(([key]) => key.startsWith(prefix))
  
  for (const [rangeName, range] of ranges) {
    try {
      const ports = await findAvailablePorts(range.base, range.count)
      return formatPortsForTestType(ports, testType)
    } catch (e) {
      // This range is occupied, try next
      continue
    }
  }
  
  throw new Error(`No predefined ${testType} ranges available`)
}

/**
 * Get port count needed for different test types
 */
function getPortCountForTestType(testType: 'dev' | 'test' | 'cypress' | 'unit'): number {
  return {
    dev: 4,      // alice, bob, network-ws, network-http
    test: 4,     // alice, bob, network-ws, network-http
    cypress: 5,  // alice, bob, network-ws, network-http, frontend
    unit: 2      // alice, bob (for crypto tests)
  }[testType]
}

/**
 * Format port array into named ports for different test types
 */
function formatPortsForTestType(ports: number[], testType: 'dev' | 'test' | 'cypress' | 'unit'): {
  alice: number
  bob: number
  networkSimulator: number
  networkHttp: number
  frontend?: number
} {
  const result = {
    alice: ports[0],
    bob: ports[1],
    networkSimulator: ports[2] || 0,
    networkHttp: ports[3] || 0,
  }
  
  if (testType === 'cypress') {
    return { ...result, frontend: ports[4] }
  }
  
  if (testType === 'unit') {
    // Unit tests only need alice/bob ports for crypto
    return { alice: ports[0], bob: ports[1], networkSimulator: 0, networkHttp: 0 }
  }
  
  return result
}

/**
 * Get available ports for a specific environment (legacy compatibility)
 */
export async function getPortsForEnvironment(environment: keyof typeof PORT_RANGES): Promise<{
  alice: number
  bob: number
  networkSimulator: number
  networkHttp: number
}> {
  const range = PORT_RANGES[environment]
  const ports = await findAvailablePorts(range.base, range.count)
  
  return {
    alice: ports[0],
    bob: ports[1],
    networkSimulator: ports[2],
    networkHttp: ports[3]
  }
}