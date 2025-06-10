# Project Status

Last Updated: January 6, 2025

## Overview

This document provides the authoritative status of the sync-experiments project implementation. It consolidates information from multiple audit documents to provide a single source of truth.

## System Architecture

The project implements a **peer-to-peer event store** with local-first architecture:

- **Device Backends** (Alice: 3001, Bob: 3002) - Handle messages, crypto, and sync
- **Network Simulator** (WS: 3003, HTTP: 3004) - Simulates P2P network conditions
- **Simulation Service** (3005) - Separate service for auto-message generation
- **Frontend** (5173) - React UI for chat and simulation controls

## Implementation Status

### ✅ Core Messaging (100% Complete)
- **Send/receive messages** between devices
- **Real-time sync** via Bloom filters
- **Message persistence** in backend stores
- **Optimistic UI updates** with deduplication
- **Message ownership** display (blue/gray styling)

### ✅ Network Simulation (100% Complete)
- **Configurable packet loss** (0-50%)
- **Latency simulation** (10-500ms with jitter)
- **Network event visualization**
- **Real-time statistics**
- **WebSocket-based routing**

### ✅ Simulation Control (100% Complete - Phase 1)
- **Device enable/disable** - Controls auto-generation per device
- **Global message rate** - Distributes rate across enabled devices
- **Image attachment percentage** - Controls attachment frequency
- **Simulation Control Server** on port 3005
- **Integration with frontend controls**

### 🟡 User Interface (70% Complete)
- ✅ **Chat interfaces** with real messaging
- ✅ **Network visualization** with controls
- ✅ **Event timeline** showing executed messages
- ✅ **Device status panels** with sync indicators
- ✅ **Message reactions** (add/remove)
- ✅ **Simulation controls** connected to backend
- 🔴 **File attachments** - UI ready, backend missing
- 🔴 **Upcoming events** - No future event scheduling

### 🔴 File System (0% Complete)
- **UI prepared** with file picker and preview
- **No backend endpoints** for upload/download
- **No file chunking** implementation
- **No content-addressed storage**

### 🔴 Advanced Features (Not Started)
- **SQLite storage** (currently using InMemoryStore)
- **Event timeline streaming** (using polling)
- **WebSocket updates** (using HTTP polling)
- **Global statistics dashboard**
- **Cross-device event coordination**

## Backend Services

| Service | Port | Status | Purpose |
|---------|------|--------|---------|
| Alice Backend | 3001 | ✅ Running | Device backend for Alice |
| Bob Backend | 3002 | ✅ Running | Device backend for Bob |
| Network Simulator | 3003/3004 | ✅ Running | P2P network simulation |
| Simulation Service | 3005 | ✅ Running | Auto-message generation (separate service) |

## API Endpoints

### Device Backends (3001/3002)
- ✅ `GET /api/health` - Health check
- ✅ `GET /api/messages` - Retrieve messages
- ✅ `POST /api/messages` - Send message
- ✅ `DELETE /api/messages/clear` - Clear database
- ✅ `POST /api/messages/:id/reactions` - Add reaction
- ✅ `DELETE /api/messages/:id/reactions` - Remove reaction
- ✅ `GET /api/stats` - Sync statistics
- ✅ `POST /api/device-status` - Set online/offline
- 🔴 `POST /api/files/upload` - Not implemented
- 🔴 `GET /api/files/:id` - Not implemented

### Simulation Service (3005)
- ✅ `GET /api/health` - Health check
- ✅ `GET /api/simulation/config` - Get configuration
- ✅ `GET /api/simulation/status` - Get status with device rates
- ✅ `POST /api/devices/:deviceId/enabled` - Enable/disable device
- ✅ `GET /api/devices/:deviceId/status` - Get device status
- ✅ `POST /api/simulation/message-rate` - Set global rate
- ✅ `POST /api/simulation/attachment-rate` - Set attachment %
- ✅ `POST /api/simulation/start` - Start simulation
- ✅ `POST /api/simulation/pause` - Pause simulation
- ✅ `POST /api/simulation/speed` - Set simulation speed

## Development Roadmap

### Phase 1: Core Functionality ✅ COMPLETE
- [x] Basic messaging between devices
- [x] Bloom filter sync
- [x] Network simulation
- [x] Simulation control backend
- [x] Frontend control integration

### Phase 2: File Support 🔄 IN PROGRESS
- [ ] File upload/download endpoints
- [ ] File chunking system
- [ ] Content-addressed storage
- [ ] File reassembly

### Phase 3: Real-time Features
- [ ] WebSocket connections for updates
- [ ] Event timeline streaming
- [ ] Cross-device event coordination
- [ ] Global statistics dashboard

### Phase 4: Production Features
- [ ] SQLite storage migration
- [ ] Encryption improvements
- [ ] Performance optimization
- [ ] Error recovery

## Known Issues

1. **Message syncing occasionally breaks** - Under investigation
2. **No error display in UI** - Errors logged to console only
3. **High polling frequency** - 100ms for network events
4. **No file transfer** - UI exists but backend missing

## Testing Status

### Cypress E2E Tests
- ✅ Device toggle backend integration
- ✅ Message rate backend integration  
- ✅ Attachment rate backend integration
- ✅ Basic message flow
- ✅ Network simulation
- 🔴 File upload/download
- 🔴 Real-time streaming

### Unit Tests
- ✅ Bloom filter implementation
- ✅ Sync manager
- ✅ Message generator
- ✅ Network simulator
- 🔴 File handlers

## Quick Start

```bash
# Start all backend services
cd backend
./start-all-backends.sh

# In another terminal, start frontend
cd app
npm run dev

# Run tests
npm test              # Unit tests
npm run cypress:open  # E2E tests
```

## Notes

- All encryption happens in backends, never in browsers
- Messages are content-addressed (ID = hash of encrypted content)
- System designed for eventual consistency
- Frontend uses optimistic updates for responsiveness