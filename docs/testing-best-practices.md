# Testing Best Practices

This document captures lessons learned from implementing and testing the direct UDP message delivery feature.

## Key Testing Patterns

### 1. Use the SimulationEngine API Correctly

The `SimulationEngine` manages its own device databases and sync managers internally. Don't try to create them separately.

**Correct approach:**
```typescript
const engine = new SimulationEngine()

// Initialize devices through setDeviceFrequencies
await engine.setDeviceFrequencies([
  { deviceId: 'alice', messagesPerHour: 0, enabled: false },
  { deviceId: 'bob', messagesPerHour: 0, enabled: false }
])

// Access databases and sync managers through the engine
const bobDB = engine.getDeviceDatabase('bob')
const aliceSync = engine.getSyncManager('alice')
```

**Incorrect approach:**
```typescript
// Don't create databases manually
const aliceDB = new DeviceDB('alice')
await aliceDB.initialize()
```

### 2. Simulation Timing

The simulation engine uses ticks (default 100ms simulation time per tick). Always advance the simulation using `engine.tick()`:

```typescript
// Send a message
engine.createMessageEvent('alice', 'Hello')

// Advance simulation to allow network delivery
for (let i = 0; i < 10; i++) {
  engine.tick() // Each tick = 100ms simulation time
}
```

### 3. Testing Network Conditions

Configure network parameters through the engine:

```typescript
engine.updateNetworkConfig({
  packetLossRate: 0.5,    // 50% packet loss
  minLatency: 10,         // Minimum 10ms latency
  maxLatency: 50,         // Maximum 50ms latency
  jitter: 10              // ±10ms jitter
})
```

### 4. Async Initialization

The `setDeviceFrequencies` method is async because it initializes databases and sync managers:

```typescript
beforeEach(async () => {
  engine = new SimulationEngine()
  
  // This is async!
  await engine.setDeviceFrequencies([
    { deviceId: 'alice', messagesPerHour: 0, enabled: false },
    { deviceId: 'bob', messagesPerHour: 0, enabled: false }
  ])
})
```

### 5. Testing Message Delivery

When testing message delivery, remember that messages go through several stages:

1. **Creation**: Message is created in sender's database
2. **Network transmission**: Subject to latency and packet loss
3. **Delivery**: Received by target device (if not dropped)
4. **Storage**: Stored in recipient's database

Test both direct delivery and bloom sync recovery:

```typescript
// Test direct delivery
engine.createMessageEvent('alice', 'Test message')
for (let i = 0; i < 3; i++) engine.tick() // Wait for network latency

// Test bloom sync recovery (for dropped messages)
await aliceSync.updateLocalState()
await bobSync.updateLocalState()
for (let i = 0; i < 60; i++) engine.tick() // Wait for bloom sync cycle
```

### 6. Common Pitfalls

1. **Forgetting async initialization**: Always await `setDeviceFrequencies`
2. **Not advancing simulation time**: Use `engine.tick()` to progress time
3. **Creating resources manually**: Let the engine manage databases and sync
4. **Insufficient ticks for network operations**: Account for latency in tests
5. **Not checking both direct and sync paths**: Test resilience to packet loss

### 7. Debugging Tips

- Use console.log statements in tests to track message flow
- Check network stats: `engine.getNetworkStats()`
- Verify device sync status: `engine.getDeviceSyncStatus()`
- Monitor bloom filter events in the network log

## Example Test Structure

```typescript
describe('Network Feature Tests', () => {
  let engine: SimulationEngine

  beforeEach(async () => {
    engine = new SimulationEngine()
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false },
      { deviceId: 'bob', messagesPerHour: 0, enabled: false }
    ])
  })

  it('should handle feature correctly', async () => {
    // Configure network
    engine.updateNetworkConfig({ packetLossRate: 0.1 })
    
    // Send message
    engine.createMessageEvent('alice', 'Test')
    
    // Wait for delivery
    for (let i = 0; i < 10; i++) engine.tick()
    
    // Verify
    const bobDB = engine.getDeviceDatabase('bob')!
    const events = await bobDB.getAllEvents()
    expect(events.length).toBe(1)
  })
})
```