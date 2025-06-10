# Hook Rest of App to Backend TODO

This document tracks the work needed to fully connect all UI elements to their respective backends. Items are ordered from easiest to hardest, with failing tests written for each.

## Status Legend
- ⬜ Not started
- 🔄 In progress
- ✅ Complete
- ❌ Blocked

---

## Phase 1: Easy Fixes (UI State → Backend State) ✅ COMPLETE

### ✅ 1. Device Enable/Disable Toggle
**Component**: `EventLogWithControls.tsx`
**Implemented**: Controls message generation via Simulation Control Server
**API**: `POST /api/devices/:deviceId/enabled` on port 3005
**Test**: `cypress/e2e/device-toggle-backend.cy.ts` ✅ PASSING

### ✅ 2. Message Generation Rate
**Component**: `EventLogWithControls.tsx`
**Implemented**: Global rate distributed across enabled devices
**API**: `POST /api/simulation/message-rate` on port 3005
**Test**: `cypress/e2e/message-rate-backend.cy.ts` ✅ PASSING

### ✅ 3. Image Attachment Percentage
**Component**: `EventLogWithControls.tsx`
**Implemented**: Controls attachment frequency for auto-generated messages
**API**: `POST /api/simulation/attachment-rate` on port 3005
**Test**: `cypress/e2e/attachment-rate-backend.cy.ts` ✅ PASSING

---

## Phase 2: Medium Complexity (Missing Endpoints)

### 🔄 4. File Upload System
**Component**: `ChatInterface.tsx`
**Current**: UI prepared but no backend
**Target**: Full file upload/download flow
**APIs Needed**:
  - `POST /api/files/upload`
  - `GET /api/files/:id`
  - `GET /api/files/:id/chunks/:chunkId`
**Test**: `cypress/e2e/file-upload-backend.cy.ts` ✅ (test written)

### 🔄 5. Event Timeline Real-time Stream
**Component**: `EventLogWithControls.tsx`
**Current**: Polling messages only
**Target**: Real-time event stream from all devices
**API**: `GET /api/events/stream` (WebSocket or SSE)
**Test**: `cypress/e2e/event-stream-backend.cy.ts` ✅ (test written)

### 🔄 6. Global Stats Dashboard
**Component**: `App.tsx`
**Current**: Per-device stats only
**Target**: Aggregated system-wide statistics
**API**: `GET /api/stats/global`
**Test**: `cypress/e2e/global-stats-backend.cy.ts` ✅ (test written)

---

## Phase 3: Complex (New Backend Services)

### ⬜ 7. Simulation Orchestrator
**Components**: `SimulationControls.tsx`, `EventLogWithControls.tsx`
**Current**: Decorative controls
**Target**: Full simulation control
**New Service**: Simulation Orchestrator (port 3005)
**APIs Needed**:
  - `POST /api/simulation/start`
  - `POST /api/simulation/pause`
  - `POST /api/simulation/speed`
  - `GET /api/simulation/status`
  - `GET /api/simulation/upcoming-events`
**Test**: `cypress/e2e/simulation-control-backend.cy.ts`

### ⬜ 8. Cross-Device Event Coordination
**Component**: `EventLogWithControls.tsx`
**Current**: Each device isolated
**Target**: Unified event timeline
**API**: `GET /api/events/all` (aggregated from all devices)
**Test**: `cypress/e2e/unified-timeline-backend.cy.ts`

### ⬜ 9. WebSocket Conversion
**Components**: All polling components
**Current**: HTTP polling
**Target**: WebSocket connections
**Changes**:
  - Message updates via WebSocket
  - Network events via WebSocket
  - Stats updates via WebSocket
**Test**: `cypress/e2e/websocket-updates.cy.ts`

---

## Phase 4: Cleanup

### ⬜ 10. Remove Frontend-Only Code
**Files**: See `frontend-only-code-removal.md`
**Current**: Mixed frontend/backend code
**Target**: Clean backend-only architecture
**Test**: `cypress/e2e/no-local-simulation.cy.ts`

### ⬜ 11. Error Handling & Reconnection
**Components**: All backend connections
**Current**: Basic error logging
**Target**: Graceful degradation and auto-reconnect
**Test**: `cypress/e2e/backend-resilience.cy.ts`

### ⬜ 12. Performance Optimization
**Components**: All polling mechanisms
**Current**: Aggressive polling intervals
**Target**: Smart polling with backoff
**Test**: `cypress/e2e/polling-efficiency.cy.ts`

---

## Implementation Order

1. Start with Phase 1 (easiest) - UI controls that just need API endpoints
2. Move to Phase 2 - Features with prepared UI but missing backends
3. Tackle Phase 3 - Complex features requiring new services
4. Finish with Phase 4 - Cleanup and optimization

## Next Steps

1. Create failing Cypress tests for Phase 1 items
2. Implement backend endpoints one by one
3. Update frontend to use new endpoints
4. Make tests pass
5. Move to next phase

---

## Progress Tracking

- **Total Items**: 12
- **Completed**: 3 (Phase 1 complete)
- **In Progress**: 3 (Phase 2 - tests written, implementation pending)
- **Not Started**: 6
- **Blocked**: 0

Phase 1: 3/3 ✅ COMPLETE
Phase 2: Tests written 3/3 ✅, Implementation 0/3 🔄
Phase 3: 0/3 ⬜
Phase 4: 0/3 ⬜

Last Updated: January 6, 2025