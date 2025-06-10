# Frontend-Only Code Removal Guide

> ⚠️ **IMPORTANT**: This list needs to be carefully reviewed before removing any code. Some components may still be needed for visualization, testing, or other purposes even with backend-first architecture.

## Overview
This document lists all code that was designed for "frontend-only mode" that *might* be removed now that we always have a backend. Each section should be reviewed to determine if the code is truly obsolete or if it serves another purpose.

## 1. Core Frontend-Only Systems

### Simulation System (`/app/src/simulation/`)
**Purpose**: Local message generation and timeline simulation
- `engine.ts` - SimulationEngine for local message generation
- `message-generator.ts` - Auto message generation
- `TimeAwareEngine.ts` - Time control wrapper

**Review Note**: The simulation engine might still be useful for:
- Timeline visualization
- Testing scenarios
- Demo purposes
- Understanding event flow

### Local Storage System (`/app/src/storage/`)
**Purpose**: SQLite database in the browser
- `device-db.ts` - SQLite database for frontend

**Review Note**: Consider if any local caching or offline functionality is needed.

### Frontend Network Simulation (`/app/src/network/`)
**Purpose**: Simulated network layer for testing
- `simulator.ts` - NetworkSimulator
- `NetworkInterface.ts`
- `SecureNetworkAdapter.ts`
- `SecureNetworkLayer.ts`

**Review Note**: Network simulation might be useful for:
- Testing network conditions
- Demonstrating network behavior
- Educational purposes

### Frontend Sync System (`/app/src/sync/`)
**Purpose**: Bloom filter-based synchronization
- `BloomFilter.ts`
- `EventScanQueue.ts`
- `SyncManager.ts`
- `SyncStrategy.interface.ts`
- `strategies/` subdirectory

**Review Note**: Some sync visualization or monitoring might still be valuable.

### Frontend Crypto System (`/app/src/crypto/`)
**Purpose**: Encryption and signing in the browser
- `EventCrypto.ts`
- `KeyManager.ts`
- `PacketSigner.ts`
- `SecureMessageLayer.ts`

**Review Note**: Might be needed for:
- Client-side encryption before sending to backend
- Signature verification
- Key management UI

### Frontend File Handling (`/app/src/files/`)
**Purpose**: File chunking and reassembly
- `FileChunkHandler.ts`
- `FileHandler.ts`
- `FileReassembly.ts`
- `FileReassemblyErasure.ts`
- `FileReassemblyErasureRonomon.ts`
- `FileReassemblyErasureXOR.ts`

**Review Note**: Consider if any client-side file processing is still needed.

### Frontend-Only APIs
- `/app/src/api/ChatAPI.ts` - Local chat API
- `/app/src/api/SimulationEngineAPI.ts` - Simulation API

**Review Note**: These APIs might have utility functions or interfaces still in use.

## 2. Code Sections to Update in Remaining Files

### App.tsx
**Remove/Update**:
- SimulationEngine import and state
- ChatAPI imports and state management
- All `engine.*` method calls
- simulationEngineAPI usage
- ChatAPI initialization in useEffect
- Fallback logic for when backend isn't available

**Review Note**: Some simulation features might be useful for the event timeline display.

### ChatInterface.tsx
**Remove/Update**:
- ChatAPI import and type references
- `chatAPI` prop from interface
- Conditional logic: `if (backendAdapter) {...} else if (chatAPI) {...}`
- Fallback to simulation engine path

**Review Note**: Ensure all message sending flows work correctly after removal.

### BackendAdapter.ts
**Remove/Update**:
- ChatAPI import and references
- Constructor parameter for chatAPI
- Fallback logic using chatAPI

**Review Note**: This is likely safe to remove as it's specifically for fallback.

## 3. Test Files

### Test Directories to Review
- `/app/src/tests/simulation/` - Simulation tests
- `/app/src/tests/network/` - Network tests
- `/app/src/tests/storage/` - Storage tests
- `/app/src/tests/sync/` - Sync tests
- `/app/src/tests/crypto/` - Crypto tests
- `/app/src/tests/files/` - File handling tests

**Review Note**: Some tests might be valuable for:
- Understanding expected behavior
- Testing backend integration
- Regression testing

## 4. Other Files to Review

### Debug Tools
- `/app/src/debug-database.ts` - Database debugging tool

**Review Note**: Might be useful for debugging backend issues.

### Public Assets
- `/app/public/sql-wasm.wasm` - SQLite WASM file

**Review Note**: Safe to remove if no SQLite usage remains.

## 5. Package Dependencies to Review

Consider removing from `package.json`:
- `sql.js` - SQLite in browser
- `tweetnacl` - Encryption library
- `bloom-filters` - Bloom filter implementation
- Other crypto/storage related dependencies

**Review Note**: Check if any remaining code uses these libraries.

## Recommendations

1. **Start with obvious removals**: APIs that are clearly superseded by backend equivalents
2. **Keep visualization code**: Components that help visualize the system behavior
3. **Preserve useful abstractions**: Interfaces and types that make the code cleaner
4. **Maintain test coverage**: Convert frontend-only tests to backend integration tests
5. **Document decisions**: Keep notes on why certain code was kept or removed

## Migration Strategy

1. **Phase 1**: Remove clear duplicates (ChatAPI fallbacks)
2. **Phase 2**: Evaluate simulation and visualization code
3. **Phase 3**: Clean up tests and dependencies
4. **Phase 4**: Final cleanup and documentation update

## Potential Keepers

Some components that might be worth keeping:
- Event timeline visualization
- Network activity visualization
- Simulation for demos/testing
- Type definitions and interfaces
- Utility functions

Remember: It's easier to remove code later than to recreate it. When in doubt, keep it and mark it as deprecated.