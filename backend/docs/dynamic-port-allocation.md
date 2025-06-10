# Dynamic Port Allocation Strategy

## Overview

This document describes the dynamic port allocation system that allows running multiple instances of the simulation orchestrator simultaneously. The system automatically finds available ports when starting, enabling parallel development and testing workflows.

## Architecture

### Port Finder Module (`src/utils/port-finder.ts`)

The core module provides:

1. **`isPortAvailable(port)`** - Checks if a specific port is free
2. **`findAvailablePort(basePort)`** - Finds next available port from a base
3. **`findAvailablePorts(basePort, count)`** - Finds consecutive available ports
4. **`getPortsForEnvironment(environment)`** - Gets ports for a specific environment

### Port Ranges

The system defines port ranges for different environments to minimize conflicts:

```typescript
export const PORT_RANGES = {
  DEFAULT: { base: 3001, count: 4 },      // Default development
  DEVELOPMENT: { base: 5001, count: 4 },   // Primary development
  CYPRESS: { base: 3011, count: 4 },       // Cypress tests
  BACKEND_TEST: { base: 4011, count: 4 },  // Backend tests
  SECONDARY_DEV: { base: 5101, count: 4 }, // Second dev instance
  TERTIARY_DEV: { base: 5201, count: 4 },  // Third dev instance
}
```

Each environment needs 4 consecutive ports:
- Alice backend
- Bob backend  
- Network simulator WebSocket
- Network HTTP API

### Automatic Fallback

When starting development, the system:
1. Tries primary development ports (5001-5004)
2. Falls back to secondary range (5101-5104) if occupied
3. Falls back to tertiary range (5201-5204) if both occupied
4. Fails with clear error if no ports available

## Usage

### Development Script

The `run-dev-with-unique-ports.sh` script:
1. Calls `find-dev-ports.ts` to find available ports
2. Exports environment variables with the allocated ports
3. Starts the orchestrator with these ports
4. Warns if frontend needs reconfiguration

### Running Multiple Instances

```bash
# Terminal 1 - Gets ports 5001-5004
cd backend
npm run dev

# Terminal 2 - Automatically gets ports 5101-5104
cd backend
npm run dev

# Terminal 3 - Automatically gets ports 5201-5204
cd backend
npm run dev
```

### Frontend Configuration

The frontend needs to know which ports to connect to. When using non-default ports:

1. **Manual Update**: Edit `app/.env.development`:
   ```env
   VITE_ALICE_BACKEND_URL=http://localhost:5101
   VITE_BOB_BACKEND_URL=http://localhost:5102
   ```

2. **Environment Variables**: Or set when starting frontend:
   ```bash
   VITE_ALICE_BACKEND_URL=http://localhost:5101 \
   VITE_BOB_BACKEND_URL=http://localhost:5102 \
   npm run dev
   ```

## Integration with Other Orchestrators

To use this system with other orchestrators:

### 1. Import the Port Finder

```typescript
import { getPortsForEnvironment, findAvailablePorts, PORT_RANGES } from './utils/port-finder'
```

### 2. Define Your Port Range

Add to `PORT_RANGES` if needed:
```typescript
MY_ORCHESTRATOR: { base: 6001, count: 4 }
```

### 3. Get Ports at Startup

```typescript
async function startOrchestrator() {
  // Get ports with fallback
  let ports
  try {
    ports = await getPortsForEnvironment('MY_ORCHESTRATOR')
  } catch (e) {
    // Fallback to finding any available ports
    const basePort = 6001
    const portArray = await findAvailablePorts(basePort, 4)
    ports = {
      alice: portArray[0],
      bob: portArray[1],
      networkSimulator: portArray[2],
      networkHttp: portArray[3]
    }
  }
  
  // Use the ports
  startAlice(ports.alice)
  startBob(ports.bob)
  startNetworkSimulator(ports.networkSimulator, ports.networkHttp)
}
```

### 4. Pass Ports to Child Processes

```typescript
// When spawning child processes
const aliceProcess = spawn('node', ['alice-server.js'], {
  env: {
    ...process.env,
    PORT: ports.alice.toString(),
    DEVICE_ID: 'alice'
  }
})
```

### 5. Create a Startup Script

```bash
#!/bin/bash
# my-orchestrator-with-ports.sh

# Find available ports
PORT_EXPORTS=$(npx tsx src/utils/find-dev-ports.ts)
eval "$PORT_EXPORTS"

# Run your orchestrator
npx tsx src/my-orchestrator.ts
```

## Benefits

1. **No Manual Port Management** - Automatically finds free ports
2. **Multiple Instances** - Run several environments simultaneously
3. **Clear Fallback Strategy** - Predictable port allocation
4. **Environment Isolation** - Different ranges for different use cases
5. **Easy Integration** - Reusable modules for any orchestrator

## Error Handling

The system provides clear errors when:
- No ports available in any range
- Network binding fails
- Port finder module not found

## Testing

Test the port allocation:

```bash
# Check if ports are available
npx tsx -e "import { isPortAvailable } from './src/utils/port-finder'; console.log(await isPortAvailable(5001))"

# Find next available port
npx tsx -e "import { findAvailablePort } from './src/utils/port-finder'; console.log(await findAvailablePort(5001))"

# Test the allocation script
npx tsx src/utils/find-dev-ports.ts
```

## Future Enhancements

1. **Automatic Frontend Config** - Update frontend .env automatically
2. **Port Registry** - Track which instances are using which ports
3. **Port Release** - Clean shutdown that marks ports as available
4. **Web UI** - Show active instances and their ports
5. **Custom Ranges** - Allow users to specify preferred port ranges