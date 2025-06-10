# Event Playback Testing

## Overview

Event playback testing provides a deterministic way to debug and verify the behavior of our P2P sync system. By replaying a sequence of events in a controlled environment, we can identify exactly where issues occur in the event storage and synchronization pipeline.

## Architecture

### Key Components

1. **SimulationEngine**: Controls event execution and timing
2. **DeviceDB**: SQLite database for each device
3. **SyncManager**: Handles bloom filter synchronization
4. **Event Timeline**: Ordered sequence of events to execute

### Event Flow

```
User Input → createMessageEvent() → Event Timeline → executeEvent() → DeviceDB → Bloom Filter → Sync
```

## Testing Strategy

### 1. Deterministic Playback

- Pause the simulation engine to control timing precisely
- Create events with specific timestamps
- Advance simulation time in controlled increments
- Verify state at each step

### 2. Direct Database Access

- Access DeviceDB instances directly for verification
- Bypass UI and network layers to isolate issues
- Check event storage immediately after execution

### 3. Sync Verification

- Force sync ticks at specific intervals
- Monitor bloom filter updates
- Track event propagation between devices

## Test Categories

### Manual Message Storage
Tests that manual messages are stored correctly in the sender's database.

### Event Playback Sequence
Verifies that a sequence of events executes deterministically.

### Bloom Filter Sync
Confirms that events sync between devices via bloom filters.

### Debug Traces
Detailed logging to trace execution paths and identify failures.

## Running Tests

```bash
# Run all event playback tests
npm test event-playback

# Run with verbose logging
npm test -- --reporter=verbose event-playback

# Run specific test
npm test -- -t "should store manual message"
```

## Debugging the Manual Message Issue

The current issue where manual messages appear in the UI but not in the database can be debugged using:

1. **Execution Trace Test**: Logs every step of message creation and storage
2. **Database Verification**: Checks database content immediately after event execution
3. **Sync Status Check**: Verifies bloom filters are updated with new events

## Key Insights

- Manual messages with `simTime <= currentTime` should execute immediately
- The `executeEvent()` function is responsible for database storage
- Bloom filters must be updated after new events are stored
- Each device maintains its own SQLite database instance