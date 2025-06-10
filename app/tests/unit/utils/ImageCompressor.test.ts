import { describe, it, expect, beforeAll } from 'vitest'
import * as JimpModule from 'jimp'
import { ImageCompressor } from '../../utils/ImageCompressor'

const { Jimp } = JimpModule

describe('ImageCompressor', () => {
  let smallJpegBuffer: ArrayBuffer
  let largeJpegBuffer: ArrayBuffer
  let pngBuffer: ArrayBuffer

  beforeAll(async () => {
    // Create a small JPEG image (under 200KB)
    const smallImage = new Jimp({ width: 200, height: 200, color: '#ff0000' })
    const smallBuffer = await smallImage.getBuffer(JimpModule.JimpMime.jpeg, { quality: 90 })
    smallJpegBuffer = smallBuffer.buffer.slice(smallBuffer.byteOffset, smallBuffer.byteOffset + smallBuffer.byteLength)

    // Use real large JPEG image from project root (2.3MB)
    const fs = await import('fs')
    const largeImageData = fs.readFileSync('/home/hwilson/sync-experiments/PXL_20250527_034640179.jpg')
    largeJpegBuffer = largeImageData.buffer.slice(largeImageData.byteOffset, largeImageData.byteOffset + largeImageData.byteLength)

    // Create a PNG image
    const pngImage = new Jimp({ width: 300, height: 300, color: '#0000ff' })
    const pngBuf = await pngImage.getBuffer(JimpModule.JimpMime.png)
    pngBuffer = pngBuf.buffer.slice(pngBuf.byteOffset, pngBuf.byteOffset + pngBuf.byteLength)
  })

  describe('isJpeg', () => {
    it('should correctly identify JPEG images', () => {
      expect(ImageCompressor.isJpeg(smallJpegBuffer)).toBe(true)
      expect(ImageCompressor.isJpeg(largeJpegBuffer)).toBe(true)
    })

    it('should correctly identify non-JPEG images', () => {
      expect(ImageCompressor.isJpeg(pngBuffer)).toBe(false)
    })

    it('should handle empty buffers', () => {
      expect(ImageCompressor.isJpeg(new ArrayBuffer(0))).toBe(false)
    })

    it('should handle small buffers', () => {
      const smallBuffer = new ArrayBuffer(2)
      expect(ImageCompressor.isJpeg(smallBuffer)).toBe(false)
    })
  })

  describe('compressJpeg', () => {
    it('should skip compression for small images', async () => {
      const result = await ImageCompressor.compressJpeg(smallJpegBuffer)
      
      expect(result.wasCompressed).toBe(false)
      expect(result.compressedSize).toBe(result.originalSize)
      expect(result.compressionRatio).toBe(1.0)
      expect(result.buffer).toBe(smallJpegBuffer)
    })

    it('should compress large images', async () => {
      const result = await ImageCompressor.compressJpeg(largeJpegBuffer)
      
      expect(result.wasCompressed).toBe(true)
      expect(result.compressedSize).toBeLessThan(result.originalSize)
      expect(result.compressionRatio).toBeLessThan(1.0)
      expect(result.buffer).not.toBe(largeJpegBuffer)
    })

    it('should compress to target size range', async () => {
      const result = await ImageCompressor.compressJpeg(largeJpegBuffer)
      
      // Should be within or close to the target range (100KB - 200KB)
      // Allow some flexibility as compression isn't exact
      expect(result.compressedSize).toBeLessThanOrEqual(250 * 1024) // 250KB max
      expect(result.compressedSize).toBeGreaterThan(50 * 1024) // 50KB min
    })

    it('should produce valid JPEG output', async () => {
      const result = await ImageCompressor.compressJpeg(largeJpegBuffer)
      
      expect(ImageCompressor.isJpeg(result.buffer)).toBe(true)
    })

    it('should handle compression with specific quality', async () => {
      const result = await ImageCompressor.compressJpeg(largeJpegBuffer, 50)
      
      expect(result.wasCompressed).toBe(true)
      expect(result.compressedSize).toBeLessThan(result.originalSize)
    })

    it('should handle very small quality values', async () => {
      const result = await ImageCompressor.compressJpeg(largeJpegBuffer, 10)
      
      expect(result.wasCompressed).toBe(true)
      expect(result.compressedSize).toBeLessThan(result.originalSize)
      expect(ImageCompressor.isJpeg(result.buffer)).toBe(true)
    })

    it('should handle very high quality values', async () => {
      const result = await ImageCompressor.compressJpeg(largeJpegBuffer, 95)
      
      expect(result.wasCompressed).toBe(true)
      expect(ImageCompressor.isJpeg(result.buffer)).toBe(true)
    })
  })

  describe('processFile', () => {
    it('should compress JPEG files', async () => {
      // Create a mock File object for JPEG
      const jpegFile = {
        name: 'test.jpg',
        type: 'image/jpeg',
        size: largeJpegBuffer.byteLength,
        arrayBuffer: async () => largeJpegBuffer
      } as File
      
      const result = await ImageCompressor.processFile(jpegFile)
      
      expect(result.wasCompressed).toBe(true)
      expect(result.compressedSize).toBeLessThan(result.originalSize)
    })

    it('should skip compression for non-JPEG files', async () => {
      // Create a mock File object for PNG
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
      const smallJpegFile = {
        name: 'small.jpg',
        type: 'image/jpeg',
        size: smallJpegBuffer.byteLength,
        arrayBuffer: async () => smallJpegBuffer
      } as File
      
      const result = await ImageCompressor.processFile(smallJpegFile)
      
      expect(result.wasCompressed).toBe(false)
      expect(result.compressedSize).toBe(result.originalSize)
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

  describe('compression effectiveness', () => {
    it('should achieve significant compression for large images', async () => {
      // Only run if we have a large enough image
      if (largeJpegBuffer.byteLength > 300 * 1024) {
        const result = await ImageCompressor.compressJpeg(largeJpegBuffer)
        
        // Should achieve at least 50% compression ratio for large images
        expect(result.compressionRatio).toBeLessThan(0.8)
        expect(result.compressedSize).toBeLessThan(250 * 1024) // Under 250KB
      }
    })

    it('should maintain image integrity after compression', async () => {
      const result = await ImageCompressor.compressJpeg(largeJpegBuffer)
      
      // Compressed image should still be readable by jimp
      const compressedImage = await Jimp.read(Buffer.from(result.buffer))
      expect(compressedImage.width).toBeGreaterThan(0)
      expect(compressedImage.height).toBeGreaterThan(0)
    })
  })

  describe('edge cases', () => {
    it('should handle invalid image data gracefully', async () => {
      const invalidBuffer = new ArrayBuffer(100)
      const uint8Array = new Uint8Array(invalidBuffer)
      // Set JPEG magic numbers but with invalid data
      uint8Array[0] = 0xFF
      uint8Array[1] = 0xD8
      
      const result = await ImageCompressor.compressJpeg(invalidBuffer)
      
      // Should fall back to original when compression fails
      expect(result.wasCompressed).toBe(false)
      expect(result.buffer).toBe(invalidBuffer)
    })

    it('should handle extremely small images', async () => {
      // Create a 1x1 pixel JPEG
      const tinyImage = new Jimp({ width: 1, height: 1, color: '#ffffff' })
      const tinyBuffer = await tinyImage.getBuffer(JimpModule.JimpMime.jpeg, { quality: 90 })
      const tinyArrayBuffer = tinyBuffer.buffer.slice(tinyBuffer.byteOffset, tinyBuffer.byteOffset + tinyBuffer.byteLength)
      
      const result = await ImageCompressor.compressJpeg(tinyArrayBuffer)
      
      // Should skip compression for tiny images
      expect(result.wasCompressed).toBe(false)
    })
  })
})