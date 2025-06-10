# File Reassembly Erasure Coding Tests

This directory contains comprehensive tests for the XOR-based erasure coding implementation for file chunking and reassembly.

## Test Files

### FileReassemblyErasureXOR.test.ts
Unit tests for the XOR erasure coding implementation covering:
- Basic functionality with and without erasure coding
- Parity chunk generation with 2x multiplier
- File reassembly with all chunks present
- Recovery from missing chunks using parity
- SQL query generation
- Large file handling (1MB)

### FileReassemblyErasureXOR.integration.test.ts
Comprehensive integration tests with real database operations:

#### Small Files (< 1MB)
- 100KB file with no packet loss
- 100KB file with 3% random packet loss

#### Medium Files (1MB - 10MB)  
- 1MB file with controlled packet loss pattern
- 2MB file with systematic packet loss
- 5MB file with mixed loss patterns

#### Large Files (10MB - 100MB)
- 10MB file with 1% packet loss
- 20MB file stress test with no packet loss

#### Edge Cases
- Graceful failure when too many chunks missing
- Recovery when exactly one chunk per parity group missing
- Files not multiples of chunk size
- Database query validation

#### Performance Benchmarks
- Tracks chunking, database, and reassembly times
- Tests with 100KB, 1MB, and 5MB files

## Key Features Tested

1. **XOR Parity Generation**: Creates 1 parity chunk for every 2 data chunks
2. **Streaming-Friendly**: Processes chunks without loading entire file in memory
3. **Database Integration**: Stores and retrieves chunk events from SQLite
4. **Packet Loss Recovery**: Recovers from various realistic loss patterns
5. **Performance**: Optimized for large files with minimal logging

## Running Tests

```bash
# Run all erasure coding tests
npm test -- --run src/tests/files/FileReassemblyErasure

# Run specific test suites
npm test -- --run src/tests/files/FileReassemblyErasureXOR.integration.test.ts -t "Small Files"

# Run individual tests
npm test -- --run src/tests/files/FileReassemblyErasureXOR.integration.test.ts -t "should handle 100KB file"
```

## Implementation Notes

The XOR-based approach was chosen over Reed-Solomon due to:
- Memory efficiency - no WASM overhead
- Streaming capability - chunks processed independently  
- Database integration - chunks written directly to storage
- Simplicity - pure JavaScript implementation
- Performance - faster for our 2x redundancy requirements

While XOR has limitations (can only recover 1 missing chunk per parity group), it's sufficient for our UDP-based file transfer with moderate packet loss rates.