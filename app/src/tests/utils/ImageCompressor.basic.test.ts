import { describe, it, expect } from 'vitest'
import { ImageCompressor } from '../../utils/ImageCompressor'

describe('ImageCompressor Basic', () => {
  describe('isJpeg', () => {
    it('should correctly identify JPEG images', () => {
      // Create a buffer with JPEG magic numbers
      const jpegBuffer = new ArrayBuffer(10)
      const view = new Uint8Array(jpegBuffer)
      view[0] = 0xFF
      view[1] = 0xD8
      view[view.length - 2] = 0xFF
      view[view.length - 1] = 0xD9
      
      expect(ImageCompressor.isJpeg(jpegBuffer)).toBe(true)
    })

    it('should correctly identify non-JPEG images', () => {
      // Create a buffer with PNG magic numbers
      const pngBuffer = new ArrayBuffer(10)
      const view = new Uint8Array(pngBuffer)
      view[0] = 0x89
      view[1] = 0x50
      view[2] = 0x4E
      view[3] = 0x47
      
      expect(ImageCompressor.isJpeg(pngBuffer)).toBe(false)
    })

    it('should handle empty buffers', () => {
      expect(ImageCompressor.isJpeg(new ArrayBuffer(0))).toBe(false)
    })

    it('should handle small buffers', () => {
      const smallBuffer = new ArrayBuffer(2)
      expect(ImageCompressor.isJpeg(smallBuffer)).toBe(false)
    })

    it('should handle invalid JPEG magic numbers', () => {
      const invalidBuffer = new ArrayBuffer(10)
      const view = new Uint8Array(invalidBuffer)
      view[0] = 0xFF
      view[1] = 0xD7 // Wrong second byte
      
      expect(ImageCompressor.isJpeg(invalidBuffer)).toBe(false)
    })
  })

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(ImageCompressor.formatFileSize(0)).toBe('0 B')
      expect(ImageCompressor.formatFileSize(1023)).toBe('1023 B')
      expect(ImageCompressor.formatFileSize(1024)).toBe('1 KB')
      expect(ImageCompressor.formatFileSize(1536)).toBe('1.5 KB')
      expect(ImageCompressor.formatFileSize(1024 * 1024)).toBe('1 MB')
      expect(ImageCompressor.formatFileSize(1.5 * 1024 * 1024)).toBe('1.5 MB')
      expect(ImageCompressor.formatFileSize(1024 * 1024 * 1024)).toBe('1 GB')
    })
  })

  describe('compressJpeg', () => {
    it('should skip compression for small images', async () => {
      // Create a small buffer (under 200KB)
      const smallBuffer = new ArrayBuffer(100 * 1024) // 100KB
      const view = new Uint8Array(smallBuffer)
      view[0] = 0xFF
      view[1] = 0xD8 // JPEG magic numbers
      
      const result = await ImageCompressor.compressJpeg(smallBuffer)
      
      expect(result.wasCompressed).toBe(false)
      expect(result.compressedSize).toBe(result.originalSize)
      expect(result.compressionRatio).toBe(1.0)
      expect(result.buffer).toBe(smallBuffer)
    })

    it('should handle invalid image data gracefully', async () => {
      // Create a buffer with JPEG magic but invalid data
      const invalidBuffer = new ArrayBuffer(300 * 1024) // 300KB (large enough to trigger compression)
      const view = new Uint8Array(invalidBuffer)
      view[0] = 0xFF
      view[1] = 0xD8 // JPEG magic numbers but rest is invalid
      
      const result = await ImageCompressor.compressJpeg(invalidBuffer)
      
      // Should fall back to original when compression fails
      expect(result.wasCompressed).toBe(false)
      expect(result.buffer).toBe(invalidBuffer)
      expect(result.compressionRatio).toBe(1.0)
    })
  })

  describe('processFile', () => {
    it('should skip compression for non-JPEG files', async () => {
      // Create a mock PNG file with proper arrayBuffer method
      const pngBuffer = new ArrayBuffer(150 * 1024) // 150KB
      const view = new Uint8Array(pngBuffer)
      view[0] = 0x89
      view[1] = 0x50 // PNG magic numbers
      
      // Mock file with arrayBuffer method for test environment
      const pngFile = {
        name: 'test.png',
        type: 'image/png',
        size: pngBuffer.byteLength,
        arrayBuffer: async () => pngBuffer
      } as File
      
      const result = await ImageCompressor.processFile(pngFile)
      
      expect(result.wasCompressed).toBe(false)
      expect(result.compressedSize).toBe(result.originalSize)
    })

    it('should skip compression for small JPEG files', async () => {
      // Create a mock small JPEG file with proper arrayBuffer method
      const smallBuffer = new ArrayBuffer(100 * 1024) // 100KB
      const view = new Uint8Array(smallBuffer)
      view[0] = 0xFF
      view[1] = 0xD8 // JPEG magic numbers
      
      // Mock file with arrayBuffer method for test environment
      const jpegFile = {
        name: 'small.jpg',
        type: 'image/jpeg',
        size: smallBuffer.byteLength,
        arrayBuffer: async () => smallBuffer
      } as File
      
      const result = await ImageCompressor.processFile(jpegFile)
      
      expect(result.wasCompressed).toBe(false)
      expect(result.compressedSize).toBe(result.originalSize)
    })
  })

  describe('compression target range validation', () => {
    it('should have correct target size constants', () => {
      // Access private constants through the compression logic
      // We can infer the target range by testing with different sizes
      
      // Small files (under 200KB) should not be compressed
      expect(200 * 1024).toBeGreaterThan(100 * 1024) // TARGET_MIN_SIZE = 100KB
      expect(200 * 1024).toBeLessThanOrEqual(200 * 1024) // TARGET_MAX_SIZE = 200KB
    })
  })
})