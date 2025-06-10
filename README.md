# sync-experiments

This repository contains experiments for building a peer-to-peer event store implementing local-first architecture with SQLite databases (planned) and Bloom filter-based synchronization.

## Quick Start

```bash
# Single command: Start everything (orchestrator + backends + frontend)
cd app && npm run dev

# Visit the frontend URL shown in output (usually http://localhost:5173)
```

The `npm run dev` command will:
1. Start the backend orchestrator with automatic port allocation  
2. Initialize Alice and Bob backends with direct UDP communication
3. Start the frontend with correct backend URLs automatically
4. Handle graceful shutdown of all services

## Documentation

- **[STATUS.md](STATUS.md)** - Current implementation status and roadmap
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and design
- **[CLAUDE.md](CLAUDE.md)** - Instructions for Claude Code
- **[docs/hook-rest-of-app-to-backend-todo.md](docs/hook-rest-of-app-to-backend-todo.md)** - Backend integration progress

## Project Overview

This experimental system enables devices to sync messages and files without a central server using:

- **Event Sourcing** - All data as immutable events
- **P2P Sync** - Direct UDP communication between devices
- **Bloom Filters** - Efficient discovery of missing events
- **Encryption** - Pre-shared keys with AEAD encryption

## Current Status

Phase 1 implementation complete with:
- ✅ Two-device messaging with chat interfaces
- ✅ Bloom filter-based synchronization
- ✅ Network simulation with configurable conditions
- ✅ Simulation control backend for auto-generation
- 🔄 File transfer support (in progress)

See [STATUS.md](STATUS.md) for detailed implementation status.
