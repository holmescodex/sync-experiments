import { blake3 } from '@noble/hashes/blake3'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'

interface FileChunkResult {
  fileId: string
  totalChunks: number
  events: Array<{
    arrival_seq?: number
    event_id: string
    channel_id: string
    authored_ts: number
    ciphertext: Uint8Array
    file_id: string
    chunk_no: number
    prf_tag: string
  }>
}

interface SqlQuery {
  sql: string
  params: any[]
}

export class FileReassembly {
  private psk: Uint8Array
  
  constructor(psk: Uint8Array) {
    this.psk = psk
  }

  /**
   * Chunk a file into 500-byte pieces with AEAD encryption
   */
  async chunkFile(
    fileData: Uint8Array, 
    fileName: string, 
    mimeType: string
  ): Promise<FileChunkResult> {
    // Generate file ID
    const fileId = Buffer.from(blake3(new TextEncoder().encode(`${fileName}-${Date.now()}-${Math.random()}`))).toString('hex').substring(0, 16)
    
    // Calculate number of chunks (500 bytes per chunk)
    const chunkSize = 500
    const totalChunks = Math.ceil(fileData.length / chunkSize)
    
    const events = []
    const timestamp = Date.now()
    
    for (let i = 0; i < totalChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, fileData.length)
      const chunk = fileData.slice(start, end)
      
      // Generate PRF tag for this chunk
      const prfTag = await this.computePRFTag(fileId, i)
      
      // For 500-byte chunks, we only encrypt the raw chunk data
      // Metadata goes in the database columns unencrypted
      const nonce = crypto.getRandomValues(new Uint8Array(12))
      const plaintext = chunk
      
      // Simple XOR encryption for simulation (in real implementation, use proper AEAD)
      const ciphertext = new Uint8Array(plaintext.length)
      for (let j = 0; j < plaintext.length; j++) {
        ciphertext[j] = plaintext[j] ^ this.psk[j % this.psk.length]
      }
      
      // Combine nonce + ciphertext + auth tag (simplified - just use first 16 bytes of HMAC)
      const authTag = hmac(sha256, this.psk, new Uint8Array([...nonce, ...ciphertext])).slice(0, 16)
      const encrypted = new Uint8Array([...nonce, ...ciphertext, ...authTag])
      
      // Generate event ID from ciphertext
      const eventId = Buffer.from(blake3(encrypted)).toString('hex')
      
      events.push({
        event_id: eventId,
        channel_id: 'general',
        authored_ts: timestamp + i, // Slightly offset timestamps
        ciphertext: encrypted,
        file_id: fileId,
        chunk_no: i,
        prf_tag: prfTag
      })
    }
    
    return {
      fileId,
      totalChunks,
      events
    }
  }

  /**
   * Compute PRF tag for a file chunk
   */
  async computePRFTag(fileId: string, chunkNo: number): Promise<string> {
    const input = new TextEncoder().encode(`${fileId}-${chunkNo}`)
    const tag = hmac(sha256, this.psk, input)
    return Buffer.from(tag).toString('hex').substring(0, 32) // 16 bytes hex
  }

  /**
   * Reassemble a file from chunks
   */
  async reassembleFile(
    fileId: string, 
    events: Array<{
      event_id: string
      ciphertext: Uint8Array
      file_id: string | null
      chunk_no: number | null
      prf_tag: string | null
    }>
  ): Promise<Uint8Array | null> {
    // Filter events for this file
    const fileEvents = events.filter(e => e.file_id === fileId)
    
    if (fileEvents.length === 0) {
      return null
    }
    
    // Sort by chunk number
    fileEvents.sort((a, b) => (a.chunk_no || 0) - (b.chunk_no || 0))
    
    // Verify we have all chunks and PRF tags are valid
    let totalChunks = 0
    const chunks: Uint8Array[] = []
    
    for (const event of fileEvents) {
      if (event.chunk_no === null || event.prf_tag === null) {
        return null
      }
      
      // Verify PRF tag
      const expectedTag = await this.computePRFTag(fileId, event.chunk_no)
      if (event.prf_tag !== expectedTag) {
        return null
      }
      
      // Decrypt the chunk
      const decrypted = await this.decryptChunk(event.ciphertext)
      if (!decrypted) {
        return null
      }
      
      // The decrypted data IS the chunk data (no JSON wrapping)
      chunks[event.chunk_no] = decrypted
    }
    
    // Get total chunks from the highest chunk number + 1
    totalChunks = Math.max(...fileEvents.map(e => e.chunk_no || 0)) + 1
    
    // Verify we have all chunks
    for (let i = 0; i < totalChunks; i++) {
      if (!chunks[i]) {
        return null
      }
    }
    
    // Concatenate all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
    const result = new Uint8Array(totalLength)
    let offset = 0
    
    for (const chunk of chunks) {
      result.set(chunk, offset)
      offset += chunk.length
    }
    
    return result
  }

  /**
   * Decrypt a chunk (simplified for simulation)
   */
  private async decryptChunk(encrypted: Uint8Array): Promise<Uint8Array | null> {
    if (encrypted.length < 28) { // 12 byte nonce + at least 1 byte + 16 byte tag
      return null
    }
    
    const nonce = encrypted.slice(0, 12)
    const ciphertext = encrypted.slice(12, -16)
    const authTag = encrypted.slice(-16)
    
    // Verify auth tag
    const expectedTag = hmac(sha256, this.psk, new Uint8Array([...nonce, ...ciphertext])).slice(0, 16)
    if (!this.constantTimeEqual(authTag, expectedTag)) {
      return null
    }
    
    // Decrypt (simple XOR for simulation)
    const plaintext = new Uint8Array(ciphertext.length)
    for (let i = 0; i < ciphertext.length; i++) {
      plaintext[i] = ciphertext[i] ^ this.psk[i % this.psk.length]
    }
    
    return plaintext
  }

  /**
   * Constant time comparison
   */
  private constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false
    let result = 0
    for (let i = 0; i < a.length; i++) {
      result |= a[i] ^ b[i]
    }
    return result === 0
  }

  /**
   * Get SQL query to fetch all chunks of a file
   */
  getFileChunksQuery(fileId: string): SqlQuery {
    return {
      sql: `
        SELECT arrival_seq, event_id, channel_id, authored_ts, 
               ciphertext, file_id, chunk_no, prf_tag
        FROM events
        WHERE file_id = ?
        ORDER BY chunk_no ASC
      `.trim(),
      params: [fileId]
    }
  }

  /**
   * Get SQL query to fetch a specific chunk
   */
  getSpecificChunkQuery(fileId: string, chunkNo: number): SqlQuery {
    return {
      sql: `
        SELECT arrival_seq, event_id, channel_id, authored_ts,
               ciphertext, file_id, chunk_no, prf_tag
        FROM events
        WHERE file_id = ? AND chunk_no = ?
      `.trim(),
      params: [fileId, chunkNo]
    }
  }

  /**
   * Get SQL query to check file completeness
   */
  getFileCompletenessQuery(fileId: string): SqlQuery {
    return {
      sql: `
        SELECT COUNT(DISTINCT chunk_no) as chunks_received,
               MAX(chunk_no) + 1 as expected_chunks
        FROM events
        WHERE file_id = ?
      `.trim(),
      params: [fileId]
    }
  }
}