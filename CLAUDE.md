# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an experimental peer-to-peer event store implementing a local-first architecture. The system enables devices to sync messages and files without a central server, using SQLite databases and Bloom filter-based synchronization over UDP.

## Architecture

### Core Concepts
- **Event Sourcing**: All data is represented as immutable events (messages, files, invites)
- **SQLite Storage**: Each device maintains its own SQLite database with encrypted events
- **P2P Sync**: Devices use Bloom filters to discover and exchange missing events
- **Encryption**: Pre-shared keys (PSK) with AEAD encryption for privacy

### Event Structure
Events are JSON objects with:
- `type`: Event type (e.g., `message`, `file_chunk`, `invite`)
- `ts`: Timestamp
- `author`: Device/user ID
- Type-specific fields

Event IDs are content-addressed: `hash(event_bytes)`

### Database Schema
Core table stores encrypted events:
```sql
CREATE TABLE events (
  event_id     TEXT PRIMARY KEY,
  account_id   TEXT,
  received_ts  INTEGER,
  encrypted    BLOB
);
```

Materialized views provide decrypted access for:
- Authorization graph (`auth_graph`)
- Message search (`message_index`) 
- File storage (`file_chunks`)

### Sync Protocol
1. Devices maintain rolling Bloom filters of known event IDs
2. Periodic UDP exchange of filters between peers
3. Detection and transmission of missing events
4. Tolerant of packet loss and network unreliability

## Development Status

The project is in the planning phase. Key design documents:
- `docs/design.md`: Technical architecture and protocol details
- `docs/plan-of-attack.md`: Development roadmap and simulation plans

## Planned Implementation

### Simulation Environment
- React dashboard with hot reload for visualization
- Controls for event generation and network conditions
- Real-time sync progress monitoring
- Performance testing capabilities

### Development Milestones
1. Two-peer Bloom sync implementation
2. UDP gossip protocol
3. N-peer convergence
4. Frontend API (sendMessage, getMessages, searchMessages)
5. File transfer support

## Key Design Decisions

- **Local-first**: No central server dependency
- **Privacy-first**: All event payloads encrypted before storage
- **Simulation-driven**: Build simulation environment before production code
- **Direct SQL access**: Apps can query SQLite directly for flexibility