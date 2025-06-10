# Phase 1 API Design - Messages and Images

Based on Telegram-style block architecture, here's the Phase 1 API design that supports messages and images while preparing for future features.

## Important Architecture Note

**Each device runs its own Node-based 'backend' bound to 127.0.0.1. All clear-text originates and terminates on the same device; inter-device traffic is encrypted blobs only.**

This means:
- Alice's browser connects to Alice's Node backend on `localhost:3001`
- Bob's browser connects to Bob's Node backend on `localhost:3002`
- The backends handle all crypto operations locally
- Only encrypted events travel between devices over the network
- This preserves the local-first security model

## Core Concepts

### 1. Block Schema (Phase 1 subset)

```typescript
// Phase 1 implements message and file_chunk blocks
// event_id = BLAKE3(ciphertext) where ciphertext = nonce || AEAD-ciphertext
type Block =
  | { 
      type: 'message'
      channelId: string      // for now, just 'general' channel
      messageId: string      // unique message identifier
      author: string         // deviceId (alice, bob)
      ts: number            // HLC timestamp
      text: string
      attachments?: {
        fileId: string       // reference to file chunks
        fileName: string
        mimeType: string
        size: number
        totalChunks: number
      }[]
    }
  | {
      type: 'file_chunk'
      channelId: string
      fileId: string         // groups chunks together
      chunkNo: number        // 0-based chunk index
      totalChunks: number
      bytes: Uint8Array      // chunk data (pre-encryption)
    }

// Note: We'll add these block types in future phases:
// - reaction: { channelId, messageId, userId, emoji, add }
// - read_marker: { channelId, userId, uptoSeq, ts }
// - read_receipt: { channelId, messageId, userId, ts }
// - draft: { channelId, userId, text, ts }
// - setting: { userId, key, value, ts }
```

### 2. Database Schema

```sql
-- Single table for all event types (messages, file chunks, etc.)
-- Only ciphertext is stored; event_id is deterministic from ciphertext
CREATE TABLE events (
  arrival_seq  INTEGER PRIMARY KEY,    -- local monotonic counter
  event_id     TEXT    UNIQUE,         -- BLAKE3(ciphertext)
  channel_id   TEXT,                   -- extracted for indexing
  authored_ts  INTEGER,                -- extracted HLC timestamp
  ciphertext   BLOB,                   -- nonce || AEAD-ciphertext
  -- File-specific columns (NULL for non-file events)
  file_id      TEXT,                   -- groups chunks together
  chunk_no     INTEGER,                -- chunk sequence number
  prf_tag      TEXT                    -- PRF tag for verification
);

-- Indexes for efficient queries
CREATE INDEX idx_channel_arrival  ON events(channel_id, arrival_seq DESC);
CREATE INDEX idx_channel_authored ON events(channel_id, authored_ts DESC);
CREATE INDEX idx_event_id         ON events(event_id);
CREATE INDEX idx_file_chunks      ON events(file_id, chunk_no) WHERE file_id IS NOT NULL;
CREATE INDEX idx_prf_tag          ON events(prf_tag) WHERE prf_tag IS NOT NULL;
```

Key properties:
- `arrival_seq`: Increments for every event ingested (local or remote)
- `event_id`: Computed as BLAKE3(ciphertext), verifiable by any peer
- `channel_id` and `authored_ts`: Extracted once during insert for indexing
- File-specific columns (only for file_chunk events):
  - `file_id`: Groups all chunks of a file together
  - `chunk_no`: Sequential chunk number for ordering
  - `prf_tag`: PRF(fileKey, chunkNo) for cryptographic verification
- Efficient file queries:
  - Get all chunks: `WHERE file_id = ?`
  - Get specific chunk: `WHERE file_id = ? AND chunk_no = ?`
  - Verify chunk: Check PRF tag matches expected value
- No duplicate plaintext storage - decrypt on demand

### 3. Backend Architecture

```
backend/
├── src/
│   ├── crypto/
│   │   ├── EventEncryption.ts  // BLAKE3, AEAD operations
│   │   ├── Canonicalization.ts // TODO: CBOR deterministic encoding
│   │   └── Keys.ts             // PSK management (future: per-member keys)
│   ├── blocks/
│   │   ├── BlockStore.ts       // Single table event storage
│   │   ├── BlockTypes.ts       // Type definitions
│   │   └── EventCodec.ts       // Encode/decode blocks
│   ├── devices/
│   │   ├── Device.ts           // Device state and operations
│   │   ├── DeviceManager.ts    // Manages multiple devices
│   │   └── DeviceDB.ts         // SQLite connection per device
│   ├── api/
│   │   ├── messageRoutes.ts    // Message endpoints
│   │   ├── fileRoutes.ts       // File upload/download
│   │   └── syncRoutes.ts       // Sync status endpoints
│   ├── sync/
│   │   ├── SyncEngine.ts       // Orchestrates P2P sync
│   │   ├── BloomFilter.ts      // With rate limiting & timestamps
│   │   └── EventQueue.ts       // Manages sync events
│   └── index.ts                // Express server per device
```

### 4. API Endpoints

#### Messages API

```typescript
// Send a message with optional images
POST /api/channels/:channelId/messages
Headers: { 'X-Device-Id': 'alice' }
Body: {
  text: string
  attachments?: {
    imageId: string    // from prior upload
    mimeType: string
    size: number
    width?: number
    height?: number
  }[]
}
Response: {
  messageId: string
  blockId: string
  ts: number
  arrivalSeq: number
}

// Get messages (with cursor-based pagination)
GET /api/channels/:channelId/messages?limit=50&cursor=<arrivalSeq>
Headers: { 'X-Device-Id': 'alice' }
Response: {
  messages: Array<{
    messageId: string
    author: string
    text: string
    ts: number
    arrivalSeq: number
    attachments?: Array<{
      imageId: string
      mimeType: string
      size: number
      width?: number
      height?: number
      url: string      // Pre-signed URL for download
    }>
  }>
  nextCursor?: number
}

// Real-time message stream
WS /api/channels/:channelId/stream
Headers: { 'X-Device-Id': 'alice' }
Messages: {
  type: 'message'
  data: { messageId, author, text, ts, arrivalSeq, attachments? }
}
```

#### Files API

```typescript
// Upload file (automatically chunked)
POST /api/files/upload
Headers: { 
  'X-Device-Id': 'alice',
  'Content-Type': 'multipart/form-data'
}
Body: FormData with file
Response: {
  fileId: string
  fileName: string
  mimeType: string
  size: number
  totalChunks: number
  eventIds: string[]    // event_id for each chunk
}

// Get complete file (reassembled from chunks)
GET /api/files/:fileId
Headers: { 'X-Device-Id': 'alice' }
Response: Binary file data (decrypted and reassembled)

// Get file metadata
GET /api/files/:fileId/metadata
Headers: { 'X-Device-Id': 'alice' }
Response: {
  fileId: string
  fileName: string
  mimeType: string
  size: number
  totalChunks: number
  chunksReceived: number
  complete: boolean
}
```

#### Sync Status API

```typescript
// Get sync status for UI display
GET /api/sync/status
Headers: { 'X-Device-Id': 'alice' }
Response: {
  devices: {
    [deviceId: string]: {
      online: boolean
      lastSeen: number
      blocksKnown: number
      blocksBehind: number
      syncPercentage: number
    }
  }
  totalBlocks: number
  channels: {
    [channelId: string]: {
      messageCount: number
      lastMessageTs: number
    }
  }
}
```

### 5. Backend Implementation

#### Event Storage with BLAKE3 IDs

```typescript
// backend/src/devices/Device.ts
import { blake3 } from '@noble/hashes/blake3'

export class Device {
  private arrivalSeq = 0
  private lastTs = 0
  private db: DeviceDB
  
  async createMessageEvent(text: string, attachments?: FileAttachment[]): Promise<{ eventId: string, messageId: string }> {
    // Generate HLC timestamp
    const ts = Math.max(this.lastTs + 1, Date.now())
    this.lastTs = ts
    
    // Create message block
    const messageId = generateId()
    const block: MessageBlock = {
      type: 'message',
      channelId: 'general',
      messageId,
      author: this.deviceId,
      ts,
      text,
      attachments
    }
    
    // Encrypt block
    const { ciphertext, eventId } = await this.encryptBlock(block)
    
    // Store in events table
    await this.storeEvent(eventId, 'general', ts, ciphertext)
    
    return { eventId, messageId }
  }
  
  async createFileChunkEvents(file: Buffer, fileName: string, mimeType: string): Promise<{ fileId: string, eventIds: string[] }> {
    const fileId = generateId()
    // 500 bytes per chunk ensures it fits in UDP packet even after encryption:
    // 500 bytes payload + 12 byte nonce + 16 byte auth tag + event metadata < 1400 byte MTU
    const chunkSize = 500
    const totalChunks = Math.ceil(file.length / chunkSize)
    const eventIds: string[] = []
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, file.length)
      const chunkData = file.subarray(start, end)
      
      const block: FileChunkBlock = {
        type: 'file_chunk',
        channelId: 'general',
        fileId,
        chunkNo: i,
        totalChunks,
        bytes: chunkData
      }
      
      // Generate PRF tag for this chunk (stored outside encryption)
      const fileKey = await this.deriveFileKey(fileId)
      const prfTag = await this.computePRFTag(fileKey, i)
      
      const { ciphertext, eventId } = await this.encryptBlock(block)
      await this.storeFileChunkEvent(
        eventId, 'general', Date.now(), ciphertext,
        fileId, i, prfTag
      )
      eventIds.push(eventId)
    }
    
    return { fileId, eventIds }
  }
  
  private async encryptBlock(block: any): Promise<{ ciphertext: Uint8Array, eventId: string }> {
    // TODO: Use CBOR deterministic encoding when escaping PoC mode
    const plaintext = JSON.stringify(block)
    
    // Generate nonce and encrypt
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await this.aead.encrypt(plaintext, nonce, this.psk)
    
    // Ciphertext = nonce || encrypted
    const ciphertext = new Uint8Array(nonce.length + encrypted.length)
    ciphertext.set(nonce, 0)
    ciphertext.set(encrypted, nonce.length)
    
    // event_id = BLAKE3(ciphertext)
    const eventId = Buffer.from(blake3(ciphertext)).toString('hex')
    
    return { ciphertext, eventId }
  }
  
  private async storeEvent(eventId: string, channelId: string, authoredTs: number, ciphertext: Uint8Array) {
    this.arrivalSeq++
    
    await this.db.query(`
      INSERT INTO events (arrival_seq, event_id, channel_id, authored_ts, ciphertext, 
                         file_id, chunk_no, prf_tag)
      VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL)
    `, [this.arrivalSeq, eventId, channelId, authoredTs, ciphertext])
  }
  
  private async storeFileChunkEvent(
    eventId: string, 
    channelId: string, 
    authoredTs: number, 
    ciphertext: Uint8Array,
    fileId: string,
    chunkNo: number,
    prfTag: string
  ) {
    this.arrivalSeq++
    
    await this.db.query(`
      INSERT INTO events (arrival_seq, event_id, channel_id, authored_ts, ciphertext,
                         file_id, chunk_no, prf_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [this.arrivalSeq, eventId, channelId, authoredTs, ciphertext, fileId, chunkNo, prfTag])
  }
  
  async getMessages(channelId: string, limit: number, cursor?: number): Promise<Message[]> {
    // Query using arrivalSeq for stable pagination
    const rows = await this.db.query(`
      SELECT arrival_seq, event_id, authored_ts, ciphertext 
      FROM events 
      WHERE channel_id = ?
        ${cursor ? 'AND arrival_seq < ?' : ''}
      ORDER BY arrival_seq DESC
      LIMIT ?
    `, [channelId, ...(cursor ? [cursor] : []), limit])
    
    // Decrypt messages and resolve file attachments
    const messages: Message[] = []
    for (const row of rows) {
      const block = await this.decryptEvent(row.ciphertext)
      if (block.type === 'message') {
        messages.push({
          ...block,
          arrivalSeq: row.arrival_seq,
          eventId: row.event_id,
          attachments: await this.resolveFileAttachments(block.attachments)
        })
      }
    }
    
    return messages
  }
  
  // Efficiently find all chunks of a file
  async getFileChunks(fileId: string): Promise<FileChunk[]> {
    // Direct query using file_id index - much more efficient!
    const rows = await this.db.query(`
      SELECT event_id, chunk_no, prf_tag, ciphertext 
      FROM events 
      WHERE file_id = ?
      ORDER BY chunk_no ASC
    `, [fileId])
    
    if (rows.length === 0) return []
    
    // Verify PRF tags before decryption (security check)
    const fileKey = await this.deriveFileKey(fileId)
    const chunks: FileChunk[] = []
    
    for (const row of rows) {
      // Verify this chunk belongs to this file
      const expectedPrfTag = await this.computePRFTag(fileKey, row.chunk_no)
      if (row.prf_tag !== expectedPrfTag) {
        console.warn(`PRF tag mismatch for chunk ${row.chunk_no} of file ${fileId}`)
        continue
      }
      
      // Decrypt and add to results
      const block = await this.decryptEvent(row.ciphertext)
      if (block.type === 'file_chunk') {
        chunks.push(block)
      }
    }
    
    return chunks
  }
  
  // Get a specific chunk
  async getFileChunk(fileId: string, chunkNo: number): Promise<FileChunk | null> {
    const row = await this.db.queryOne(`
      SELECT event_id, prf_tag, ciphertext 
      FROM events 
      WHERE file_id = ? AND chunk_no = ?
    `, [fileId, chunkNo])
    
    if (!row) return null
    
    // Verify PRF tag
    const fileKey = await this.deriveFileKey(fileId)
    const expectedPrfTag = await this.computePRFTag(fileKey, chunkNo)
    if (row.prf_tag !== expectedPrfTag) {
      throw new Error('PRF tag verification failed')
    }
    
    const block = await this.decryptEvent(row.ciphertext)
    return block.type === 'file_chunk' ? block : null
  }
}
```

#### File Handling

```typescript
// backend/src/api/fileRoutes.ts
export async function uploadFile(req: Request, res: Response) {
  const deviceId = req.headers['x-device-id']
  const device = deviceManager.get(deviceId)
  const file = req.file
  
  // Create file chunk events
  const { fileId, eventIds } = await device.createFileChunkEvents(
    file.buffer,
    file.originalname,
    file.mimetype
  )
  
  // Store file metadata for quick access (not in events table)
  await device.storeFileMetadata({
    fileId,
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    totalChunks: eventIds.length,
    uploadedAt: Date.now()
  })
  
  res.json({
    fileId,
    fileName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    totalChunks: eventIds.length,
    eventIds
  })
}

export async function downloadFile(req: Request, res: Response) {
  const { fileId } = req.params
  const deviceId = req.headers['x-device-id']
  const device = deviceManager.get(deviceId)
  
  // Get file metadata
  const metadata = await device.getFileMetadata(fileId)
  if (!metadata) {
    return res.status(404).json({ error: 'File not found' })
  }
  
  // Retrieve and decrypt all chunks
  const chunks = await device.getFileChunks(fileId)
  
  // Verify we have all chunks
  if (chunks.length !== metadata.totalChunks) {
    return res.status(206).json({
      error: 'File incomplete',
      chunksReceived: chunks.length,
      totalChunks: metadata.totalChunks
    })
  }
  
  // Reassemble file
  const reassembled = Buffer.concat(
    chunks
      .sort((a, b) => a.chunkNo - b.chunkNo)
      .map(chunk => chunk.bytes)
  )
  
  res.setHeader('Content-Type', metadata.mimeType)
  res.setHeader('Content-Disposition', `attachment; filename="${metadata.fileName}"`)
  res.send(reassembled)
}
```

### 6. Frontend Integration

```typescript
// frontend/src/api/ChatAPI.ts
export class ChatAPI extends EventEmitter {
  private ws: WebSocket
  private deviceId: string
  
  constructor(deviceId: string, baseURL: string) {
    super()
    this.deviceId = deviceId
    this.baseURL = baseURL
    this.connectWebSocket()
  }
  
  // Send message with file attachments
  async sendMessage(channelId: string, text: string, files?: File[]): Promise<void> {
    // Upload files first
    const attachments = await Promise.all(
      (files || []).map(file => this.uploadFile(file))
    )
    
    // Send message with attachment references
    await fetch(`${this.baseURL}/api/channels/${channelId}/messages`, {
      method: 'POST',
      headers: {
        'X-Device-Id': this.deviceId,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ text, attachments })
    })
  }
  
  // Get messages with cursor
  async getMessages(channelId: string, options?: { limit?: number, cursor?: number }) {
    const params = new URLSearchParams({
      limit: String(options?.limit || 50),
      ...(options?.cursor && { cursor: String(options.cursor) })
    })
    
    const res = await fetch(
      `${this.baseURL}/api/channels/${channelId}/messages?${params}`,
      { headers: { 'X-Device-Id': this.deviceId } }
    )
    
    return res.json()
  }
  
  // Upload file
  private async uploadFile(file: File): Promise<FileAttachment> {
    const formData = new FormData()
    formData.append('file', file)
    
    const res = await fetch(`${this.baseURL}/api/files/upload`, {
      method: 'POST',
      headers: { 'X-Device-Id': this.deviceId },
      body: formData
    })
    
    const { fileId, fileName, mimeType, size, totalChunks } = await res.json()
    
    return {
      fileId,
      fileName,
      mimeType,
      size,
      totalChunks
    }
  }
  
  // WebSocket for real-time updates
  private connectWebSocket() {
    this.ws = new WebSocket(
      `${this.baseURL.replace('http', 'ws')}/api/channels/general/stream`
    )
    
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.type === 'message') {
        this.emit('message', 'general', data.data)
      }
    }
  }
}
```

### 7. React Components

```typescript
// frontend/src/components/ChatInterface.tsx
export function ChatInterface({ deviceId }: { deviceId: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [cursor, setCursor] = useState<number>()
  const api = useMemo(() => new ChatAPI(deviceId, 'http://localhost:3000'), [deviceId])
  
  // Load initial messages
  useEffect(() => {
    api.getMessages('general').then(({ messages, nextCursor }) => {
      setMessages(messages)
      setCursor(nextCursor)
    })
  }, [api])
  
  // Listen for new messages
  useEffect(() => {
    const handleMessage = (channel: string, message: Message) => {
      setMessages(prev => [message, ...prev])
    }
    
    api.on('message', handleMessage)
    return () => api.off('message', handleMessage)
  }, [api])
  
  // Send message with file attachments
  const handleSend = async (text: string, files?: File[]) => {
    await api.sendMessage('general', text, files)
  }
  
  return (
    <div className="chat-interface">
      <MessageList messages={messages} deviceId={deviceId} />
      <MessageInput onSend={handleSend} />
    </div>
  )
}
```

## Security Considerations & Future Work

### File Chunk Storage Design
We store both file metadata (file_id, chunk_no) AND PRF tags for different purposes:

**File metadata columns** (file_id, chunk_no):
- Enable efficient queries: `WHERE file_id = ?` uses index directly
- Support chunk ordering: `ORDER BY chunk_no`
- Allow missing chunk detection: Find gaps in sequence
- Required for reassembly logic

**PRF tags** provide security:
- **Verification**: Ensure chunks haven't been tampered with
- **Unlinkability**: PRF(fileKey, chunkNo) reveals nothing about content
- **Authentication**: Only someone with fileKey can generate valid tags
- **Defense in depth**: Even if metadata is wrong, PRF tag must match

This dual approach gives us both efficiency (indexed queries) and security (cryptographic verification).

Implementation:
```typescript
// PRF tag generation (using HMAC-SHA256 truncated)
async computePRFTag(fileKey: Uint8Array, chunkNo: number): Promise<string> {
  const data = new Uint8Array(4)
  new DataView(data.buffer).setUint32(0, chunkNo, false)
  const tag = await hmacSha256(fileKey, data)
  return tag.slice(0, 16) // 128-bit tag is sufficient
}
```

### Phase 1 Limitations (PSK Demo)
- **Single PSK**: All devices share one pre-shared key - fine for demo, not production
- **No forward secrecy**: Leaked key compromises all past messages
- **Bloom filter DoS**: In PSK mode, forged filters only starve the forger
- **Basic rate limiting**: "No more than N encrypted events per peer per minute"

### Future Security Enhancements
1. **Per-member keys**: Replace PSK with X3DH + Double Ratchet (like Signal)
2. **Authenticated Bloom filters**: Sign filters and include HLC timestamps
3. **CRDT-based ACL**: Use Keyhive-style authorization for member management
4. **Noise protocol**: Wrap P2P communication in authenticated channels

### Canonical Encoding (TODO)
For Phase 1, we use JSON.stringify for simplicity. Production will need:
- **CBOR Deterministic Mode** (RFC 8949 §4.2.1) for consistent encoding
- **Stable serialization** across all languages/platforms
- This ensures identical event_ids for the same logical event

### Rate Limiting & Egress Control
Even in PSK mode, implement basic protections:
```typescript
// Per-peer rate limiting
const MAX_EVENTS_PER_MINUTE = 1000
const MAX_BYTES_PER_MINUTE = 10 * 1024 * 1024 // 10MB

// Track and enforce limits
if (peerStats.eventsThisMinute > MAX_EVENTS_PER_MINUTE) {
  return // Drop event
}
```

## Phase 1 Benefits

1. **Local-first security**: Each device's backend on localhost, no plaintext over network
2. **Telegram-style API**: Events, cursors, real-time updates, proper sequencing
3. **Unified event model**: Messages and file chunks in same table, same sync path
4. **BLAKE3 event IDs**: Deterministic, verifiable, no plaintext leaks
5. **Future-ready**: Clean upgrade path to full E2E encryption and advanced features

## Implementation Checklist

- [ ] Set up Node.js backend per device on different ports
- [ ] Implement BLAKE3-based event ID generation
- [ ] Create single `events` table with proper indexes
- [ ] Build file chunking and reassembly logic
- [ ] Add WebSocket for real-time message delivery
- [ ] Implement basic rate limiting
- [ ] Document upgrade path to production crypto

This design provides a solid foundation that separates concerns properly while preparing for production-grade security in future phases.