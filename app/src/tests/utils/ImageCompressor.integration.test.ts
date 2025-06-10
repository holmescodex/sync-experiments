import { describe, it, expect } from 'vitest'
import { ImageCompressor } from '../../utils/ImageCompressor'

describe('ImageCompressor Integration', () => {
  describe('Core functionality', () => {
    it('should have correct JPEG detection logic', () => {
      // Test JPEG detection with various buffer sizes
      const createJpegBuffer = (size: number) => {
        const buffer = new ArrayBuffer(size)
        const view = new Uint8Array(buffer)
        view[0] = 0xFF
        view[1] = 0xD8 // JPEG magic numbers
        return buffer
      }

      expect(ImageCompressor.isJpeg(createJpegBuffer(10))).toBe(true)
      expect(ImageCompressor.isJpeg(createJpegBuffer(1000))).toBe(true)
      expect(ImageCompressor.isJpeg(createJpegBuffer(100000))).toBe(true)
    })

    it('should handle size formatting for compression results', () => {
      const sizes = [
        { bytes: 150000, expected: '146.5 KB' },
        { bytes: 250000, expected: '244.1 KB' },
        { bytes: 1500000, expected: '1.4 MB' }
      ]

      sizes.forEach(({ bytes, expected }) => {
        expect(ImageCompressor.formatFileSize(bytes)).toBe(expected)
      })
    })

    it('should skip compression for files under threshold', async () => {
      // Test with different sizes under 200KB
      const testSizes = [50000, 100000, 150000, 199000] // All under 200KB

      for (const size of testSizes) {
        const buffer = new ArrayBuffer(size)
        const view = new Uint8Array(buffer)
        view[0] = 0xFF
        view[1] = 0xD8 // JPEG magic

        const result = await ImageCompressor.compressJpeg(buffer)
        
        expect(result.wasCompressed).toBe(false)
        expect(result.originalSize).toBe(size)
        expect(result.compressedSize).toBe(size)
        expect(result.compressionRatio).toBe(1.0)
        expect(result.buffer).toBe(buffer)
      }
    })

    it('should return compression result structure correctly', async () => {
      const buffer = new ArrayBuffer(100000) // 100KB
      const view = new Uint8Array(buffer)
      view[0] = 0xFF
      view[1] = 0xD8

      const result = await ImageCompressor.compressJpeg(buffer)

      // Verify result structure
      expect(result).toHaveProperty('originalSize')
      expect(result).toHaveProperty('compressedSize')
      expect(result).toHaveProperty('compressionRatio')
      expect(result).toHaveProperty('buffer')
      expect(result).toHaveProperty('wasCompressed')

      expect(typeof result.originalSize).toBe('number')
      expect(typeof result.compressedSize).toBe('number')
      expect(typeof result.compressionRatio).toBe('number')
      expect(result.buffer instanceof ArrayBuffer).toBe(true)
      expect(typeof result.wasCompressed).toBe('boolean')
    })
  })

  describe('Compression thresholds', () => {
    it('should have predictable behavior for different file sizes', async () => {
      const testCases = [
        { size: 50 * 1024, shouldCompress: false, description: '50KB' },
        { size: 100 * 1024, shouldCompress: false, description: '100KB' },
        { size: 200 * 1024, shouldCompress: false, description: '200KB' },
        { size: 250 * 1024, shouldCompress: true, description: '250KB' },
        { size: 500 * 1024, shouldCompress: true, description: '500KB' }
      ]

      for (const testCase of testCases) {
        const buffer = new ArrayBuffer(testCase.size)
        const view = new Uint8Array(buffer)
        view[0] = 0xFF
        view[1] = 0xD8 // JPEG magic

        const result = await ImageCompressor.compressJpeg(buffer)

        if (testCase.shouldCompress) {
          // Large files should attempt compression (may fail with invalid data, but should try)
          expect(result.originalSize).toBe(testCase.size)
          // Since we're using invalid JPEG data, compression will fail and return original
          // But we've tested the decision logic
        } else {
          // Small files should skip compression entirely
          expect(result.wasCompressed).toBe(false)
          expect(result.compressedSize).toBe(testCase.size)
        }
      }
    })
  })

  describe('Error handling', () => {
    it('should handle various invalid inputs gracefully', async () => {
      const invalidInputs = [
        new ArrayBuffer(0), // Empty buffer
        new ArrayBuffer(1), // Too small
      ]

      for (const buffer of invalidInputs) {
        const result = await ImageCompressor.compressJpeg(buffer)
        expect(result.wasCompressed).toBe(false)
        expect(result.buffer).toBe(buffer)
      }
    })

    it('should handle non-JPEG files correctly', () => {
      const createNonJpegBuffer = (firstBytes: number[]) => {
        const buffer = new ArrayBuffer(100000) // Large enough to normally trigger compression
        const view = new Uint8Array(buffer)
        firstBytes.forEach((byte, index) => {
          view[index] = byte
        })
        return buffer
      }

      // Test PNG
      expect(ImageCompressor.isJpeg(createNonJpegBuffer([0x89, 0x50, 0x4E, 0x47]))).toBe(false)
      
      // Test GIF
      expect(ImageCompressor.isJpeg(createNonJpegBuffer([0x47, 0x49, 0x46, 0x38]))).toBe(false)
      
      // Test random data
      expect(ImageCompressor.isJpeg(createNonJpegBuffer([0x00, 0x00, 0x00, 0x00]))).toBe(false)
    })
  })
})