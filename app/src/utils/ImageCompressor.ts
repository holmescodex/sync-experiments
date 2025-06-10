import sharp from 'sharp'

export interface CompressionResult {
  originalSize: number
  compressedSize: number
  compressionRatio: number
  buffer: ArrayBuffer
  wasCompressed: boolean
}

export class ImageCompressor {
  private static readonly TARGET_MIN_SIZE = 100 * 1024 // 100KB
  private static readonly TARGET_MAX_SIZE = 200 * 1024 // 200KB
  private static readonly SKIP_THRESHOLD = 200 * 1024  // Don't compress if already under 200KB

  /**
   * Compress a JPEG image to target size range
   */
  static async compressJpeg(
    imageBuffer: ArrayBuffer,
    targetQuality?: number
  ): Promise<CompressionResult> {
    const originalSize = imageBuffer.byteLength
    
    // Skip compression if already small enough
    if (originalSize <= this.SKIP_THRESHOLD) {
      return {
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1.0,
        buffer: imageBuffer,
        wasCompressed: false
      }
    }

    try {
      // Create sharp instance from buffer
      const image = sharp(Buffer.from(imageBuffer))
      
      // Start with target quality or calculate initial quality
      let quality = targetQuality || this.calculateInitialQuality(originalSize)
      let compressedBuffer: ArrayBuffer
      let compressedSize: number

      // Try compression with initial quality
      compressedBuffer = await this.compressWithQuality(image, quality)
      compressedSize = compressedBuffer.byteLength

      // If still too large, reduce quality iteratively (but limit attempts for performance)
      let attempts = 0
      const maxAttempts = 5

      while (compressedSize > this.TARGET_MAX_SIZE && attempts < maxAttempts && quality > 5) {
        // More aggressive quality reduction for large files
        const reductionFactor = originalSize > 2 * 1024 * 1024 ? 0.6 : 0.8
        quality = Math.max(5, Math.floor(quality * reductionFactor))
        compressedBuffer = await this.compressWithQuality(image, quality)
        compressedSize = compressedBuffer.byteLength
        attempts++
      }

      // Skip quality improvement for very large original files to save time
      if (compressedSize < this.TARGET_MIN_SIZE && quality < 95 && originalSize < 1024 * 1024) {
        let improvementAttempts = 0
        const maxImprovementAttempts = 3

        while (compressedSize < this.TARGET_MIN_SIZE && 
               improvementAttempts < maxImprovementAttempts && 
               quality < 95) {
          const newQuality = Math.min(95, quality + 10)
          const testBuffer = await this.compressWithQuality(image, newQuality)
          
          if (testBuffer.byteLength <= this.TARGET_MAX_SIZE) {
            quality = newQuality
            compressedBuffer = testBuffer
            compressedSize = testBuffer.byteLength
          } else {
            break
          }
          improvementAttempts++
        }
      }

      const compressionRatio = compressedSize / originalSize

      return {
        originalSize,
        compressedSize,
        compressionRatio,
        buffer: compressedBuffer,
        wasCompressed: true
      }

    } catch (error) {
      console.warn('Image compression failed, returning original:', error)
      return {
        originalSize,
        compressedSize: originalSize,
        compressionRatio: 1.0,
        buffer: imageBuffer,
        wasCompressed: false
      }
    }
  }

  /**
   * Compress image with specific quality using Sharp
   */
  private static async compressWithQuality(image: sharp.Sharp, quality: number): Promise<ArrayBuffer> {
    const buffer = await image.clone().jpeg({ quality }).toBuffer()
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
  }

  /**
   * Calculate initial quality based on original file size
   */
  private static calculateInitialQuality(originalSize: number): number {
    if (originalSize > 5 * 1024 * 1024) { // > 5MB
      return 15
    } else if (originalSize > 2 * 1024 * 1024) { // > 2MB
      return 20
    } else if (originalSize > 1 * 1024 * 1024) { // > 1MB
      return 30
    } else if (originalSize > 500 * 1024) { // > 500KB
      return 50
    } else {
      return 70
    }
  }

  /**
   * Check if file is a JPEG based on buffer content
   */
  static isJpeg(buffer: ArrayBuffer): boolean {
    const uint8Array = new Uint8Array(buffer)
    
    // Check for JPEG magic numbers
    // JPEG files start with FF D8 and end with FF D9
    if (uint8Array.length < 4) return false
    
    const hasJpegStart = uint8Array[0] === 0xFF && uint8Array[1] === 0xD8
    return hasJpegStart
  }

  /**
   * Process file for compression - only compresses JPEGs
   */
  static async processFile(file: File): Promise<CompressionResult> {
    const buffer = await file.arrayBuffer()
    
    // Only compress JPEG files
    if (!this.isJpeg(buffer)) {
      return {
        originalSize: buffer.byteLength,
        compressedSize: buffer.byteLength,
        compressionRatio: 1.0,
        buffer,
        wasCompressed: false
      }
    }

    return this.compressJpeg(buffer)
  }

  /**
   * Get human-readable size string
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }
}