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

The project is in Phase 1 implementation with a React-based simulation environment featuring:

### Current Implementation (Phase 1)
- **Simulation Engine**: Automatic event generation with configurable device frequencies
- **Event Timeline**: Real-time visualization of message generation and execution
- **Chat Interfaces**: Realistic messaging app simulations for Alice and Bob devices
- **Manual Messaging**: Interactive message sending through chat interfaces
- **Responsive UI**: Clean, professional interface with mobile-friendly design

### UI Architecture
The simulation interface consists of:

1. **Event Timeline & Generation (Left Panel)**:
   - Unified event log showing messages from both devices
   - Device frequency controls for automatic message generation
   - Real-time timeline with executed (green) and upcoming (yellow) events
   - Clear section descriptions explaining functionality

2. **Simulation Controls & Chat (Right Panel)**:
   - Simulation speed and timing controls
   - Realistic chat interfaces with message bubbles, avatars, and timestamps
   - Manual message input with proper chat UI patterns
   - Auto-generated messages appear with "auto" badges

### Key Design Decisions

- **Local-first**: No central server dependency
- **Privacy-first**: All event payloads encrypted before storage
- **Simulation-driven**: Build simulation environment before production code
- **Direct SQL access**: Apps can query SQLite directly for flexibility
- **Clean UI**: Professional, immediately understandable interface design

## Development Workflow

### UI Development & Documentation

The project uses **Cypress for automated screenshot capture** to document UI development progress:

**Setup:**
- `cypress.config.cjs`: Configuration for screenshot automation
- `cypress/support/commands.ts`: Custom commands for UI testing
- `cypress/e2e/`: Screenshot test files organized by feature/milestone

**Key Commands:**
```bash
npm run cypress:screenshots              # Capture all UI screenshots
npm run cypress:run -- --spec 'file.cy.ts'  # Specific screenshot test
npm run cypress:open                     # Interactive development
```

**Screenshot Organization:**
- `cypress/screenshots/`: Generated screenshots by test file
- Naming: `feature-state-device.png` (e.g., `clean-layout-with-chat-messages.png`)
- Coverage: Initial states, interactions, responsive breakpoints, detailed sections

See `docs/screenshot-workflow.md` for complete documentation of the screenshot process.

### Testing
- **Vitest**: Unit and integration tests
- **Cypress**: UI testing and screenshot automation
- **Test Coverage**: Simulation engine, message generation, storage, UI components

**Commands:**
```bash
npm test                    # Run all unit tests
npm run cypress:screenshots # UI documentation
```

### Development Milestones
1. ✅ Two-device message simulation with realistic chat interfaces
2. 🔄 UDP gossip protocol (next)
3. ⏳ N-peer convergence
4. ⏳ Frontend API (sendMessage, getMessages, searchMessages)
5. ⏳ File transfer support

## Important Instructions

### Code Style & Practices
- **No comments unless explicitly requested**
- Follow existing patterns and conventions in the codebase
- Use TypeScript throughout
- Maintain responsive design principles
- Prefer editing existing files over creating new ones

### UI Development Guidelines
- **Clean, professional design**: Avoid clutter, use clear section descriptions
- **Realistic interfaces**: Chat UIs should look like actual messaging apps
- **Responsive**: Test at multiple breakpoints (desktop, tablet, mobile)
- **Accessible**: Proper contrast, clear labeling, keyboard navigation
- **Performance**: Efficient rendering, minimal re-renders

### Testing Requirements
- Always run `npm test` after changes to verify functionality
- Use Cypress screenshots to document UI changes
- Test responsive behavior across viewport sizes
- Verify manual and automatic message functionality

### Project-Specific Commands
```bash
# Development
npm run dev                 # Start development server
npm test                    # Run unit tests
npm run lint               # Check code style

# UI Documentation  
npm run cypress:screenshots # Capture UI state screenshots
npm run cypress:open       # Interactive UI testing

# Build
npm run build              # Production build
```

The codebase emphasizes clean, maintainable code with comprehensive testing and visual documentation of the user interface development process.