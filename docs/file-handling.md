# File Handling in P2P Event Store

This document describes the approach to handling files (images, documents, etc.) in the peer-to-peer event store system.

## Phase 1: UI Development with URL Placeholders

### Current Implementation (Phase 1.5)

We're implementing file attachment UI as a foundation for future P2P file transfer. In this phase:

#### Message Structure
```typescript
interface Message {
  id: string
  content: string
  timestamp: number
  fromSimulation?: boolean
  attachments?: FileAttachment[]
}

interface FileAttachment {
  id: string
  type: 'image' | 'document' | 'video' | 'audio'
  name: string
  size: number
  url?: string        // Phase 1: Direct URL (placeholder)
  contentId?: string  // Phase 2+: Content-addressed ID
  mimeType: string
  loadingState?: 'pending' | 'loading' | 'loaded' | 'error'
  loadingProgress?: number
}
```

#### UI Components
- **File Attachment Button**: Paperclip icon for attaching files
- **Image Picker**: File input for selecting images
- **Image Preview**: Thumbnail preview before sending
- **Image Message Display**: Inline image display in chat bubbles
- **Loading States**: Progress indicators and placeholders
- **Error Handling**: Failed load states and retry options

#### Placeholder Strategy
For Phase 1 UI development, we use direct URLs as placeholders:
- Test images stored in `/public/test-images/`
- Messages include `url` field pointing to public images
- Future: Replace URLs with content-addressed IDs

#### Test Images
We include several public domain test images (100-200KB each):
- `landscape.jpg` - Nature scene
- `portrait.jpg` - Person photo  
- `abstract.jpg` - Abstract art
- `diagram.png` - Technical diagram

## Phase 2: Content-Addressed Storage (Future)

### Planned Architecture
```
Event Structure:
{
  type: "file_chunk",
  fileId: "hash_of_complete_file",
  chunkIndex: 0,
  totalChunks: 10,
  chunkHash: "hash_of_this_chunk",
  data: "base64_encoded_chunk_data"
}
```

### File Transfer Protocol
1. **File Chunking**: Split files into ~64KB chunks
2. **Content Addressing**: Use hash of complete file as ID
3. **Chunk Distribution**: Broadcast chunks as events
4. **Reassembly**: Collect chunks and reconstruct files
5. **Deduplication**: Same files share same content ID

### Database Schema (Future)
```sql
-- File metadata
CREATE TABLE files (
  content_id TEXT PRIMARY KEY,  -- hash of complete file
  filename TEXT,
  mime_type TEXT,
  size_bytes INTEGER,
  chunk_count INTEGER,
  created_ts INTEGER
);

-- File chunks
CREATE TABLE file_chunks (
  content_id TEXT,
  chunk_index INTEGER,
  chunk_hash TEXT,
  chunk_data BLOB,
  received_ts INTEGER,
  PRIMARY KEY (content_id, chunk_index)
);
```

## Implementation Timeline

### Phase 1.5: UI Development (Current)
- ✅ Message attachment UI components
- ✅ Image display in chat bubbles
- ✅ Loading states and progress indicators
- ✅ Test images and placeholder URLs
- ✅ File type detection and validation

### Phase 2: Content Addressing
- Content-addressed file IDs
- File chunking utilities
- Chunk event generation
- File reconstruction from chunks

### Phase 3: P2P Transfer
- Bloom filter-based chunk discovery
- Missing chunk requests
- Chunk broadcasting over UDP
- Integrity verification

### Phase 4: Advanced Features
- File deduplication
- Partial file access
- File search and indexing
- Thumbnail generation

## Technical Considerations

### Security
- Content validation before display
- Size limits to prevent abuse
- Mime type verification
- Sanitized filenames

### Performance
- Lazy loading of images
- Thumbnail generation
- Progressive loading states
- Efficient chunk storage

### User Experience
- Drag & drop file upload
- Image paste from clipboard
- Preview before sending
- Download/save functionality
- File size and type indicators

## Current Status

**Phase 1.5**: ✅ **COMPLETED** - UI components with URL placeholders implemented
- ✅ File attachment button (📎) in chat input
- ✅ File selection dialog with multi-file support
- ✅ File preview with thumbnail images and file info
- ✅ Image display in message bubbles (max 200px height)
- ✅ Loading states with spinner and progress bar components
- ✅ Error handling for failed image loads
- ✅ File removal from preview before sending
- ✅ Support for images (JPG, PNG) and documents
- ✅ Test images generated (landscape.jpg, portrait.jpg, abstract.jpg, diagram.png, small.jpg, large.jpg)
- ✅ Demo integration: 30% of auto-generated messages include random test images

**File Attachment UI Features:**
- **Attach Button**: Paperclip icon next to message input
- **File Preview Area**: Shows selected files with thumbnails before sending
- **Message Display**: Images appear inline in chat bubbles
- **Loading States**: Spinner and progress bar for file operations
- **Error Fallback**: File name and size display if image fails to load

**Test Images Available:**
- `landscape.jpg` (800×600, 17KB) - Blue mountain scene
- `portrait.jpg` (400×600, 11KB) - Red portrait style
- `abstract.jpg` (600×400, 121KB) - Purple noise pattern
- `diagram.png` (500×300, 11KB) - Technical diagram with boxes
- `small.jpg` (300×300, 8KB) - Green small image
- `large.jpg` (1200×800, 24KB) - Brown panorama

**Next**: Implement content-addressed storage and chunking system for true P2P file transfer.