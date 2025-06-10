# P2P Event Store Design

This repository collects experiments around a peer-to-peer event store. The long term goal is a small, local-first system that can sync messages and files without a central server.

## Architecture Overview

The system uses a **client-server architecture** similar to Telegram, Signal, or WhatsApp for security and proper separation of concerns:

* **Browser clients** handle only UI display and user interactions (React components)
* **Node.js backend** handles ALL cryptographic operations, storage, and sync protocols
* **Clean REST/WebSocket API** provides the boundary between client and server
* **Simulation environment** models multiple backend instances as separate devices

## Design Goals

* **Minimal metadata in the clear.** Events are stored and transmitted as opaque blobs.
* **SQLite as the only database.** All data lives in per-device SQLite files managed by the backend.
* **Opportunistic peer-to-peer sync.** Backend devices exchange Bloom filters over UDP to find missing events.
* **Simple frontend API.** A thin REST layer exposes Slack-like calls for sending and retrieving messages.
* **Security-first.** All encryption/decryption happens backend-side, never in browsers.

## Event Sourcing Model

All information is represented as immutable events. An event is a JSON structure that includes:

* `type` – e.g. `message`, `file_chunk`, `invite`.
* `ts` – timestamp when the event was created.
* `author` – device or user ID.
* Type-specific fields (channel ID, message body, file metadata, etc).

The `event_id` is `hash(event_bytes)` where `event_bytes` is the canonical JSON encoding. Devices sign events so that peers can verify authorship.

## Encryption & Security Architecture

**All cryptographic operations happen in the Node.js backend, never in browsers.**

### Community Encryption
Each community shares a single pre‑shared key (PSK) distributed out-of-band in an invite link. The backend:

* Serializes events to JSON and encrypts using AEAD (XChaCha20‑Poly1305 or AES‑GCM)
* Generates a random nonce per event
* Stores `nonce || ciphertext` in the SQLite `events` table
* Decrypts events using the PSK and nonce to recover JSON
* Derives all metadata after decryption

### Client-Server Security
* **Frontend (React)**: Sends plaintext messages via HTTPS API, receives decrypted data for display
* **Backend (Node.js)**: Handles ALL encryption, key management, and secure storage
* **API Layer**: REST endpoints for messages, WebSocket for real-time updates
* **Transport**: HTTPS only, no crypto operations exposed to browser

This approach hides metadata while allowing the event format to evolve. More sophisticated key rotation or per-member access control can be added later.

## Database Schema

**Each backend device manages its own SQLite database file** (e.g., `alice.db`, `bob.db`).

### Core Event Table
The raw event log stores encrypted blobs:

```sql
CREATE TABLE events (
  event_id           TEXT PRIMARY KEY,  -- hash(encrypted_bytes)
  device_id          TEXT,              -- which device owns this DB
  created_at         INTEGER,           -- when original author created event
  received_at        INTEGER,           -- when this device received event
  simulation_event_id INTEGER,          -- for testing/replay
  encrypted          BLOB               -- nonce || ciphertext
);
```

### Decryption Strategy
The backend **decrypts on-the-fly** when serving API requests:

* **No persistent unencrypted storage** - all data remains encrypted at rest
* **API endpoints decrypt** event payloads as needed to serve frontend requests  
* **Optional caching** - may cache recently decrypted messages in memory for performance
* **File chunks** remain encrypted in database, assembled and decrypted only when requested

```sql
-- Example: File chunks remain encrypted
CREATE TABLE file_chunks (
  prf_tag    TEXT PRIMARY KEY,  -- pseudorandom tag  
  file_id    TEXT,              -- content hash
  chunk_data BLOB               -- encrypted chunk (stays encrypted)
);
```

**Key Principle**: The database stores only encrypted blobs. Decryption happens temporarily in backend memory to serve API responses.

## Frontend API Architecture

The React frontend communicates with its device backend via a clean REST/WebSocket API:

### Message Operations
```typescript
// Send a message (frontend → backend)
POST /api/messages
{
  "content": "Hello world!",
  "attachments": [...]  // file metadata only
}

// Get messages (backend → frontend) 
GET /api/messages?since=timestamp
{
  "messages": [
    {
      "id": "msg123",
      "author": "alice", 
      "content": "Hello world!",
      "timestamp": 1234567890,
      "attachments": [...]
    }
  ]
}
```

### File Operations
```typescript
// Upload file (frontend → backend)
POST /api/files
FormData: file blob
// Backend: chunks, encrypts, stores as encrypted file_chunk events

// Download file (backend → frontend)  
GET /api/files/{fileId}
// Backend: retrieves encrypted chunks, decrypts, assembles, serves blob
Response: file blob with proper mime type

// File metadata (for message attachments)
GET /api/files/{fileId}/info
{
  "fileId": "abc123",
  "fileName": "image.jpg", 
  "mimeType": "image/jpeg",
  "size": 156789,
  "isComplete": true  // all chunks received
}
```

### Real-time Updates
```typescript
// WebSocket for live message updates
WS /api/events
{
  "type": "new_message",
  "message": {...}
}
```

**Key Principle**: The frontend never sees encrypted data, database schemas, or cryptographic keys. All security operations are isolated in the backend.

## Cryptographic Architecture

The system uses a layered approach to cryptography, with different security mechanisms applied at different stages:

### Event Lifecycle & Cryptography

1. **Event Creation & Storage**:
   ```
   Plain Event → Sign with Ed25519 → Encrypt with PSK → Store in DB
   ```
   - Events are signed by their author for authenticity
   - Then encrypted with community PSK for privacy
   - Stored in database as signed & encrypted blobs
   - This becomes the canonical representation

2. **Event Transmission**:
   ```
   Get from DB → Send as-is over network
   ```
   - Events are already signed and encrypted
   - No additional cryptography needed
   - Just send the bytes from the database

3. **Event Reception**:
   ```
   Receive bytes → Verify PSK decryption → Verify signature → Store in DB
   ```
   - First decrypt with PSK (fails fast if wrong community)
   - Then verify Ed25519 signature (proves authenticity)
   - Store the original bytes in database if valid

### Bloom Filter Management

Bloom filters are treated as signed, versioned artifacts that are updated on a scheduled basis:

1. **Bloom Filter Creation**:
   ```
   Generate filter → Sign → Encrypt → Cache
   ```
   - Created on a configurable schedule (e.g., every 10 seconds, or after N new events)
   - Signed and encrypted once at creation
   - Cached in memory or special DB table
   - Includes version number and timestamp

2. **Update Schedule**:
   - Time-based: Update every X seconds
   - Event-based: Update after N new events added
   - Hybrid: Update on timer OR event threshold, whichever comes first
   - Configurable per device or network conditions

3. **Bloom Filter Transmission**:
   ```
   Get cached filter → Send as-is
   ```
   - No re-signing or re-encryption needed
   - Same signed blob sent to all peers
   - Can be sent repeatedly until next scheduled update

4. **Bloom Filter Reception**:
   ```
   Receive → Verify PSK → Verify signature → Check version → Process
   ```
   - Decrypt to verify community membership
   - Check signature for authenticity
   - Compare version to skip if already processed
   - Only process if newer than last seen version

### Advantages of Scheduled Updates

- **Predictable Performance**: CPU cost amortized over time
- **Batching**: Multiple events covered by one filter update
- **Network Efficiency**: Peers can predict when to expect updates
- **Tuneable**: Can adjust schedule based on activity level
- **Consistency**: All peers receive identical filter for each version

### Key Design Principles

1. **Single Source of Truth**: The event database stores the canonical signed & encrypted representation
2. **No Double Encryption**: Events are encrypted once at creation, not again for transport
3. **Sign at Creation**: Signatures are part of the event, not just for transport
4. **Verify on Receipt**: Both PSK and signature must be valid before storing

### Implementation Notes

- **Event Structure**:
  ```typescript
  interface StoredEvent {
    event_id: string,        // hash(encrypted_bytes)
    encrypted_bytes: Blob    // Contains: nonce || ciphertext
    // ciphertext decrypts to: SignedEvent
  }
  
  interface SignedEvent {
    payload: any,            // Actual event data
    author: string,          // Device that created it
    timestamp: number,       // When created
    signature: Uint8Array    // Ed25519 signature
  }
  ```

- **Network Packets**:
  - Events: Send `encrypted_bytes` directly from DB
  - Bloom filters: Send cached signed & encrypted blob
  
- **Bloom Filter Cache Structure**:
  ```typescript
  interface CachedBloomFilter {
    version: number,              // Increments with each update
    created_at: number,           // When this version was created
    event_count: number,          // Number of events in filter
    filter_size: number,          // Size of filter in bytes
    signed_encrypted_blob: Blob   // Ready to send
  }
  ```

- **Update Triggers**:
  ```typescript
  // Example configuration
  const bloomUpdateConfig = {
    maxAge: 10000,        // Update every 10 seconds
    maxNewEvents: 100,    // Or after 100 new events
    minInterval: 1000     // But no more than once per second
  }
  ```

This architecture ensures that:
- Events are immutable once created
- Bloom filters are efficiently cached and reused
- All cryptographic operations happen once at creation
- Network transport is just moving pre-secured bytes
- CPU usage is predictable and controlled

## Bloom Filter Sync (Backend-to-Backend)

Backend devices exchange Bloom filters over UDP to synchronize their event stores. Each device maintains a rolling Bloom filter summarizing the event IDs it knows about. When a device receives a peer's filter it computes the set of events that appear to be missing and sends them.

This mechanism lets peers reconcile history without revealing which events they are requesting. Packet loss and latency are tolerated because filters and events can be retransmitted opportunistically.

## Simulation Architecture

The simulation environment models **multiple backend instances** representing different devices, each with its own:

### Simulation Engine (Plaintext Only)
* **Generates plaintext events**: Messages, file uploads, device joins
* **Schedules event delivery**: Based on configured message frequencies
* **Routes to devices**: Delivers plaintext events to device backends
* **No cryptography**: The simulation engine never touches encryption or signing

### Backend Device Instance
* **Receives plaintext events** from simulation engine
* **Signs and encrypts** events before storing in database
* **SQLite database** (`alice.db`, `bob.db`, etc.) stores encrypted events
* **Bloom filter sync** exchanges encrypted events between backends
* **UDP network simulation** for P2P communication

### Frontend Clients
* **React applications** connecting to their respective backend
* **API communication** via HTTP/WebSocket to local backend
* **UI rendering** of decrypted messages and files

### Data Flow
```
Simulation Engine / UI (plaintext)
    → POST /api/messages (plaintext)
    → Device Backend (signs & encrypts) 
    → Database (stores encrypted)
    → Network (sends encrypted)
    → Peer Device (verifies & stores)
```

### Message Creation Flow
1. **Trigger Sources**:
   - Simulation Engine: Sends plaintext "user actions" to device backends
   - Manual UI: User-typed messages sent as plaintext to backend
   - Both simulate real user behavior - NO ENCRYPTION at this layer

2. **Backend Processing** (Node.js only):
   ```
   POST /api/messages { content: "Hello", attachments: [...] }
       ↓
   Device Backend (Node.js):
   - Generate event ID
   - Add timestamp and author
   - Sign with Ed25519 private key
   - Encrypt with community PSK
   - Store encrypted blob in DB
   - Broadcast encrypted bytes to network peers
   ```

### Critical Architecture Point
- **Simulation is in browser**: Only schedules and sends plaintext user actions
- **Each device has a Node.js backend**: ALL encryption happens here
- **Current limitation**: We're running simulation in browser without real Node backends
- **Future**: Each device will have its own Node.js process handling crypto

### Key Principle: Separation of Concerns
- **Simulation Engine**: Only handles scheduling and plaintext event generation
- **Device Backends**: Handle all cryptographic operations
- **Network Layer**: Just moves encrypted bytes between devices
- **Database Layer**: Stores signed & encrypted events as source of truth

The simulator generates real-world events in plaintext, devices handle all security, and the network just transports opaque encrypted blobs.

## Implementation Milestones

### Phase 1: Client-Server Foundation
1. **Backend API** - Express servers with REST endpoints for messages
2. **Frontend refactor** - React components using API instead of direct DB access  
3. **Crypto migration** - Move all encryption from browser to backend

### Phase 2: P2P Sync Protocol
4. **Two backends Bloom-sync** - Backend instances exchange filters until convergent
5. **UDP simulation** - Model packet loss and network conditions between backends
6. **File chunking** - Backend handles file encryption, chunking, and reassembly

### Phase 3: Multi-Device Simulation  
7. **N-peer convergence** - Multiple backend instances with realistic network topology
8. **Real-time updates** - WebSocket integration for live message updates
9. **Comprehensive testing** - Deterministic replay and convergence verification

### Phase 4: Advanced Features
10. **Network conditions** - Configurable latency, packet loss, and partitions
11. **Performance metrics** - Sync efficiency, bandwidth usage, and timing analysis
12. **Production readiness** - Security audit and deployment considerations

**Current Status**: File attachment syncing works in current (incorrect) architecture. Next step is Phase 1 migration.


## Encryption Notes

We want the API to remain simple: the frontend submits events as JSON
structures and the storage layer handles encryption automatically. To
keep the initial design straightforward, each community will share a
single pre‑shared key (PSK). The PSK is distributed out‑of‑band in an
invite link.

### Scheme

* Events are serialized to JSON and then encrypted using an AEAD
  algorithm (e.g. XChaCha20‑Poly1305 or AES‑GCM).
* The entire JSON blob is encrypted so the database only stores an opaque
  ciphertext.
* A random nonce is generated per event. The nonce is stored alongside
  the ciphertext. We can concatenate `nonce || ciphertext` and store it
  as a BLOB.
* Decryption uses the same PSK and nonce to recover the original JSON.

This approach allows us to evolve the event format without exposing
metadata in the clear. Later we can add more sophisticated key rotation
or per‑member access control, but a community‑wide PSK is sufficient for
initial experiments.
