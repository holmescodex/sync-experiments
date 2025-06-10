# Test Isolation Patterns

## Overview

We've implemented comprehensive test isolation to prevent conflicts between orchestrated and non-orchestrated test environments. Tests now automatically detect their environment and adapt accordingly.

## Environment Detection

All tests use this pattern:

```typescript
const isOrchestrated = process.env.TEST_MODE === 'orchestrated'
const aliceUrl = process.env.ALICE_BACKEND_URL || 'http://localhost:3001'
const bobUrl = process.env.BOB_BACKEND_URL || 'http://localhost:3002'
```

## Key Isolation Areas

### 1. **Port Management**
- **Development**: 3001-3004
- **Cypress Tests**: 3011-3014  
- **Backend Tests**: 4011-4014

**Pattern**: All tests use environment variables for URLs:
```typescript
const aliceUrl = process.env.ALICE_BACKEND_URL || 'http://localhost:3001'
```

### 2. **Key Management**
- **Orchestrated Mode**: Keys provided via environment variables by SimulationOrchestrator
- **Non-Orchestrated Mode**: Tests manually set up key relationships

**Pattern**:
```typescript
if (!isOrchestrated) {
  // Manual key setup for isolated tests
  aliceKeyManager.addPeerPublicKey('bob', bobKeyManager.getKeyPair().publicKey)
  aliceKeyManager.trustPeer('bob')
}
// In orchestrated mode, keys come from environment
```

### 3. **File System Isolation**
**Pattern**:
```typescript
beforeEach(() => {
  // Only clean up keys directory for non-orchestrated tests
  if (!isOrchestrated && fs.existsSync(keysDir)) {
    fs.rmSync(keysDir, { recursive: true, force: true })
  }
})
```

### 4. **Process Management**
Tests that start their own servers check orchestration status:

**Pattern**:
```typescript
beforeAll(async () => {
  if (isOrchestrated) {
    // Services already running - just verify they're ready
    await waitForServer(aliceUrl)
    return
  }
  
  // Start our own processes for non-orchestrated mode
  aliceProcess = spawn('npx', ['tsx', 'src/server.ts'], {...})
})

afterAll(async () => {
  if (!isOrchestrated) {
    // Only kill processes we started
    if (aliceProcess) aliceProcess.kill()
  }
})
```

### 5. **Test Execution Gating**
Tests that require orchestration skip in non-orchestrated mode:

**Pattern**:
```typescript
it('should sync messages between backends', async () => {
  if (!isOrchestrated) {
    console.log('[Test] Skipping - requires orchestrated environment')
    return
  }
  // Test implementation...
})
```

## Files Updated

### **Pure Unit Tests** (No orchestration needed):
- `crypto/KeyManager.test.ts` - Only file system isolation
- `crypto/MessageGenerator.test.ts` - Only file system isolation  

### **Integration Tests** (Require orchestration):
- `sync/backend-sync.test.ts` - Port + orchestration gating
- `integration/end-to-end-crypto.test.ts` - Keys + file system + orchestration gating
- `integration/fast-sync.test.ts` - Port + orchestration gating
- `integration/multi-client-sync.test.ts` - Port + orchestration gating

### **Simulation Tests** (Complex process management):
- `simulation/event-recording.test.ts` - Process + port + orchestration management
- `simulation/full-sync-scenario.test.ts` - Port + orchestration gating
- `simulation/e2e-flow.test.ts` - Port + orchestration gating
- `simulation/time-controlled-sync.test.ts` - Keys + orchestration gating

## Benefits

1. **No Conflicts**: Tests can run in parallel without port/file conflicts
2. **Flexible Execution**: Same tests work in development, CI, and orchestrated environments
3. **Clean Isolation**: Each environment is completely isolated from others
4. **Deterministic**: Orchestrated tests use consistent key setup
5. **Efficient**: No redundant setup when orchestrator already provides services

## Environment Variables Reference

### **Orchestrated Environment**:
```bash
# Test mode detection
TEST_MODE=orchestrated

# Backend URLs  
ALICE_BACKEND_URL=http://localhost:3011
BOB_BACKEND_URL=http://localhost:3012

# Crypto keys (set by orchestrator)
PRIVATE_KEY=<base64-private-key>
PUBLIC_KEY=<base64-public-key>
PEER_KEYS={"alice":"<key>","bob":"<key>"}
TRUSTED_PEERS=alice,bob

# Network ports
NETWORK_SIMULATOR_PORT=3013
NETWORK_HTTP_PORT=3014
```

### **Development Environment**:
```bash
# Uses defaults - no environment variables needed
# Ports: alice=3001, bob=3002, network=3003, http=3004
```

This pattern ensures that tests are robust, isolated, and can run in any environment without conflicts or manual setup.