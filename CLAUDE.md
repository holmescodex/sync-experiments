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

**IMPORTANT: This application runs in backend mode only.** There is no standalone frontend simulation mode. The frontend requires backend servers running on ports 3001 (Alice) and 3002 (Bob).

The project uses a backend-first architecture where all cryptographic operations and data storage happen in backend services.

### Current Implementation
- **Backend Services**: Device backends (Alice/Bob) handle messages, crypto, and sync
- **Direct P2P Communication**: Backends communicate via UDP (ports 8001/8002)
- **Message Sync**: Bloom filter-based sync achieves eventual consistency
- **Chat Interfaces**: Realistic messaging UIs connected to backends via REST APIs
- **Simulation Control**: Backend service (port 3005) manages automatic message generation
- **Message Reactions**: Add/remove emoji reactions with backend persistence
- **Responsive UI**: Clean, professional interface with mobile-friendly design

### Not Yet Implemented
- **File Attachments**: UI exists but backend endpoints are missing
- **SQLite Storage**: Currently using in-memory stores
- **WebSocket Updates**: Using HTTP polling for real-time updates

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
2. ✅ Backend message handling with encryption and sync
3. ✅ Simulation control backend for auto-generation
4. 🔄 File upload/download system (UI ready, backend missing)
5. ⏳ WebSocket connections for real-time updates
6. ⏳ SQLite storage migration
7. ⏳ N-peer convergence beyond 2 devices

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

## Image Compression Implementation

The project includes a **Sharp-based image compression module** for JPEG optimization:

### Technical Details
- **Library**: Sharp (Node.js/backend only, not browser-compatible)
- **Target Size**: 100KB-200KB range for compressed images
- **Skip Threshold**: Files under 200KB are left unchanged
- **Quality Algorithm**: Iterative quality reduction (5-95 range) to hit target size
- **Performance**: ~400ms per compression for 2.3MB images
- **Location**: `src/utils/ImageCompressor.ts`

### Key Features
- **Smart Quality Selection**: Initial quality based on original file size
- **Iterative Compression**: Up to 5 attempts to reach target size range
- **Error Handling**: Graceful fallback to original file on compression failure
- **Type Safety**: Full TypeScript interfaces and error handling
- **Test Coverage**: 19 passing tests including real 2.3MB image compression

### Integration Points
- **Backend Processing**: Compression happens server-side, not in browser
- **File Attachments**: Automatic compression when users attach JPEG images
- **Chat Interface**: Shows compression status and file size reduction
- **Future**: Will integrate with file chunking and P2P transfer system

**Note**: Sharp is Node.js-only and cannot run in browsers. All image compression should happen in the backend/server environment.

## Manual File Sending Implementation

The project includes a **complete manual file attachment system** with chunking, encryption, and P2P distribution:

### File Sending Architecture
1. **UI Layer**: File selection via attachment button in chat interfaces
2. **Processing Layer**: File chunking and encryption via FileHandler/FileChunkHandler  
3. **Storage Layer**: File chunks stored as encrypted events in SQLite database
4. **Network Layer**: P2P distribution of file chunks via network simulator
5. **Reassembly Layer**: Automatic file reconstruction when all chunks received

### Technical Implementation

#### File Processing Pipeline
- **Chunk Size**: 500 bytes per chunk for efficient network transmission
- **Encryption**: AEAD encryption with per-chunk keys and PRF tags
- **File IDs**: Content-addressed using hash of file contents
- **PRF Tags**: Pseudorandom function tags for chunk identification in Bloom filters

#### Key Components
- **FileHandler** (`src/files/FileHandler.ts`): Core chunking and encryption
- **FileChunkHandler** (`src/files/FileChunkHandler.ts`): Upload/download management
- **ChatAPI** (`src/api/ChatAPI.ts`): File attachment integration with messaging
- **ChatInterface** (`src/components/ChatInterface.tsx`): File selection UI

#### File Upload Flow
1. User selects files via 📎 attachment button
2. Files appear in preview with size and removal options
3. On send, ChatAPI converts File objects to Uint8Array
4. FileChunkHandler chunks files into 500-byte encrypted pieces
5. Each chunk stored as `file_chunk` event in database
6. File metadata included in message as attachment
7. Chunks broadcast to network for P2P distribution

#### File Reception Flow
1. Receiving device gets message with file attachment metadata
2. FileChunkHandler tracks required PRF tags for the file
3. Incoming `file_chunk` events matched against required tags
4. When all chunks received, file automatically reassembled
5. Assembled file available for download/display

### File Attachment UI Features
- **Multiple File Selection**: Support for selecting multiple files simultaneously
- **File Preview**: Shows selected files with names, sizes, and remove buttons
- **File Type Detection**: Image files get special preview treatment
- **Progress Indication**: Loading states during file processing
- **Error Handling**: Graceful failure handling with user feedback

### Integration with Existing Systems
- **Message Events**: File attachments embedded in message event payloads
- **Sync Protocol**: File chunks participate in Bloom filter sync discovery
- **Database Events**: All file data stored as standard encrypted events
- **Network Simulator**: File chunks transmitted via existing UDP simulation

### Performance Characteristics
- **Chunking Speed**: ~600ms for 1MB files
- **Storage Efficiency**: Each chunk is separate database event for sync granularity
- **Network Efficiency**: 500-byte chunks optimal for UDP packet sizes
- **Memory Usage**: Streaming processing avoids loading entire files in memory

### Future Enhancements
- **Erasure Coding**: Redundant chunks for reliability (infrastructure exists)
- **Compression Integration**: Automatic JPEG compression before chunking
- **Progress Tracking**: Real-time download progress in chat interface
- **Timeline Integration**: Automatic file attachments in simulation timeline