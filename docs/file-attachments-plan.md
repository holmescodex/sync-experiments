# 📎 File Attachments Implementation Plan

## Overview

Files in our P2P system are handled through:
1. **Encryption** with unique symmetric keys
2. **Chunking** into fixed-size pieces (500 bytes)
3. **PRF-tagging** for privacy-preserving addressing
4. **Event-based control** via the existing event system

## Core Concepts

### File Structure
- Each file gets a unique **file_key** (256-bit symmetric key)
- File is split into **500-byte chunks**
- Each chunk is encrypted independently
- Each chunk is addressed by a **PRF tag**: `prf_tag_i = PRF(file_key, chunk_index)`
- **file_id** = SHA-256 hash of all plaintext chunks concatenated

### Controlling Event
The message event that references a file contains:
- `file_id`: Stable identifier (hash of plaintext)
- `file_key`: Symmetric encryption key
- `chunk_count`: Number of chunks
- `chunk_size`: Size of each chunk (500 bytes)
- `mime_type`: File type

## Database Schema

```sql
-- File metadata and keys
CREATE TABLE file_keys (
  event_id     TEXT PRIMARY KEY,   -- ID of the controlling event
  file_id      TEXT,               -- SHA-256 of plaintext chunks
  file_key     BLOB,               -- Symmetric encryption key
  chunk_count  INTEGER,            -- Number of chunks
  chunk_size   INTEGER,            -- Bytes per chunk (500)
  mime_type    TEXT,               -- e.g., 'image/jpeg'
  local_path   TEXT,               -- Where assembled file is stored
  is_deleted   BOOLEAN DEFAULT 0   -- For cryptographic shredding
);

-- Encrypted file chunks
CREATE TABLE file_chunks (
  prf_tag      TEXT PRIMARY KEY,   -- PRF(file_key, chunk_index)
  file_id      TEXT,               -- Links to file_keys
  chunk_index  INTEGER,            -- Sequential index
  payload      BLOB,               -- Encrypted chunk data
  received_ts  INTEGER             -- When we got this chunk
);

CREATE INDEX idx_file_chunks ON file_chunks(file_id, chunk_index);
```

## Implementation Flow

### Upload (Sending a File)

1. **Read and chunk the file**
   ```typescript
   const chunks = splitIntoChunks(fileData, 500); // 500-byte chunks
   ```

2. **Generate cryptographic identifiers**
   ```typescript
   const file_key = generateRandomKey(256); // 32 bytes
   const file_id = sha256(concatenate(chunks));
   ```

3. **Encrypt chunks and compute PRF tags**
   ```typescript
   for (let i = 0; i < chunks.length; i++) {
     const prf_tag = PRF(file_key, i); // HMAC-SHA256(file_key, i)
     const encrypted = encrypt(file_key, chunks[i], i); // AEAD with nonce
     storeChunk(prf_tag, file_id, i, encrypted);
   }
   ```

4. **Create controlling event**
   ```typescript
   const messageEvent = {
     type: 'message',
     content: 'Check out this image!',
     attachments: [{
       file_id,
       file_key,
       chunk_count: chunks.length,
       chunk_size: 500,
       mime_type: 'image/jpeg'
     }]
   };
   ```

### Download (Receiving a File)

1. **Receive controlling event via sync**
   - Decrypt the event from the database
   - Extract file metadata and key
   - Store in `file_keys` table

2. **Compute needed PRF tags**
   ```typescript
   const needed_tags = [];
   for (let i = 0; i < chunk_count; i++) {
     needed_tags.push(PRF(file_key, i));
   }
   ```

3. **Request chunks from peers**
   - Include PRF tags in Bloom filter
   - Peers match tags against their `file_chunks` table
   - No metadata revealed without the controlling event

4. **Assemble file when chunks arrive**
   ```typescript
   // Decrypt each chunk
   const plaintext = decrypt(file_key, encrypted_chunk, chunk_index);
   
   // When all chunks received, verify and save
   if (sha256(allChunks) === file_id) {
     saveToLocalPath(assembled_file);
   }
   ```

## Privacy & Security Features

### PRF Tag Privacy
- Peers see only opaque PRF tags, not file names or indices
- Without the controlling event, chunks are meaningless
- PRF prevents correlation between chunks of the same file

### Cryptographic Deletion
When a controlling event is tombstoned:
- Set `is_deleted = 1` in `file_keys`
- File key is destroyed
- Chunks become permanently undecryptable
- Garbage collection can remove orphaned chunks

### Deduplication
- Same file shared multiple times uses same chunks
- Only one copy stored, referenced by multiple events
- Efficient for commonly shared files

## Integration with Current System

### Message Events
```typescript
interface MessageEvent {
  type: 'message';
  content: string;
  timestamp: number;
  author: string;
  attachments?: FileAttachment[];
}

interface FileAttachment {
  file_id: string;
  file_key: Uint8Array;
  chunk_count: number;
  chunk_size: number;
  mime_type: string;
}
```

### Sync Protocol
- File chunks are just another event type in the sync
- PRF tags included in Bloom filters
- Chunks transferred via same UDP mechanism
- Progress tracking via received chunks

## Benefits

1. **Privacy**: File names and content hidden from non-recipients
2. **Efficiency**: Small chunks work well with UDP
3. **Resilience**: Missing chunks can be re-requested
4. **Deduplication**: Identical files share storage
5. **Deletion**: Cryptographic shredding without touching chunks

## Implementation Plan - Phase 2.1

### Phase 2.1a: Standalone File Handler (Week 1) ✅ COMPLETED
**Goal**: Core file chunking/reassembly logic independent of the system

1. **FileHandler Class** ✅
   - Implemented in `/app/src/files/FileHandler.ts`
   - Full test suite in `/app/src/tests/files/FileHandler.test.ts`
   - All 16 tests passing
   
   Features implemented:
   - File chunking into 500-byte chunks
   - AEAD encryption simulation (XOR for demo)
   - PRF tag generation using HMAC-SHA256
   - File reassembly from chunks in any order
   - False positive PRF tag detection
   - File ID verification using SHA-256

2. **Chunk Storage as Events** 🔄 IN PROGRESS
   - FileChunkHandler implemented in `/app/src/files/FileChunkHandler.ts`
   - File chunks stored as regular events in the database
   - Event type: `'file_chunk'`
   - Event payload contains: `prfTag`, `encryptedData`
   - Binary chunk data appended after JSON metadata

3. **PRF Tag Handling** ✅
   - False positive detection implemented
   - Decryption verification with provided key
   - Chunk index verification from decrypted data
   - Invalid chunks automatically discarded

### Phase 2.1b: Event System Integration (Week 1-2) ✅ COMPLETED
**Goal**: Chunks as first-class events in the sync system

Current Status:
- ✅ FileChunkHandler class implemented
- ✅ ChatAPI updated to support file attachments
- ✅ File chunk events defined
- ✅ Chunks stored as regular events in database
- ✅ Bloom filter sync working for file chunks
- ✅ Integration tests passing

1. **Event Types**
   ```typescript
   interface FileChunkEvent {
     type: 'file_chunk'
     prfTag: string
     encryptedData: Uint8Array
     timestamp: number
   }
   
   interface MessageEvent {
     type: 'message'
     content: string
     attachments?: Array<{
       fileId: string        // CID
       fileKey: Uint8Array
       mimeType: string
       chunkCount: number
       fileName?: string
     }>
   }
   ```

2. **Database Indexing**
   ```sql
   -- Index for quick chunk lookup by PRF tag
   CREATE INDEX idx_chunk_prf ON events (
     json_extract(decrypted, '$.prfTag')
   ) WHERE json_extract(decrypted, '$.type') = 'file_chunk';
   
   -- Index for file assembly
   CREATE INDEX idx_message_files ON events (
     json_extract(decrypted, '$.attachments[0].fileId')
   ) WHERE json_extract(decrypted, '$.type') = 'message';
   ```

3. **Chunk Discovery via PRF Tags**
   - When receiving a message with file attachment
   - Compute all PRF tags for the file
   - Include PRF tags in Bloom filter requests
   - Retrieve matching events from peers

### Phase 2.1b: Integration (Week 2)
**Goal**: Connect file system to existing message flow

1. **Update Event System**
   - Extend `SimulationEvent` to include attachments
   - Modify message event structure in database
   - Update ChatAPI to handle file metadata

2. **Chunk Sync Protocol**
   - Add chunk events to NetworkSimulator
   - Include PRF tags in Bloom filters
   - Implement chunk request/response flow
   - Track chunk delivery status

3. **File Assembly**
   - Monitor incoming chunks
   - Reassemble files when all chunks received
   - Verify file_id matches assembled content
   - Store completed files locally

### Phase 2.1c: UI & Testing (Week 3)
**Goal**: User-facing features and reliability

1. **Upload UI**
   - File selection already exists - enhance it
   - Show chunking progress
   - Display chunk count and file size
   - Loading states during upload

2. **Download UI**
   - Progress bars for chunk reception
   - Thumbnail previews for images
   - Retry mechanism for missing chunks
   - Display assembled images in chat

3. **Testing**
   - Unit tests for chunking/encryption
   - Integration tests for full file flow
   - Cypress tests for UI interactions
   - Network failure scenarios

### Phase 2.1d: Optimization (Week 4)
**Goal**: Performance and reliability improvements

1. **Deduplication**
   - Detect identical files before chunking
   - Reference counting for shared chunks
   - Efficient chunk existence checks

2. **Performance**
   - Parallel chunk processing
   - Chunk prefetching based on patterns
   - Memory-efficient streaming for large files
   - Progress persistence across restarts

3. **Reliability**
   - Chunk retransmission logic
   - Partial file recovery
   - Corruption detection and handling
   - Timeout and retry strategies

### Simplifications for Initial Implementation

To get started quickly in the simulation:

1. **Use test images only** (no arbitrary file upload yet)
2. **Limit to small files** (<100KB) to keep chunk counts manageable
3. **In-memory chunk storage** during simulation (no actual file I/O)
4. **Simplified encryption** (can use simple XOR for demo)
5. **Skip deduplication** initially

### Success Metrics

- [ ] Can send an image from Alice to Bob
- [ ] Image appears after all chunks sync
- [ ] Progress indication during transfer
- [ ] Works with simulated packet loss
- [ ] Chunk status visible in network logs

### Future Enhancements (Phase 2.2+)

- Streaming for video/audio
- Chunk prioritization (preview first)
- Distributed chunk storage (DHT-style)
- Compression before chunking
- Resume interrupted transfers
- Cryptographic deletion implementation