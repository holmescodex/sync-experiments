# SyncManager Architecture

## Overview

The SyncManager implements a distributed peer-to-peer synchronization system where each device backend maintains its own isolated instance. Communication between devices happens through a centralized NetworkSimulatorService that simulates realistic network conditions.

## Architecture Diagram

```
┌─────────────────────────┐         ┌─────────────────────────┐
│   Alice Backend (5001)  │         │   Bob Backend (5002)    │
├─────────────────────────┤         ├─────────────────────────┤
│  SyncManager            │         │  SyncManager            │
│  - Bloom filters        │         │  - Bloom filters        │
│  - Message handling     │         │  - Message handling     │
│  - Periodic sync        │         │  - Periodic sync        │
├─────────────────────────┤         ├─────────────────────────┤
│  RemoteNetworkSimulator │         │  RemoteNetworkSimulator │
│  - WebSocket client     │         │  - WebSocket client     │
│  - Event callbacks      │         │  - Event callbacks      │
└──────────┬──────────────┘         └──────────┬──────────────┘
           │                                     │
           │ WebSocket (5003)                    │ WebSocket (5003)
           │                                     │
           └──────────────┬──────────────────────┘
                          │
            ┌─────────────▼──────────────────┐
            │ NetworkSimulatorService (5003) │
            ├────────────────────────────────┤
            │ - Device registry              │
            │ - Network simulation           │
            │ - Message routing              │
            │ - Packet loss/latency          │
            └────────────────────────────────┘
```

## Component Responsibilities

### SyncManager (per device)
- Maintains device-specific Bloom filter of known events
- Broadcasts new messages to the network
- Handles incoming messages from other devices
- Performs periodic sync by exchanging Bloom filters
- Stores received messages in local database

### RemoteNetworkSimulator (per device)
- Establishes WebSocket connection to NetworkSimulatorService
- Sends broadcast/unicast messages
- Receives network events and forwards to SyncManager
- Handles reconnection on disconnect

### NetworkSimulatorService (singleton)
- Maintains WebSocket connections from all devices
- Simulates network conditions (latency, packet loss, jitter)
- Routes messages between devices
- Tracks network statistics
- Provides HTTP API for monitoring

## Message Flow

### 1. Sending a Message
```
User Input → API POST /messages
    ↓
MessageGenerator.createMessage() → Encrypted Event
    ↓
InMemoryStore.storeEvent() → Local Storage
    ↓
SyncManager.broadcastNewMessage()
    ↓
RemoteNetworkSimulator.broadcastEvent()
    ↓
WebSocket → NetworkSimulatorService
```

### 2. Network Processing
```
NetworkSimulatorService receives broadcast
    ↓
NetworkSimulator.broadcastEvent() → Creates events for each peer
    ↓
Simulates network delay (minLatency + jitter)
    ↓
Random packet loss check
    ↓
NetworkSimulator.tick() → Processes pending deliveries
    ↓
Forwards to target device(s) via WebSocket
```

### 3. Receiving a Message
```
RemoteNetworkSimulator receives WebSocket message
    ↓
Triggers registered callbacks
    ↓
SyncManager.handleNetworkEvent()
    ↓
SyncManager.handleIncomingMessage()
    ↓
MessageGenerator.decryptMessage() → Verify authenticity
    ↓
InMemoryStore.storeEvent() → Local Storage
    ↓
Updates Bloom filter
```

## Sync Protocol

### Bloom Filter Exchange
Every 5 seconds, each online device:
1. Updates its Bloom filter with all known event IDs
2. Broadcasts the filter to all peers
3. Receives filters from peers
4. Compares filters to find missing events
5. Sends missing events directly to peers who need them

### Message Broadcasting
When a new message is created:
1. Store locally with unique event ID
2. Add to Bloom filter
3. Broadcast encrypted message to all peers
4. Network simulator handles delivery

## Key Design Decisions

1. **Isolation**: Each backend is completely isolated - no shared state
2. **Eventually Consistent**: Devices sync when online, tolerate network issues
3. **Efficient Sync**: Bloom filters minimize bandwidth for sync detection
4. **Realistic Simulation**: Network conditions mirror real P2P challenges
5. **Encrypted Transport**: All messages encrypted before network transmission

## Debugging Message Flow

To trace a message from Alice to Bob:

1. Check Alice's backend logs for:
   - `[Messages] Broadcasting message <id> through sync`
   - `[SyncManager] alice broadcasting new message <id>`

2. Check NetworkSimulatorService logs for:
   - `[NetworkSimulatorService] Broadcasting message from alice to N devices`
   - Network events showing packet delivery status

3. Check Bob's backend logs for:
   - `[RemoteNetworkSimulator] bob connected`
   - `[SyncManager] bob received message from alice`
   - `[SyncManager] bob stored event <id> from alice`

4. Verify via API:
   - `GET http://localhost:5001/api/messages` - Alice's messages
   - `GET http://localhost:5002/api/messages` - Bob's messages
   - `GET http://localhost:5004/api/stats` - Network statistics

## Common Issues

1. **WebSocket Not Connected**: RemoteNetworkSimulator drops messages if WebSocket isn't open
2. **Device Offline**: SyncManager ignores events when device is offline
3. **Packet Loss**: Network simulator may drop packets based on configuration
4. **Timing**: Messages take time to propagate due to simulated latency