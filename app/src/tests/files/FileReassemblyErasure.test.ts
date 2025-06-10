import { describe, it, expect, beforeEach } from 'vitest'
import { FileReassemblyErasure } from '../../files/FileReassemblyErasureXOR'
import { blake3 } from '@noble/hashes/blake3'

// Mock PSK for testing
const TEST_PSK = new Uint8Array(32).fill(42)

describe('FileReassemblyErasure', () => {
  describe('Without Erasure Coding', () => {
    let reassembly: FileReassemblyErasure
    
    beforeEach(() => {
      reassembly = new FileReassemblyErasure(TEST_PSK, { enabled: false, parityMultiplier: 2 })
    })

    it('should work like regular FileReassembly when erasure coding is disabled', async () => {
      const fileData = new Uint8Array(1024).fill(0x41) // 'A'
      const result = await reassembly.chunkFile(fileData, 'test.txt', 'text/plain')
      
      expect(result.totalDataChunks).toBe(3) // 1024 / 500 = 3 chunks
      expect(result.totalParityChunks).toBe(0) // No parity when disabled
      expect(result.events).toHaveLength(3)
      
      // All chunks should be data chunks
      result.events.forEach(event => {
        expect(event.is_parity).toBe(false)
      })
      
      // Should reassemble correctly
      const reassembled = await reassembly.reassembleFile(result.fileId, result.events)
      expect(reassembled).toEqual(fileData)
    })
  })

  describe('With Erasure Coding (2x)', () => {
    let reassembly: FileReassemblyErasure
    
    beforeEach(() => {
      reassembly = new FileReassemblyErasure(TEST_PSK, { enabled: true, parityMultiplier: 2 })
    })

    it('should generate parity chunks with 2x multiplier', async () => {
      const fileData = new Uint8Array(1000).fill(0x42) // 'B'
      const result = await reassembly.chunkFile(fileData, 'test.bin', 'application/octet-stream')
      
      expect(result.totalDataChunks).toBe(2) // 1000 / 500 = 2 chunks
      expect(result.totalParityChunks).toBe(1) // 2 data chunks / 2 = 1 parity chunk
      expect(result.totalChunks).toBe(3)
      expect(result.events).toHaveLength(3)
      
      // Check chunk types
      const dataChunks = result.events.filter(e => !e.is_parity)
      const parityChunks = result.events.filter(e => e.is_parity)
      
      expect(dataChunks).toHaveLength(2)
      expect(parityChunks).toHaveLength(1)
      
      // Parity chunks should have higher chunk numbers
      expect(parityChunks[0].chunk_no).toBe(2)
    })

    it('should reassemble file with all chunks present', async () => {
      const fileData = new Uint8Array(1500)
      for (let i = 0; i < fileData.length; i++) {
        fileData[i] = i % 256
      }
      
      const result = await reassembly.chunkFile(fileData, 'test.bin', 'application/octet-stream')
      
      // Should have 3 data chunks and 1 parity chunk
      expect(result.totalDataChunks).toBe(3)
      expect(result.totalParityChunks).toBe(1)
      
      const reassembled = await reassembly.reassembleFile(result.fileId, result.events)
      expect(reassembled).toEqual(fileData)
    })

    it('should recover from one missing data chunk using parity', async () => {
      const fileData = new Uint8Array(1000)
      for (let i = 0; i < fileData.length; i++) {
        fileData[i] = (i * 7) % 256
      }
      
      const result = await reassembly.chunkFile(fileData, 'test.bin', 'application/octet-stream')
      
      expect(result.totalDataChunks).toBe(2)
      expect(result.totalParityChunks).toBe(1)
      
      // Remove one data chunk
      const eventsWithMissing = result.events.filter(e => e.chunk_no !== 0)
      
      // Should still be able to reconstruct
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithMissing)
      expect(reassembled).not.toBeNull()
      expect(reassembled).toEqual(fileData)
    })

    it('should fail when too many chunks are missing', async () => {
      const fileData = new Uint8Array(1500) // Will have 3 data chunks, 1 parity
      const result = await reassembly.chunkFile(fileData, 'test.bin', 'application/octet-stream')
      
      // Remove 2 data chunks (more than parity can recover)
      const eventsWithMissing = result.events.filter(e => e.chunk_no !== 0 && e.chunk_no !== 1)
      
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithMissing)
      expect(reassembled).toBeNull()
    })

    it('should generate different PRF tags for data and parity chunks', async () => {
      const fileId = 'test-file-123'
      
      const dataTag = await reassembly.computePRFTag(fileId, 0, false)
      const parityTag = await reassembly.computePRFTag(fileId, 0, true)
      
      expect(dataTag).not.toBe(parityTag)
    })
  })

  describe('Large Files with Erasure Coding', () => {
    it('should handle a 1MB file with erasure coding', async () => {
      const reassembly = new FileReassemblyErasure(TEST_PSK, { enabled: true, parityMultiplier: 2 })
      
      // 1MB file (reduced for testing performance)
      const largeFile = new Uint8Array(1 * 1024 * 1024)
      for (let i = 0; i < largeFile.length; i++) {
        largeFile[i] = (i * 13) % 256
      }
      
      const startChunk = performance.now()
      const result = await reassembly.chunkFile(largeFile, 'large.bin', 'application/octet-stream')
      const chunkTime = performance.now() - startChunk
      
      console.log(`Chunking 1MB with erasure coding took ${chunkTime.toFixed(2)}ms`)
      
      // Should have ~2097 data chunks (1MB / 500)
      expect(result.totalDataChunks).toBeGreaterThan(2000)
      // With XOR and 2x multiplier, we get 1 parity per 2 data chunks
      expect(result.totalParityChunks).toBeGreaterThan(1000)
      expect(result.totalParityChunks).toBeLessThan(1100)
      
      // Test recovery with a smaller percentage missing for XOR
      // XOR can only recover 1 missing chunk per parity group
      // So let's test with just a few missing chunks
      const missingChunks = [0, 10, 20, 30, 40] // 5 missing chunks
      const eventsWithMissing = result.events.filter((e) => {
        if (!e.is_parity && missingChunks.includes(e.chunk_no)) {
          return false
        }
        return true
      })
      const totalMissing = missingChunks.length
      
      console.log(`Testing recovery with ${totalMissing} missing chunks`)
      
      const startReassemble = performance.now()
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithMissing)
      const reassembleTime = performance.now() - startReassemble
      
      console.log(`Reassembly with erasure recovery took ${reassembleTime.toFixed(2)}ms`)
      
      expect(reassembled).not.toBeNull()
      expect(reassembled).toEqual(largeFile)
    }, 60000) // 60 second timeout for large file
  })

  describe('SQL Queries', () => {
    let reassembly: FileReassemblyErasure
    
    beforeEach(() => {
      reassembly = new FileReassemblyErasure(TEST_PSK)
    })

    it('should generate query to fetch all chunks including parity', () => {
      const query = reassembly.getFileChunksQuery('file-123')
      
      expect(query.sql).toContain('is_parity')
      expect(query.sql).toContain('WHERE file_id = ?')
      expect(query.params).toEqual(['file-123'])
    })

    it('should generate query to check erasure coding status', () => {
      const query = reassembly.getFileErasureStatusQuery('file-123')
      
      expect(query.sql).toContain('COUNT(CASE WHEN is_parity = 0')
      expect(query.sql).toContain('COUNT(CASE WHEN is_parity = 1')
      expect(query.params).toEqual(['file-123'])
    })
  })
})