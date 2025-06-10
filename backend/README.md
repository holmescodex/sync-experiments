# Backend Server for P2P Sync Simulation

This backend provides REST API endpoints for the P2P sync simulation, moving cryptographic operations from the browser to Node.js.

## Architecture

- Each device (alice, bob) runs its own backend instance
- Messages are encrypted/decrypted on the backend
- Frontend communicates via REST API
- NetworkSimulatorService provides centralized network simulation
- Bloom filter-based synchronization between backends

## Running the Backend

### Quick Start - Run Complete Simulation Environment:
```bash
npm run dev
```

This starts the SimulationOrchestrator which:
1. Starts NetworkSimulatorService (WebSocket on port 3003, HTTP API on port 3004)
2. Generates Ed25519 keys for Alice and Bob
3. Starts Alice backend on port 3001
4. Starts Bob backend on port 3002
5. Establishes trust relationships automatically
6. Begins bloom filter synchronization between devices

### Start individual components:
```bash
# Just the network simulator service
npm run dev:network

# Individual device backends (requires manual trust setup)
npm run dev:alice  # Port 3001
npm run dev:bob    # Port 3002
```

## Testing

### Manual API test:
```bash
# Test Alice's backend
./test-backend-api.js alice

# Test Bob's backend
./test-backend-api.js bob
```

### Combined test server (for development):
```bash
npm run dev:test
# Then in another terminal:
node test-combined-api.js
```

### End-to-end test with frontend:
```bash
# From project root
./test-backend-integration.sh
```

## API Endpoints

### Health Check
```
GET /api/health
```

### Messages
```
POST /api/messages
Body: { content: string, attachments?: any[] }

GET /api/messages?since={timestamp}

GET /api/messages/{id}

DELETE /api/messages/clear
```

### Device Stats & Control
```
GET /api/stats
Returns: { deviceId, eventCount, messageCount, syncPercentage, isOnline }

POST /api/device-status
Body: { online: boolean }
```

### Network Configuration
```
GET /api/network-config
Returns: { packetLossRate, minLatency, maxLatency, jitter }

POST /api/network-config
Body: { packetLossRate?: number, minLatency?: number, ... }
```

### Network Stats
```
GET /api/network-stats
Returns: Network statistics from NetworkSimulatorService
```

## Frontend Integration

The frontend automatically detects if backend servers are running and uses them. If not available, it falls back to local simulation mode.

To use backend mode:
1. Start backend servers (see above)
2. Start frontend: `cd app && npm run dev`
3. Frontend will detect backends and show in console

## Next Steps

- [ ] Replace in-memory storage with SQLite
- [ ] Add file upload/download endpoints
- [ ] Implement proper sync protocol
- [ ] Add WebSocket support for real-time updates