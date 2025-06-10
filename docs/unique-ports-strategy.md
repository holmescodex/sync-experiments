# Unique Ports Strategy for Testing

## Overview

To enable parallel and isolated testing across different test environments, we use a unique port allocation strategy that prevents conflicts between:
- Development servers
- Test environments  
- Multiple test runs
- CI/CD pipelines

## Port Allocation Scheme

### Development (Default)
- Alice Backend: `3001`
- Bob Backend: `3002` 
- Network Simulator: `3003`
- Network HTTP API: `3004`
- Frontend Dev Server: `5173`

### Cypress Tests (Orchestrated)
- Alice Backend: `3011`
- Bob Backend: `3012`
- Network Simulator: `3013`
- Network HTTP API: `3014`
- Frontend Test Server: `5174`

### Backend Unit Tests (Orchestrated)
- Alice Backend: `4011`
- Bob Backend: `4012`
- Network Simulator: `4013`
- Network HTTP API: `4014`

### Environment Variables

Each test environment uses environment variables to configure unique ports:

```bash
# Cypress Test Environment
export ALICE_BACKEND_URL="http://localhost:3011"
export BOB_BACKEND_URL="http://localhost:3012"
export NETWORK_SIMULATOR_PORT="3013"
export NETWORK_HTTP_PORT="3014"
export VITE_PORT="5174"

# Backend Test Environment  
export ALICE_BACKEND_URL="http://localhost:4011"
export BOB_BACKEND_URL="http://localhost:4012"
export NETWORK_SIMULATOR_PORT="4013"
export NETWORK_HTTP_PORT="4014"
```

## Implementation

### 1. Test Orchestration Scripts

**`run-cypress-with-backends.sh`**: Creates isolated Cypress test environment
- Generates unique Vite config with port 5174
- Starts orchestrator with ports 3011-3014
- Runs Cypress with environment variables
- Cleans up all processes on exit

**`run-backend-tests-with-orchestrator.sh`**: Creates isolated backend test environment
- Generates unique Vitest config with orchestrator environment variables
- Starts orchestrator with ports 4011-4014
- Runs backend tests with TEST_MODE=orchestrated
- Cleans up orchestrator on exit

### 2. Backend Server Configuration

**`backend/src/server.ts`**: Dynamically uses environment variables
```typescript
const port = process.env.PORT || (deviceId === 'alice' ? 3001 : 3002)
```

**`backend/src/network/RemoteNetworkSimulator.ts`**: Configurable service URL
```typescript
this.serviceUrl = serviceUrl || 
  (process.env.NETWORK_SIMULATOR_PORT ? `ws://localhost:${process.env.NETWORK_SIMULATOR_PORT}` : 'ws://localhost:3003')
```

### 3. Frontend Configuration

**Dynamic Vite Config Generation**: 
```javascript
// Generated vite.config.test.js for Cypress
export default {
  ...baseConfig,
  server: {
    port: 5174
  },
  define: {
    'process.env.ALICE_BACKEND_URL': '"http://localhost:3011"',
    'process.env.BOB_BACKEND_URL': '"http://localhost:3012"'
  }
}
```

**App.tsx Backend Detection**:
```typescript
const aliceBackendUrl = (process.env as any).ALICE_BACKEND_URL || 'http://localhost:3001'
const bobBackendUrl = (process.env as any).BOB_BACKEND_URL || 'http://localhost:3002'
```

### 4. Test Environment Detection

Tests automatically detect orchestrated environment:
```typescript
const isOrchestrated = process.env.TEST_MODE === 'orchestrated'
const aliceUrl = process.env.ALICE_BACKEND_URL || 'http://localhost:3001'
const bobUrl = process.env.BOB_BACKEND_URL || 'http://localhost:3002'
```

## Benefits

1. **Parallel Testing**: Multiple test suites can run simultaneously without conflicts
2. **CI/CD Compatibility**: Each pipeline stage gets isolated ports
3. **Development Safety**: Development servers unaffected by test runs
4. **Debugging**: Easy to identify which environment a service belongs to
5. **Cleanup**: Each environment can be torn down independently

## Port Range Reservations

- `3000-3009`: Development and production
- `3010-3019`: Cypress E2E testing  
- `4010-4019`: Backend unit testing
- `5170-5179`: Frontend test servers
- `6010-6019`: Reserved for future test environments

## Usage Examples

### Run Cypress tests with isolation:
```bash
./run-cypress-with-backends.sh
```

### Run backend tests with orchestrator:
```bash  
./run-backend-tests-with-orchestrator.sh
```

### Manual environment setup:
```bash
export ALICE_BACKEND_URL="http://localhost:7001"
export BOB_BACKEND_URL="http://localhost:7002"
npm test
```

This strategy ensures that different testing environments never conflict with each other while maintaining the same application behavior across all environments.