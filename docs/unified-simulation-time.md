# Unified Simulation Time Architecture

## Overview

The unified simulation time architecture enables deterministic testing and fast replay of network events by decoupling simulation time from wall clock time. This allows hours of simulated activity to run in seconds while maintaining accurate timing relationships between events.

## Components

### 1. TimeController (Backend)

The central time authority that manages simulation time for the entire system.

```typescript
class TimeController {
  // Core time management
  getCurrentTime(): number
  advance(deltaMs: number)
  setSpeed(multiplier: number)
  
  // Time listeners
  addListener(listener: TimeListener)
  removeListener(listener: TimeListener)
  
  // Control
  start(), stop(), reset()
  jumpToTime(targetTime: number)
}
```

**Key Features:**
- Dispatches time events to all registered components
- Supports variable speed playback (1x to 100x)
- Deterministic time advancement
- Real-time mode for live operation

### 2. TimeAwareNetworkSimulator

Network simulator that uses simulation time for all events and delays.

```typescript
class TimeAwareNetworkSimulator extends NetworkSimulator implements TimeListener {
  onTimeTick(event: TimeEvent): void
  // All timestamps and delays use simulation time
}
```

**Benefits:**
- Network latency simulation in fast-forward mode
- Deterministic packet delivery timing
- Consistent event ordering

### 3. TimeAwareSyncManager

Sync manager that triggers based on simulation time intervals.

```typescript
class TimeAwareSyncManager extends SyncManager implements TimeListener {
  // Sync intervals in simulation time
  // E.g., sync every 5 seconds of simulation time
}
```

**Benefits:**
- Predictable sync behavior in tests
- Fast testing of long-duration sync scenarios
- No dependency on system timers

### 4. TimeAwareSimulationServer

Enhanced simulation server with time control API.

**Endpoints:**
- `GET /api/time/current` - Get current simulation time
- `POST /api/time/control` - Control time (start, stop, speed, advance)
- Event replay respects simulation time

### 5. TimeAwareEngine (Frontend)

Frontend engine that syncs with backend time controller.

```typescript
class TimeAwareEngine extends SimulationEngine {
  // Connects to backend time controller via SSE
  // Synchronizes simulation time across frontend/backend
}
```

## Usage Examples

### Fast Testing

```typescript
// Run 1 hour of activity in 1 second
timeController.setSpeed(3600)
timeController.start()

// Events execute at simulation time
// Network delays are simulated proportionally
// Sync intervals trigger on simulation time
```

### Deterministic Testing

```typescript
// Jump to specific time
timeController.jumpToTime(3600000) // 1 hour

// All components see consistent time
// Events can be replayed exactly
```

### Event Replay

```typescript
// Replay saved scenario at 10x speed
POST /api/replay/start
{
  "scenario": "heavy-traffic.jsonl",
  "mode": "test",
  "speed": 10
}

// 1 hour of events replays in 6 minutes
// All timing relationships preserved
```

## Benefits

1. **Fast Tests**: Hours of activity in seconds
2. **Determinism**: Reproducible test results
3. **Debugging**: Step through time, examine state
4. **Scenarios**: Save and replay complex scenarios
5. **Performance**: Test at scale without waiting

## Implementation Status

- ✅ TimeController base implementation
- ✅ TimeAwareNetworkSimulator
- ✅ TimeAwareSyncManager
- ✅ TimeAwareSimulationServer
- ✅ TimeAwareEngine (frontend)
- ✅ Time-controlled sync tests
- ⏳ Backend server integration
- ⏳ Frontend UI integration

## Migration Path

1. Use existing components for backward compatibility
2. Gradually adopt TimeAware variants
3. Enable time control for testing
4. Full migration for deterministic operation

## Testing Patterns

### Long Duration Tests

```typescript
it('should handle week of activity', async () => {
  timeController.setSpeed(10000) // 10,000x speed
  
  // Simulate 1 week in ~1 minute
  for (let day = 0; day < 7; day++) {
    // Generate day's worth of events
    await simulateDay(day)
    
    // Advance 24 hours in seconds
    timeController.advance(86400000)
  }
  
  // Verify week's worth of sync
  expect(syncStatus).toBe('complete')
})
```

### Network Condition Tests

```typescript
it('should handle variable latency', async () => {
  // Configure realistic network
  networkSimulator.updateConfig({
    minLatency: 50,
    maxLatency: 500,
    jitter: 100
  })
  
  // Run at 100x speed
  timeController.setSpeed(100)
  
  // Test maintains accurate timing
  // 500ms latency = 5ms real time at 100x
})
```

### Replay-Based Tests

```typescript
it('should reproduce bug scenario', async () => {
  // Load problematic scenario
  await loadScenario('sync-bug-case-1.jsonl')
  
  // Replay at high speed
  await replayEvents({ speed: 1000 })
  
  // Verify bug is fixed
  expect(finalState).toMatchSnapshot()
})
```

## Best Practices

1. **Always use simulation time** in time-aware components
2. **Register listeners** with TimeController
3. **Test at multiple speeds** to ensure correctness
4. **Save scenarios** for regression testing
5. **Use time jumps** carefully (no backward jumps)

## Future Enhancements

1. **Time-travel debugging**: Snapshot and restore state
2. **Parallel timelines**: Test multiple scenarios
3. **Time dilation**: Slow down specific periods
4. **Automated scenario generation**: Fuzz testing with time
5. **Performance profiling**: Measure at simulation scale