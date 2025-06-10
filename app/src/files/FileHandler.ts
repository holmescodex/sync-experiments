// Use Web Crypto API for browser compatibility

export interface FileChunk {
  index: number
  prfTag: string
  encrypted: Uint8Array
}

export interface ChunkData {
  prfTag: string
  data: Uint8Array
}

export interface FileMetadata {
  fileId: string
  fileKey: Uint8Array
  chunkCount: number
  chunkSize: number
  mimeType: string
  fileName?: string
}

export class FileHandler {
  private readonly CHUNK_SIZE = 500 // 500 bytes per chunk
  private readonly KEY_SIZE = 32 // 256 bits
  private readonly NONCE_SIZE = 12 // 96 bits for AEAD
  
  /**
   * Generate a random file key for encryption
   */
  generateFileKey(): Uint8Array {
    const key = new Uint8Array(this.KEY_SIZE)
    crypto.getRandomValues(key)
    return key
  }
  
  /**
   * Compute PRF tag for a chunk using simple hash (TEMPORARY - should move to backend)
   * TODO: Move ALL crypto operations to Node.js backend as per plan-of-attack.md
   */
  computePrfTag(fileKey: Uint8Array, index: number): string {
    // TEMPORARY simple hash for simulation - NOT cryptographically secure
    let hash = 0
    
    // Hash the file key
    for (let i = 0; i < fileKey.length; i++) {
      hash = ((hash << 5) - hash + fileKey[i]) & 0xffffffff
    }
    
    // Mix in the index
    hash = ((hash << 5) - hash + index) & 0xffffffff
    
    // Convert to hex string
    return Math.abs(hash).toString(16).padStart(8, '0')
  }
  
  /**
   * Encrypt a chunk using AEAD (simplified for simulation)
   * In production, use proper AEAD like AES-GCM
   */
  private encryptChunk(fileKey: Uint8Array, chunk: Uint8Array, index: number): Uint8Array {
    // For simulation, we'll use a simple XOR with expanded key
    // In production, use crypto.createCipheriv with AES-256-GCM
    
    // Create nonce from index
    const nonce = Buffer.alloc(this.NONCE_SIZE)
    nonce.writeUInt32BE(index, 0)
    
    // Simplified encryption: prepend index, then XOR with key stream
    const encrypted = new Uint8Array(4 + chunk.length)
    const view = new DataView(encrypted.buffer)
    view.setUint32(0, index, false) // big-endian
    
    // XOR each byte with key stream (simplified)
    for (let i = 0; i < chunk.length; i++) {
      const keyByte = fileKey[(i + index) % fileKey.length]
      encrypted[4 + i] = chunk[i] ^ keyByte
    }
    
    return encrypted
  }
  
  /**
   * Decrypt a chunk (simplified for simulation)
   */
  private decryptChunk(fileKey: Uint8Array, encrypted: Uint8Array): { index: number, data: Uint8Array } | null {
    if (encrypted.length < 4) return null
    
    // Extract index
    const view = new DataView(encrypted.buffer, encrypted.byteOffset, encrypted.byteLength)
    const index = view.getUint32(0, false) // big-endian
    
    // Decrypt data
    const data = new Uint8Array(encrypted.length - 4)
    for (let i = 0; i < data.length; i++) {
      const keyByte = fileKey[(i + index) % fileKey.length]
      data[i] = encrypted[4 + i] ^ keyByte
    }
    
    return { index, data }
  }
  
  /**
   * Split a file into chunks and encrypt them
   */
  async chunkFile(data: Uint8Array, fileKey: Uint8Array): Promise<{
    fileId: string,
    chunks: FileChunk[]
  }> {
    const chunks: FileChunk[] = []
    const plainChunks: Uint8Array[] = []
    
    // Split into chunks
    for (let i = 0; i < data.length; i += this.CHUNK_SIZE) {
      const end = Math.min(i + this.CHUNK_SIZE, data.length)
      const chunk = data.slice(i, end)
      plainChunks.push(chunk)
      
      const index = Math.floor(i / this.CHUNK_SIZE)
      const prfTag = this.computePrfTag(fileKey, index)
      const encrypted = this.encryptChunk(fileKey, chunk, index)
      
      chunks.push({ index, prfTag, encrypted })
    }
    
    // Compute file ID as simple hash of all plain chunks (TEMPORARY)
    // TODO: Move to proper SHA-256 in Node.js backend
    let fileHash = 0
    for (const chunk of plainChunks) {
      for (let i = 0; i < chunk.length; i++) {
        fileHash = ((fileHash << 5) - fileHash + chunk[i]) & 0xffffffff
      }
    }
    const fileId = Math.abs(fileHash).toString(16).padStart(8, '0')
    
    return { fileId, chunks }
  }
  
  /**
   * Reassemble file from chunks (handles any order)
   */
  async assembleFile(
    chunks: ChunkData[],
    fileKey: Uint8Array,
    expectedFileId: string,
    expectedChunkCount: number
  ): Promise<Uint8Array | null> {
    // Create a map to store decrypted chunks by index
    const chunkMap = new Map<number, Uint8Array>()
    const expectedIndices = new Set<number>()
    
    // Generate expected PRF tags
    for (let i = 0; i < expectedChunkCount; i++) {
      expectedIndices.add(i)
    }
    
    // Process each chunk
    for (const chunk of chunks) {
      // Try to decrypt the chunk
      const decrypted = this.decryptChunk(fileKey, chunk.data)
      if (!decrypted) continue
      
      // Verify the PRF tag matches
      const expectedTag = this.computePrfTag(fileKey, decrypted.index)
      if (expectedTag !== chunk.prfTag) {
        // False positive - PRF tag collision but wrong key
        continue
      }
      
      // Verify index is in expected range
      if (decrypted.index >= expectedChunkCount) {
        continue
      }
      
      // Store the chunk
      chunkMap.set(decrypted.index, decrypted.data)
    }
    
    // Check if we have all chunks
    if (chunkMap.size !== expectedChunkCount) {
      return null // Missing chunks
    }
    
    // Reassemble in order
    const totalLength = Array.from(chunkMap.values()).reduce((sum, chunk) => sum + chunk.length, 0)
    const assembled = new Uint8Array(totalLength)
    
    let offset = 0
    for (let i = 0; i < expectedChunkCount; i++) {
      const chunk = chunkMap.get(i)
      if (!chunk) return null // Missing chunk
      
      assembled.set(chunk, offset)
      offset += chunk.length
    }
    
    // Verify file ID (TEMPORARY simple hash)
    // TODO: Move to proper SHA-256 in Node.js backend
    let actualHash = 0
    for (let i = 0; i < assembled.length; i++) {
      actualHash = ((actualHash << 5) - actualHash + assembled[i]) & 0xffffffff
    }
    const actualFileId = Math.abs(actualHash).toString(16).padStart(8, '0')
    
    if (actualFileId !== expectedFileId) {
      return null // Corrupted or wrong file
    }
    
    return assembled
  }
  
  /**
   * Create file metadata for a message attachment
   */
  createFileMetadata(
    fileId: string,
    fileKey: Uint8Array,
    chunkCount: number,
    mimeType: string,
    fileName?: string
  ): FileMetadata {
    return {
      fileId,
      fileKey,
      chunkCount,
      chunkSize: this.CHUNK_SIZE,
      mimeType,
      fileName
    }
  }
  
  /**
   * Get required PRF tags for a file
   */
  getRequiredPrfTags(fileKey: Uint8Array, chunkCount: number): string[] {
    const tags: string[] = []
    for (let i = 0; i < chunkCount; i++) {
      tags.push(this.computePrfTag(fileKey, i))
    }
    return tags
  }
  
  /**
   * Check if we have all chunks for a file
   */
  hasAllChunks(receivedChunks: Set<string>, fileKey: Uint8Array, chunkCount: number): boolean {
    const requiredTags = this.getRequiredPrfTags(fileKey, chunkCount)
    return requiredTags.every(tag => receivedChunks.has(tag))
  }
}