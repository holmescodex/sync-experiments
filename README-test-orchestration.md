# Test Orchestration Scripts

This document describes the comprehensive test orchestration system that has been implemented for consistent testing across both Cypress (frontend) and Vitest (backend) test suites.

## Overview

Both test runners now use a **consistent orchestrated approach** that:

1. **Starts fresh backend environments with unique ports** to avoid conflicts
2. **Uses the SimulationOrchestrator** to ensure proper P2P networking setup
3. **Provides environment variables** to tests for backend connectivity
4. **Handles cleanup** of all processes and temporary files

## Scripts

### Cypress Frontend Tests

**Script**: `run-cypress-with-backends.sh`

**Ports Used**:
- Alice Backend: `http://localhost:3011`
- Bob Backend: `http://localhost:3012`
- Network Simulator: `ws://localhost:3013`
- Network HTTP API: `http://localhost:3014`
- Frontend: `http://localhost:5174`

**Usage**:
```bash
./run-cypress-with-backends.sh
```

**Features**:
- Starts complete orchestrated backend environment
- Configures frontend to use test backend URLs via environment variables
- Runs Cypress tests against the full system
- Handles proper cleanup

### Backend Vitest Tests

**Script**: `run-backend-tests-with-orchestrator.sh`

**Ports Used**:
- Alice Backend: `http://localhost:4011`
- Bob Backend: `http://localhost:4012`
- Network Simulator: `ws://localhost:4013`
- Network HTTP API: `http://localhost:4014`

**Usage**:
```bash
./run-backend-tests-with-orchestrator.sh
```

**Features**:
- Starts orchestrated backend environment on unique ports
- Provides backend URLs to tests via environment variables
- Runs Vitest tests against live backend services
- 28/32 tests currently passing (87.5% success rate)

## Key Benefits

### 1. **Port Isolation**
Each test suite uses completely different port ranges to avoid conflicts:
- Cypress tests: 301X range
- Backend tests: 401X range
- No interference between test runs

### 2. **Realistic Test Environment**
Tests run against the actual **SimulationOrchestrator** setup that matches production, including:
- Full P2P networking simulation
- Encrypted message exchange
- Bloom filter synchronization
- Real backend-to-backend communication

### 3. **Environment Variable Configuration**
Both frontend and backend adapt to test environments via environment variables:
- `ALICE_BACKEND_URL`
- `BOB_BACKEND_URL`
- `NETWORK_HTTP_URL`
- `TEST_MODE=orchestrated`

### 4. **Automatic Cleanup**
Both scripts handle complete cleanup:
- Kill all test processes
- Remove temporary configuration files
- Clear port bindings

## Implementation Details

### Custom Orchestrator Configuration

Both scripts create custom TypeScript orchestrators that:

```typescript
class TestOrchestrator {
  constructor() {
    // Override default ports with test-specific ports
    this.alicePort = parseInt(process.env.ALICE_PORT || 'xxxx')
    this.bobPort = parseInt(process.env.BOB_PORT || 'xxxx')
    // ... configure NetworkSimulatorService with custom ports
  }
}
```

### Frontend Environment Integration

The frontend `App.tsx` was updated to use environment variables:

```typescript
const aliceBackendUrl = (process.env as any).ALICE_BACKEND_URL || 'http://localhost:3001'
const bobBackendUrl = (process.env as any).BOB_BACKEND_URL || 'http://localhost:3002'
```

### Backend Route Initialization Fix

The backend `server.ts` was updated to properly initialize message routes after the store and message generator are ready:

```typescript
async function initializeSync() {
  store = new InMemoryStore(deviceId)
  messageGenerator = new MessageGenerator(deviceId)
  await messageGenerator.initialize()
  
  // Create message routes with initialized dependencies
  const routes = createMessageRoutes(store, messageGenerator)
  app.use('/api/messages', routes)
}
```

## Test Results

### Cypress Tests
The Cypress file transfer test infrastructure is now ready. The test was failing due to backend mode requirements, but now has proper orchestrated backend support.

### Backend Tests  
Current status: **28 passing, 4 failing (87.5% success rate)**

**Passing categories**:
- Crypto tests (EventCrypto, KeyManager, MessageGenerator)
- Most sync tests (BloomFilter, CachedBloomFilter)
- Some integration tests

**Failing tests** primarily due to:
- Hardcoded port assumptions (connecting to 3003 instead of 4013)
- Tests starting their own conflicting servers
- Legacy test setup assumptions

## Usage Examples

### Running Cypress Tests
```bash
cd /home/hwilson/sync-experiments
./run-cypress-with-backends.sh
```

### Running Backend Tests  
```bash
cd /home/hwilson/sync-experiments
./run-backend-tests-with-orchestrator.sh
```

### Running Both Sequentially
```bash
# Backend tests first (they're faster)
./run-backend-tests-with-orchestrator.sh

# Then frontend tests
./run-cypress-with-backends.sh
```

## Next Steps

1. **Fix remaining backend test port assumptions** to achieve 100% pass rate
2. **Resolve Cypress file transfer test** now that backend orchestration is working
3. **Add parallel test execution** for faster CI/CD pipeline
4. **Integrate with CI/CD** using these orchestrated test scripts

The orchestrated testing approach provides a **solid foundation** for consistent, realistic testing across the entire P2P messaging system.