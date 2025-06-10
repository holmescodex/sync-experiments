import { describe, it, expect, beforeEach } from 'vitest'
import { FileReassembly } from '../../files/FileReassembly'
import { blake3 } from '@noble/hashes/blake3'

// Mock event structure matching our spec
interface MockEvent {
  arrival_seq: number
  event_id: string
  channel_id: string
  authored_ts: number
  ciphertext: Uint8Array
  file_id: string | null
  chunk_no: number | null
  prf_tag: string | null
}

// Helper to create a mock PSK for testing
const TEST_PSK = new Uint8Array(32).fill(42)

describe('FileReassembly', () => {
  let reassembly: FileReassembly
  
  beforeEach(() => {
    reassembly = new FileReassembly(TEST_PSK)
  })

  describe('File Chunking', () => {
    it('should chunk a small file into 500-byte pieces', async () => {
      // Create a 1KB test file
      const fileData = new Uint8Array(1024).fill(0x41) // 'A'
      const fileName = 'test.txt'
      const mimeType = 'text/plain'
      
      const result = await reassembly.chunkFile(fileData, fileName, mimeType)
      
      expect(result.fileId).toBeDefined()
      expect(result.totalChunks).toBe(3) // 1024 bytes = 3 chunks (500 + 500 + 24)
      expect(result.events).toHaveLength(3)
      
      // Each event should have proper structure
      result.events.forEach((event, index) => {
        expect(event.file_id).toBe(result.fileId)
        expect(event.chunk_no).toBe(index)
        expect(event.prf_tag).toBeDefined()
        expect(event.ciphertext).toBeInstanceOf(Uint8Array)
        // Ciphertext = 12 byte nonce + encrypted chunk + 16 byte auth tag
        expect(event.ciphertext.length).toBeLessThanOrEqual(500 + 12 + 16)
      })
    })

    it('should generate deterministic PRF tags', async () => {
      const fileId = 'test-file-123'
      const chunkNo = 0
      
      const tag1 = await reassembly.computePRFTag(fileId, chunkNo)
      const tag2 = await reassembly.computePRFTag(fileId, chunkNo)
      
      expect(tag1).toBe(tag2)
      expect(tag1).toHaveLength(32) // 16 bytes hex encoded
    })

    it('should generate different PRF tags for different chunks', async () => {
      const fileId = 'test-file-123'
      
      const tag0 = await reassembly.computePRFTag(fileId, 0)
      const tag1 = await reassembly.computePRFTag(fileId, 1)
      
      expect(tag0).not.toBe(tag1)
    })

    it('should generate different PRF tags for different files', async () => {
      const chunkNo = 0
      
      const tag1 = await reassembly.computePRFTag('file-1', chunkNo)
      const tag2 = await reassembly.computePRFTag('file-2', chunkNo)
      
      expect(tag1).not.toBe(tag2)
    })
  })

  describe('Event Creation', () => {
    it('should create events with BLAKE3 event IDs', async () => {
      const fileData = new Uint8Array(100).fill(0x42) // Small file
      const result = await reassembly.chunkFile(fileData, 'small.bin', 'application/octet-stream')
      
      const event = result.events[0]
      
      // event_id should be BLAKE3(ciphertext)
      const expectedEventId = Buffer.from(blake3(event.ciphertext)).toString('hex')
      expect(event.event_id).toBe(expectedEventId)
    })

    it('should include all required metadata in events', async () => {
      const fileData = new Uint8Array(100)
      const result = await reassembly.chunkFile(fileData, 'test.bin', 'application/octet-stream')
      
      const event = result.events[0]
      
      expect(event.channel_id).toBe('general')
      expect(event.authored_ts).toBeGreaterThan(0)
      expect(event.file_id).toBe(result.fileId)
      expect(event.chunk_no).toBe(0)
      expect(event.prf_tag).toBeDefined()
    })
  })

  describe('File Reassembly', () => {
    it('should reassemble a file from all chunks', async () => {
      // Original file
      const originalData = new Uint8Array(1024)
      for (let i = 0; i < originalData.length; i++) {
        originalData[i] = i % 256
      }
      
      // Chunk it
      const { fileId, events } = await reassembly.chunkFile(
        originalData, 
        'test.bin', 
        'application/octet-stream'
      )
      
      // Reassemble from events
      const reassembled = await reassembly.reassembleFile(fileId, events)
      
      expect(reassembled).not.toBeNull()
      expect(reassembled).toEqual(originalData)
    })

    it('should fail reassembly if chunks are missing', async () => {
      const originalData = new Uint8Array(1024)
      const { fileId, events } = await reassembly.chunkFile(
        originalData,
        'test.bin',
        'application/octet-stream'
      )
      
      // Remove middle chunk
      const incompleteEvents = [events[0], events[2]]
      
      const result = await reassembly.reassembleFile(fileId, incompleteEvents)
      
      expect(result).toBeNull()
    })

    it('should verify PRF tags during reassembly', async () => {
      const originalData = new Uint8Array(500)
      const { fileId, events } = await reassembly.chunkFile(
        originalData,
        'test.bin',
        'application/octet-stream'
      )
      
      // Tamper with PRF tag
      events[0].prf_tag = 'invalid-tag'
      
      const result = await reassembly.reassembleFile(fileId, events)
      
      expect(result).toBeNull()
    })

    it('should handle chunks in any order', async () => {
      const originalData = new Uint8Array(1024)
      for (let i = 0; i < originalData.length; i++) {
        originalData[i] = i % 256
      }
      
      const { fileId, events } = await reassembly.chunkFile(
        originalData,
        'test.bin',
        'application/octet-stream'
      )
      
      // Shuffle events
      const shuffled = [...events].reverse()
      
      const reassembled = await reassembly.reassembleFile(fileId, shuffled)
      
      expect(reassembled).toEqual(originalData)
    })
  })

  describe('SQL Query Generation', () => {
    it('should generate query to fetch all chunks of a file', () => {
      const fileId = 'test-file-123'
      
      const query = reassembly.getFileChunksQuery(fileId)
      
      expect(query.sql).toBe(`
        SELECT arrival_seq, event_id, channel_id, authored_ts, 
               ciphertext, file_id, chunk_no, prf_tag
        FROM events
        WHERE file_id = ?
        ORDER BY chunk_no ASC
      `.trim())
      expect(query.params).toEqual([fileId])
    })

    it('should generate query to fetch specific chunk', () => {
      const fileId = 'test-file-123'
      const chunkNo = 5
      
      const query = reassembly.getSpecificChunkQuery(fileId, chunkNo)
      
      expect(query.sql).toBe(`
        SELECT arrival_seq, event_id, channel_id, authored_ts,
               ciphertext, file_id, chunk_no, prf_tag
        FROM events
        WHERE file_id = ? AND chunk_no = ?
      `.trim())
      expect(query.params).toEqual([fileId, chunkNo])
    })

    it('should generate query to check file completeness', () => {
      const fileId = 'test-file-123'
      
      const query = reassembly.getFileCompletenessQuery(fileId)
      
      expect(query.sql).toBe(`
        SELECT COUNT(DISTINCT chunk_no) as chunks_received,
               MAX(chunk_no) + 1 as expected_chunks
        FROM events
        WHERE file_id = ?
      `.trim())
      expect(query.params).toEqual([fileId])
    })
  })

  describe('Large File Handling', () => {
    it('should handle a 1MB file efficiently', async () => {
      // 1MB file
      const largeFile = new Uint8Array(1024 * 1024)
      // Fill with pattern to verify correct reassembly
      for (let i = 0; i < largeFile.length; i++) {
        largeFile[i] = (i * 7) % 256
      }
      
      const { fileId, events, totalChunks } = await reassembly.chunkFile(
        largeFile,
        'large.bin',
        'application/octet-stream'
      )
      
      // Should create ~2098 chunks (1MB / 500 bytes)
      expect(totalChunks).toBeGreaterThan(2000)
      expect(events).toHaveLength(totalChunks)
      
      // Verify we can reassemble
      const reassembled = await reassembly.reassembleFile(fileId, events)
      expect(reassembled).toEqual(largeFile)
    }, 30000) // 30 second timeout for large file test
  })
})