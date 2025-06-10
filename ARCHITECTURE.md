# System Architecture

## Overview

This project implements a **peer-to-peer event store** with a **local-first architecture**, enabling devices to sync messages and files without a central server. The system uses SQLite databases (planned), encrypted events, and Bloom filter-based synchronization over UDP.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    React Frontend (Port 5173)               │
│                   Alice View + Bob View + Controls          │
└─────────────────────┬───────────────────┬───────────────────┘
                      │ HTTP              │ HTTP
                      ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────────┐
│ Alice Backend   │  │  Bob Backend    │  │  Simulation Service │
│  (Port 3001)    │  │  (Port 3002)    │  │    (Port 3005)      │
│                 │  │                 │  │                     │
│ - Messages API  │  │ - Messages API  │  │ - AutoMessageGen    │
│ - Crypto        │  │ - Crypto        │  │ - TimeController    │
│ - Storage       │  │ - Storage       │  │ - Global Config     │
│ - Sync Manager  │  │ - Sync Manager  │  │ - Rate Distribution │
└────────┬────────┘  └────────┬────────┘  └─────────────────────┘
         │                    │                         │
         │  Direct UDP P2P    │              HTTP Messages
         │  (Port 8001)       │  (Port 8002)            │
         └────────────────────┘              ┌───────────┘
                                             │
                                             ▼
                                    POST /api/messages
                                   (Auto-generated content)
```

## Core Concepts

### Event Sourcing
All data is represented as immutable events:
- **Messages**: Text content with optional attachments
- **Reactions**: Emoji reactions to messages
- **Files**: Chunked file data (planned)
- **System Events**: Device status, sync events

Event IDs are content-addressed: `hash(encrypted_event_bytes)`

### Cryptography
- **Pre-shared keys (PSK)** with AEAD encryption
- All encryption happens in backends, never in browsers
- Ed25519 signatures for packet integrity
- Future: Per-member keys with Signal-like ratcheting

### Storage (Current: InMemory, Future: SQLite)
```sql
-- Planned schema
CREATE TABLE events (
  event_id     TEXT PRIMARY KEY,  -- hash(encrypted_bytes)
  account_id   TEXT,               -- which account/community
  received_ts  INTEGER,            -- when we received it
  encrypted    BLOB                -- encrypted event data
);

-- Materialized views for decrypted access
CREATE VIEW messages AS ...
CREATE VIEW reactions AS ...
CREATE VIEW file_chunks AS ...
```

## Network Architecture

### Direct P2P Communication
- Backends communicate directly via UDP
- No intermediary network simulator in production
- Ports: Alice (8001), Bob (8002)
- Packet format: `source:target:type:payload`

### Sync Protocol
1. **Bloom Filter Exchange** (every 5 seconds)
   - Each device maintains rolling Bloom filter of known event IDs
   - Filters exchanged to detect missing events
   
2. **Missing Event Detection**
   - Compare received filter with local events
   - Identify events we have that peer lacks
   
3. **Event Transmission**
   - Send missing events directly to peer
   - Tolerant of packet loss and reordering

### Network Resilience
- Eventual consistency model
- Handles network partitions
- Automatic retry for failed transmissions
- No central point of failure

## Backend Services

### Device Backends (Alice: 3001, Bob: 3002)
Each device runs its own backend service that:
- Manages event storage (currently InMemoryStore)
- Handles all cryptographic operations
- Implements Bloom filter-based sync
- Exposes REST API for frontend

**Key APIs:**
- `POST /api/messages` - Send a message
- `GET /api/messages` - Retrieve messages  
- `POST /api/messages/:id/reactions` - Add reaction
- `GET /api/stats` - Sync statistics
- `POST /api/device-status` - Online/offline

### Simulation Service (3005) - Separate Service
Located in `/simulation-service/`, manages automatic message generation:
- Controls generation rates per device
- Distributes global rate across devices
- Sets image attachment percentages
- Start/pause/speed controls
- Time-aware simulation orchestration

**Message Flow**: The AutoMessageGenerator components in this service send HTTP requests to device backends using the same `POST /api/messages` endpoints that the frontend uses. This ensures auto-generated messages are processed identically to manual messages.

**Key APIs:**
- `POST /api/devices/:id/enabled` - Enable/disable device
- `POST /api/simulation/message-rate` - Set global rate
- `POST /api/simulation/attachment-rate` - Set attachment %
- `POST /api/simulation/start` - Start simulation

## Frontend Architecture

### React Components
- **ChatInterface** - WhatsApp-like messaging UI
- **EventLogWithControls** - Timeline and generation controls
- **NetworkEventLog** - Network activity visualization
- **SimulationControls** - Play/pause/speed controls

### Backend Communication
- **REST APIs** for all operations
- **HTTP polling** for updates (100ms network, 1s messages)
- **Optimistic updates** for responsiveness
- Future: WebSocket connections

### State Management
- Local React state for UI
- Backend as source of truth
- Eventual consistency between UI and backend

## Security Model

### Current Implementation
- Pre-shared community keys
- All members share same encryption key
- AEAD encryption for all events
- Ed25519 signatures on packets

### Future Enhancements
- Per-member encryption keys
- Forward secrecy with key ratcheting
- Multi-device support per user
- Invite system with capability tokens

## Development vs Production

### Development Mode
- Fixed device IDs (alice, bob)
- Localhost networking
- In-memory storage
- Simulation controls enabled

### Production Mode (Planned)
- Dynamic device registration
- Real network addresses
- SQLite persistent storage
- No simulation features

## Performance Characteristics

### Current Performance
- Sync interval: 5 seconds
- Message polling: 1 second
- Network event polling: 100ms
- Bloom filter size: Adaptive based on event count

### Scalability
- Designed for 2-10 devices per community
- Thousands of events per device
- Efficient sync with Bloom filters
- Minimal bandwidth usage

## Future Architecture

### Planned Enhancements
1. **SQLite Storage Backend**
   - Persistent event storage
   - Efficient queries via materialized views
   - Full-text search capabilities

2. **WebSocket Connections**
   - Real-time updates
   - Reduced polling overhead
   - Server-sent events fallback

3. **File Transfer System**
   - Content-addressed chunks
   - Reed-Solomon erasure coding
   - Progressive download/upload

4. **Multi-Device Support**
   - More than 2 devices
   - Dynamic peer discovery
   - Efficient multi-party sync