import { describe, it, expect } from 'vitest'
import { FileHandler } from '../../files/FileHandler'

describe('FileHandler', () => {
  let fileHandler: FileHandler

  beforeEach(() => {
    fileHandler = new FileHandler()
  })

  describe('generateFileKey', () => {
    it('should generate a 32-byte key', () => {
      const key = fileHandler.generateFileKey()
      expect(key).toBeInstanceOf(Uint8Array)
      expect(key.length).toBe(32)
    })

    it('should generate different keys each time', () => {
      const key1 = fileHandler.generateFileKey()
      const key2 = fileHandler.generateFileKey()
      expect(Buffer.from(key1).equals(Buffer.from(key2))).toBe(false)
    })
  })

  describe('computePrfTag', () => {
    it('should generate consistent PRF tags', () => {
      const fileKey = fileHandler.generateFileKey()
      const tag1 = fileHandler.computePrfTag(fileKey, 0)
      const tag2 = fileHandler.computePrfTag(fileKey, 0)
      expect(tag1).toBe(tag2)
    })

    it('should generate different tags for different indices', () => {
      const fileKey = fileHandler.generateFileKey()
      const tag0 = fileHandler.computePrfTag(fileKey, 0)
      const tag1 = fileHandler.computePrfTag(fileKey, 1)
      expect(tag0).not.toBe(tag1)
    })

    it('should generate different tags for different keys', () => {
      const fileKey1 = fileHandler.generateFileKey()
      const fileKey2 = fileHandler.generateFileKey()
      const tag1 = fileHandler.computePrfTag(fileKey1, 0)
      const tag2 = fileHandler.computePrfTag(fileKey2, 0)
      expect(tag1).not.toBe(tag2)
    })
  })

  describe('chunkFile', () => {
    it('should chunk small files correctly', async () => {
      const data = Buffer.from('Hello, World!')
      const fileKey = fileHandler.generateFileKey()
      
      const { fileId, chunks } = await fileHandler.chunkFile(data, fileKey)
      
      expect(fileId).toBeTruthy()
      expect(chunks).toHaveLength(1) // Small file fits in one chunk
      expect(chunks[0].index).toBe(0)
      expect(chunks[0].prfTag).toBeTruthy()
      expect(chunks[0].encrypted).toBeInstanceOf(Uint8Array)
    })

    it('should chunk large files into multiple chunks', async () => {
      // Create 1.5KB of data (should be 3 chunks of 500 bytes each)
      const data = Buffer.alloc(1500, 'test data repeating ')
      const fileKey = fileHandler.generateFileKey()
      
      const { fileId, chunks } = await fileHandler.chunkFile(data, fileKey)
      
      expect(chunks).toHaveLength(3)
      expect(chunks[0].index).toBe(0)
      expect(chunks[1].index).toBe(1)
      expect(chunks[2].index).toBe(2)
      
      // Each chunk should have unique PRF tag
      const tags = new Set(chunks.map(c => c.prfTag))
      expect(tags.size).toBe(3)
    })

    it('should produce consistent file IDs for same data', async () => {
      const data = Buffer.from('Test file content')
      const fileKey1 = fileHandler.generateFileKey()
      const fileKey2 = fileHandler.generateFileKey()
      
      const result1 = await fileHandler.chunkFile(data, fileKey1)
      const result2 = await fileHandler.chunkFile(data, fileKey2)
      
      // Same data should produce same file ID
      expect(result1.fileId).toBe(result2.fileId)
    })
  })

  describe('assembleFile', () => {
    it('should reassemble file from ordered chunks', async () => {
      const originalData = Buffer.from('Hello, World! This is a test file.')
      const fileKey = fileHandler.generateFileKey()
      
      // Chunk the file
      const { fileId, chunks } = await fileHandler.chunkFile(originalData, fileKey)
      
      // Convert to ChunkData format
      const chunkData = chunks.map(c => ({
        prfTag: c.prfTag,
        data: c.encrypted
      }))
      
      // Reassemble
      const assembled = await fileHandler.assembleFile(
        chunkData,
        fileKey,
        fileId,
        chunks.length
      )
      
      expect(assembled).toBeInstanceOf(Uint8Array)
      expect(Buffer.from(assembled!)).toEqual(originalData)
    })

    it('should reassemble file from shuffled chunks', async () => {
      const originalData = Buffer.alloc(1500, 'test data ')
      const fileKey = fileHandler.generateFileKey()
      
      // Chunk the file
      const { fileId, chunks } = await fileHandler.chunkFile(originalData, fileKey)
      
      // Shuffle chunks
      const chunkData = chunks
        .map(c => ({ prfTag: c.prfTag, data: c.encrypted }))
        .sort(() => Math.random() - 0.5)
      
      // Reassemble
      const assembled = await fileHandler.assembleFile(
        chunkData,
        fileKey,
        fileId,
        chunks.length
      )
      
      expect(assembled).toBeInstanceOf(Uint8Array)
      expect(Buffer.from(assembled!)).toEqual(originalData)
    })

    it('should return null for missing chunks', async () => {
      const originalData = Buffer.alloc(1500, 'test data ')
      const fileKey = fileHandler.generateFileKey()
      
      // Chunk the file
      const { fileId, chunks } = await fileHandler.chunkFile(originalData, fileKey)
      
      // Remove one chunk
      const chunkData = chunks
        .slice(0, -1) // Remove last chunk
        .map(c => ({ prfTag: c.prfTag, data: c.encrypted }))
      
      // Try to reassemble
      const assembled = await fileHandler.assembleFile(
        chunkData,
        fileKey,
        fileId,
        chunks.length
      )
      
      expect(assembled).toBeNull()
    })

    it('should reject chunks with wrong PRF tags', async () => {
      const originalData = Buffer.from('Test data')
      const fileKey = fileHandler.generateFileKey()
      const wrongKey = fileHandler.generateFileKey()
      
      // Chunk the file
      const { fileId, chunks } = await fileHandler.chunkFile(originalData, fileKey)
      
      // Create chunk with wrong PRF tag
      const wrongTag = fileHandler.computePrfTag(wrongKey, 0)
      const chunkData = [{
        prfTag: wrongTag,
        data: chunks[0].encrypted
      }]
      
      // Try to reassemble
      const assembled = await fileHandler.assembleFile(
        chunkData,
        fileKey,
        fileId,
        1
      )
      
      expect(assembled).toBeNull()
    })

    it('should reject corrupted file', async () => {
      const originalData = Buffer.from('Test data')
      const fileKey = fileHandler.generateFileKey()
      
      // Chunk the file
      const { fileId, chunks } = await fileHandler.chunkFile(originalData, fileKey)
      
      // Corrupt the encrypted data
      const corruptedChunk = {
        prfTag: chunks[0].prfTag,
        data: new Uint8Array(chunks[0].encrypted)
      }
      corruptedChunk.data[4] ^= 0xFF // Flip some bits
      
      // Try to reassemble with wrong file ID expectation
      const assembled = await fileHandler.assembleFile(
        [corruptedChunk],
        fileKey,
        'wrong-file-id',
        1
      )
      
      expect(assembled).toBeNull()
    })
  })

  describe('getRequiredPrfTags', () => {
    it('should generate correct number of PRF tags', () => {
      const fileKey = fileHandler.generateFileKey()
      const tags = fileHandler.getRequiredPrfTags(fileKey, 5)
      
      expect(tags).toHaveLength(5)
      expect(new Set(tags).size).toBe(5) // All unique
    })
  })

  describe('hasAllChunks', () => {
    it('should return true when all chunks are present', () => {
      const fileKey = fileHandler.generateFileKey()
      const tags = fileHandler.getRequiredPrfTags(fileKey, 3)
      const receivedChunks = new Set(tags)
      
      expect(fileHandler.hasAllChunks(receivedChunks, fileKey, 3)).toBe(true)
    })

    it('should return false when chunks are missing', () => {
      const fileKey = fileHandler.generateFileKey()
      const tags = fileHandler.getRequiredPrfTags(fileKey, 3)
      const receivedChunks = new Set(tags.slice(0, 2)) // Missing last chunk
      
      expect(fileHandler.hasAllChunks(receivedChunks, fileKey, 3)).toBe(false)
    })
  })
})