# Simulation Service

This service provides simulation control and orchestration for the sync-experiments project. It manages automatic message generation, simulation timing, and coordination of test scenarios.

## Overview

The Simulation Service is separate from the device backends (Alice and Bob) and provides:

- **Automatic Message Generation** - Configurable rates per device
- **Time Control** - Pause, play, and speed control for simulations
- **Global Configuration** - Centralized control of simulation parameters
- **Device Coordination** - Enable/disable devices and distribute message rates

## Architecture

```
┌─────────────────────────┐
│   Frontend UI (5173)    │
└───────────┬─────────────┘
            │ HTTP
            ▼
┌─────────────────────────┐
│  Simulation Control     │
│    Service (3005)       │
│                         │
│ - AutoMessageGenerator  │
│ - TimeController        │
│ - Global Config         │
└─────────────────────────┘
            │
            │ Controls message generation
            ▼
┌──────────────┐  ┌──────────────┐
│ Alice Backend│  │ Bob Backend  │
│   (3001)     │  │   (3002)     │
└──────────────┘  └──────────────┘
```

## Components

### SimulationControlServer
Main server that exposes REST APIs for simulation control.

### AutoMessageGenerator
Generates automatic messages at configured rates and posts them to device backends.

### TimeController
Manages simulation time, pause/play state, and time scaling.

### SimulationOrchestrator
Coordinates all backend services for integration testing (optional).

## API Endpoints

### Health & Status
- `GET /api/health` - Service health check
- `GET /api/simulation/config` - Get full configuration
- `GET /api/simulation/status` - Get current status and rates

### Device Control
- `POST /api/devices/:deviceId/enabled` - Enable/disable device
- `GET /api/devices/:deviceId/status` - Get device status

### Rate Control
- `POST /api/simulation/message-rate` - Set global messages/hour
- `POST /api/simulation/attachment-rate` - Set attachment percentage

### Simulation Control
- `POST /api/simulation/start` - Start simulation
- `POST /api/simulation/pause` - Pause simulation
- `POST /api/simulation/speed` - Set simulation speed

## Running the Service

### Development
```bash
npm install
npm run dev
```

### Production
```bash
npm run build
npm start
```

### Environment Variables
- `SIMULATION_CONTROL_PORT` - Port to run on (default: 3005)
- `ALICE_BACKEND_URL` - Alice backend URL (default: http://localhost:3001)
- `BOB_BACKEND_URL` - Bob backend URL (default: http://localhost:3002)

## Integration with Frontend

The frontend communicates with this service via the `SimulationControlAPI` class:

```typescript
import { SimulationControlAPI } from './api/SimulationControlAPI'

const api = new SimulationControlAPI('http://localhost:3005')

// Enable/disable devices
await api.setDeviceEnabled('alice', true)

// Set generation rates
await api.setGlobalMessageRate(60) // 60 messages/hour
await api.setGlobalAttachmentRate(30) // 30% attachments

// Control simulation
await api.start()
await api.pause()
await api.setSpeed(2.0) // 2x speed
```

## Testing

The simulation service includes comprehensive tests organized by type:

### Test Structure
- **`tests/unit/`** - Unit tests for individual components
- **`tests/integration/`** - Integration tests with multiple services
- **`tests/e2e/`** - End-to-end simulation scenarios

### Running Tests
```bash
# All tests
npm test

# Unit tests only
npm test tests/unit

# Integration tests
npm test tests/integration

# E2E tests
npm test tests/e2e

# With coverage
npm test -- --coverage
```

### Test Coverage
- ✅ **SimulationControlServer** - API endpoints and configuration
- ✅ **AutoMessageGenerator** - Message generation and rate control
- ✅ **TimeController** - Time manipulation and simulation speed
- ✅ **End-to-end scenarios** - Complete simulation workflows
- ✅ **Integration with backends** - Message flow testing

## Development Notes

- This service is independent of device backends
- Auto-generated messages use the same API as manual messages
- Time control affects message generation timing
- Global rate is distributed across enabled devices