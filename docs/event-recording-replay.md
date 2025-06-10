# Event Recording and Replay Architecture

## Overview

This document describes the event recording and replay system that enables:
1. Recording all user actions and simulation events
2. Saving scenarios for later replay
3. Headless testing without frontend
4. Visual debugging with exact reproduction

## Architecture

### Components

1. **Event Store** (`events.jsonl`)
   - Append-only log of all events
   - Each line is a JSON event
   - Can be saved/loaded for scenarios

2. **Simulation Engine** (port 3000)
   - Records events from frontend
   - Manages event timeline
   - Replays events in two modes:
     - Test mode: Direct to backends
     - Live mode: Through frontend

3. **Frontend**
   - Sends manual actions to both:
     - Device backend (immediate effect)
     - Simulation engine (recording)
   - Receives events during replay

4. **Device Backends** (Alice: 3001, Bob: 3002)
   - Process messages and store in database
   - Handle sync protocol

### Event Flow

#### Manual Actions (Recording)
```
User Action in Frontend
    │
    ├──▶ Device Backend API ──▶ Database (immediate)
    │
    └──▶ Simulation Engine ──▶ Event Store (recorded)
```

#### Replay Mode
```
Event Store ──▶ Simulation Engine
                    │
                    ├── Test Mode ──▶ Device Backends (direct)
                    │
                    └── Live Mode ──▶ Frontend ──▶ Device Backends
```

## Event Types

### Message Event
```json
{
  "ts": 1234567890,
  "type": "message",
  "device": "alice",
  "content": "Hello world",
  "source": "manual" | "simulation",
  "attachments": []
}
```

### Device Status Event
```json
{
  "ts": 1234567890,
  "type": "device_status",
  "device": "alice",
  "online": true | false
}
```

### Sync Event
```json
{
  "ts": 1234567890,
  "type": "sync",
  "from": "alice",
  "to": "bob",
  "bloom_filter": "base64_encoded_filter"
}
```

## API Endpoints

### Simulation Engine API

#### Record Event
```
POST /api/events/record
Body: {
  "type": "message" | "device_status" | "sync",
  "device": "alice" | "bob",
  "data": { ... }
}
```

#### Start Replay
```
POST /api/replay/start
Body: {
  "scenario": "scenario-1.jsonl",
  "mode": "test" | "live",
  "speed": 1.0
}
```

#### Event Stream (SSE)
```
GET /api/events/stream
```

#### Save Scenario
```
POST /api/scenarios/save
Body: {
  "name": "test-scenario-1",
  "description": "Alice and Bob exchange messages"
}
```

## Usage

### Recording a Scenario

1. Start all services:
   ```bash
   npm run dev:simulation  # Simulation engine
   npm run dev:alice      # Alice backend
   npm run dev:bob        # Bob backend
   npm run dev            # Frontend
   ```

2. Perform actions in the UI
3. Save the scenario:
   ```bash
   curl -X POST http://localhost:3000/api/scenarios/save \
     -H "Content-Type: application/json" \
     -d '{"name": "my-scenario"}'
   ```

### Replaying a Scenario

#### Test Mode (Headless)
```bash
npm run test:replay scenarios/my-scenario.jsonl
```

#### Live Mode (With Frontend)
```bash
npm run replay scenarios/my-scenario.jsonl
```

## Testing

### Unit Tests
- Event serialization/deserialization
- Timeline management
- Event routing

### Integration Tests
- Recording and replay accuracy
- Backend state verification
- Sync protocol under various scenarios

### E2E Tests
- Full scenario replay
- UI interaction recording
- State consistency verification

## Benefits

1. **Reproducible Bugs**: Save exact scenario when bug occurs
2. **Regression Testing**: Replay scenarios after code changes
3. **Performance Testing**: Measure sync times under load
4. **Demo Scenarios**: Pre-recorded scenarios for demonstrations