import { blake3 } from '@noble/hashes/blake3'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'

interface FileChunkResult {
  fileId: string
  totalDataChunks: number
  totalParityChunks: number
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
    is_parity: boolean
    covers_chunks?: number[] // For parity chunks, which data chunks they cover
  }>
}

interface SqlQuery {
  sql: string
  params: any[]
}

export interface ErasureCodingConfig {
  enabled: boolean
  parityMultiplier: number // 2x means 1 parity chunk per 2 data chunks
}

export class FileReassemblyErasure {
  private psk: Uint8Array
  private config: ErasureCodingConfig
  
  constructor(psk: Uint8Array, config: ErasureCodingConfig = { enabled: false, parityMultiplier: 2 }) {
    this.psk = psk
    this.config = config
  }

  /**
   * Chunk a file into 500-byte pieces with XOR-based erasure coding
   * For parityMultiplier=2, every 2 data chunks get 1 parity chunk
   */
  async chunkFile(
    fileData: Uint8Array, 
    fileName: string, 
    mimeType: string
  ): Promise<FileChunkResult> {
    // Generate file ID
    const fileId = Buffer.from(blake3(new TextEncoder().encode(`${fileName}-${Date.now()}-${Math.random()}`))).toString('hex').substring(0, 16)
    
    // Calculate number of data chunks (500 bytes per chunk)
    const chunkSize = 500
    const totalDataChunks = Math.ceil(fileData.length / chunkSize)
    
    // Create data chunks
    const dataChunks: Uint8Array[] = []
    for (let i = 0; i < totalDataChunks; i++) {
      const start = i * chunkSize
      const end = Math.min(start + chunkSize, fileData.length)
      const chunk = new Uint8Array(chunkSize) // Always use fixed size
      chunk.set(fileData.slice(start, end))
      dataChunks.push(chunk)
    }
    
    // Generate parity chunks if erasure coding is enabled
    const parityChunks: Array<{chunk: Uint8Array, covers: number[]}> = []
    let totalParityChunks = 0
    
    if (this.config.enabled && this.config.parityMultiplier > 0) {
      // Group size is the parityMultiplier (e.g., 2 data chunks per 1 parity chunk)
      const groupSize = Math.floor(this.config.parityMultiplier)
      
      for (let i = 0; i < totalDataChunks; i += groupSize) {
        const groupEnd = Math.min(i + groupSize, totalDataChunks)
        const groupChunks = dataChunks.slice(i, groupEnd)
        
        // Only create parity if we have at least 2 chunks in the group
        if (groupChunks.length >= 2) {
          const parityChunk = this.xorChunks(groupChunks)
          const covers = Array.from({length: groupChunks.length}, (_, idx) => i + idx)
          parityChunks.push({ chunk: parityChunk, covers })
          totalParityChunks++
        }
      }
    }
    
    // Create events for all chunks
    const events = []
    const timestamp = Date.now()
    
    // Process data chunks
    for (let i = 0; i < dataChunks.length; i++) {
      const event = await this.createChunkEvent(
        dataChunks[i],
        fileId,
        i,
        timestamp + i,
        false,
        undefined
      )
      events.push(event)
    }
    
    // Process parity chunks
    for (let i = 0; i < parityChunks.length; i++) {
      const { chunk, covers } = parityChunks[i]
      const chunkNo = totalDataChunks + i
      const event = await this.createChunkEvent(
        chunk,
        fileId,
        chunkNo,
        timestamp + chunkNo,
        true,
        covers
      )
      events.push(event)
    }
    
    return {
      fileId,
      totalDataChunks,
      totalParityChunks,
      totalChunks: totalDataChunks + totalParityChunks,
      events
    }
  }

  /**
   * Create a chunk event with encryption
   */
  private async createChunkEvent(
    chunk: Uint8Array,
    fileId: string,
    chunkNo: number,
    timestamp: number,
    isParity: boolean,
    coversChunks?: number[]
  ) {
    const prfTag = await this.computePRFTag(fileId, chunkNo, isParity)
    
    // Encrypt the chunk
    const nonce = crypto.getRandomValues(new Uint8Array(12))
    
    // Simple XOR encryption for simulation
    const ciphertext = new Uint8Array(chunk.length)
    for (let j = 0; j < chunk.length; j++) {
      ciphertext[j] = chunk[j] ^ this.psk[j % this.psk.length]
    }
    
    // Combine nonce + ciphertext + auth tag
    const authTag = hmac(sha256, this.psk, new Uint8Array([...nonce, ...ciphertext])).slice(0, 16)
    const encrypted = new Uint8Array([...nonce, ...ciphertext, ...authTag])
    
    // Generate event ID from ciphertext
    const eventId = Buffer.from(blake3(encrypted)).toString('hex')
    
    return {
      event_id: eventId,
      channel_id: 'general',
      authored_ts: timestamp,
      ciphertext: encrypted,
      file_id: fileId,
      chunk_no: chunkNo,
      prf_tag: prfTag,
      is_parity: isParity,
      covers_chunks: coversChunks
    }
  }

  /**
   * XOR multiple chunks together to create parity
   */
  private xorChunks(chunks: Uint8Array[]): Uint8Array {
    if (chunks.length === 0) throw new Error('No chunks to XOR')
    
    const result = new Uint8Array(chunks[0].length)
    
    for (const chunk of chunks) {
      for (let i = 0; i < chunk.length; i++) {
        result[i] ^= chunk[i]
      }
    }
    
    return result
  }

  /**
   * Compute PRF tag for a file chunk (includes parity flag)
   */
  async computePRFTag(fileId: string, chunkNo: number, isParity: boolean): Promise<string> {
    const input = new TextEncoder().encode(`${fileId}-${chunkNo}-${isParity ? 'P' : 'D'}`)
    const tag = hmac(sha256, this.psk, input)
    return Buffer.from(tag).toString('hex').substring(0, 32)
  }

  /**
   * Reassemble a file from chunks using XOR recovery if needed
   */
  async reassembleFile(
    fileId: string, 
    events: Array<{
      event_id: string
      ciphertext: Uint8Array
      file_id: string | null
      chunk_no: number | null
      prf_tag: string | null
      is_parity?: boolean
      covers_chunks?: number[]
    }>
  ): Promise<Uint8Array | null> {
    // Filter events for this file
    const fileEvents = events.filter(e => e.file_id === fileId)
    
    if (fileEvents.length === 0) {
      return null
    }
    
    // Sort by chunk number
    fileEvents.sort((a, b) => (a.chunk_no || 0) - (b.chunk_no || 0))
    
    // Separate data and parity chunks
    const dataEvents = fileEvents.filter(e => !e.is_parity)
    const parityEvents = fileEvents.filter(e => e.is_parity)
    
    // Get total chunks from the highest chunk numbers
    const maxDataChunk = Math.max(...dataEvents.map(e => e.chunk_no || 0))
    const totalDataChunks = maxDataChunk + 1
    
    // Verify PRF tags and decrypt chunks
    const decryptedDataChunks: (Uint8Array | null)[] = new Array(totalDataChunks).fill(null)
    const decryptedParityChunks: Map<number, { chunk: Uint8Array, covers: number[] }> = new Map()
    
    // Process data chunks
    for (const event of dataEvents) {
      if (event.chunk_no === null || event.prf_tag === null) continue
      
      // Verify PRF tag
      const expectedTag = await this.computePRFTag(fileId, event.chunk_no, false)
      if (event.prf_tag !== expectedTag) {
        // console.warn(`[FileReassemblyErasure] Invalid PRF tag for data chunk ${event.chunk_no}`)
        continue
      }
      
      // Decrypt the chunk
      const decrypted = await this.decryptChunk(event.ciphertext)
      if (!decrypted) {
        // console.warn(`[FileReassemblyErasure] Failed to decrypt data chunk ${event.chunk_no}`)
        continue
      }
      
      decryptedDataChunks[event.chunk_no] = decrypted
    }
    
    // Process parity chunks
    for (const event of parityEvents) {
      if (event.chunk_no === null || event.prf_tag === null) continue
      
      // Verify PRF tag
      const expectedTag = await this.computePRFTag(fileId, event.chunk_no, true)
      if (event.prf_tag !== expectedTag) {
        // console.warn(`[FileReassemblyErasure] Invalid PRF tag for parity chunk ${event.chunk_no}`)
        continue
      }
      
      // Decrypt the chunk
      const decrypted = await this.decryptChunk(event.ciphertext)
      if (!decrypted) {
        // console.warn(`[FileReassemblyErasure] Failed to decrypt parity chunk ${event.chunk_no}`)
        continue
      }
      
      if (event.covers_chunks) {
        decryptedParityChunks.set(event.chunk_no, { 
          chunk: decrypted, 
          covers: event.covers_chunks 
        })
      }
    }
    
    // Check for missing data chunks
    const missingDataChunks = []
    for (let i = 0; i < totalDataChunks; i++) {
      if (!decryptedDataChunks[i]) {
        missingDataChunks.push(i)
      }
    }
    
    if (missingDataChunks.length === 0) {
      // All data chunks present, no need for recovery
      return this.concatenateDataChunks(decryptedDataChunks as Uint8Array[])
    }
    
    // Try XOR recovery if we have parity chunks
    if (this.config.enabled && decryptedParityChunks.size > 0) {
      console.log(`[FileReassemblyErasure] Attempting XOR recovery for ${missingDataChunks.length} missing chunks`)
      
      // Build a map of which parity chunks can help with each missing chunk
      const recoveryMap = new Map<number, Array<{parityNo: number, parity: {chunk: Uint8Array, covers: number[]}}>>()
      
      for (const missingChunkNo of missingDataChunks) {
        recoveryMap.set(missingChunkNo, [])
        
        for (const [parityChunkNo, parityData] of decryptedParityChunks) {
          if (parityData.covers.includes(missingChunkNo)) {
            recoveryMap.get(missingChunkNo)!.push({ parityNo: parityChunkNo, parity: parityData })
          }
        }
      }
      
      // Try to recover each missing chunk
      let recovered = 0
      let madeProgress = true
      const recoveredDetails: string[] = []
      
      // Keep trying until we can't make more progress
      while (madeProgress && recovered < missingDataChunks.length) {
        madeProgress = false
        
        for (const [missingChunkNo, parityOptions] of recoveryMap) {
          if (decryptedDataChunks[missingChunkNo] !== null) continue // Already recovered
          
          // Try each parity option
          for (const { parityNo, parity } of parityOptions) {
            const otherChunks = parity.covers.filter(n => n !== missingChunkNo)
            const availableChunks = otherChunks.filter(n => decryptedDataChunks[n] !== null)
            
            if (availableChunks.length === otherChunks.length) {
              // We can recover this chunk!
              const chunksToXor = [parity.chunk]
              for (const chunkNo of otherChunks) {
                chunksToXor.push(decryptedDataChunks[chunkNo]!)
              }
              
              decryptedDataChunks[missingChunkNo] = this.xorChunks(chunksToXor)
              recovered++
              madeProgress = true
              recoveredDetails.push(`chunk ${missingChunkNo} via parity ${parityNo}`)
              break
            }
          }
        }
      }
      
      // Log recovery summary
      if (recoveredDetails.length > 0) {
        console.log(`[FileReassemblyErasure] Recovered ${recovered} chunks: ${recoveredDetails.slice(0, 5).join(', ')}${recoveredDetails.length > 5 ? '...' : ''}`)
      }
      
      if (recovered === missingDataChunks.length) {
        // Successfully recovered all missing chunks
        return this.concatenateDataChunks(decryptedDataChunks as Uint8Array[])
      }
      
      console.warn(`[FileReassemblyErasure] Could only recover ${recovered} of ${missingDataChunks.length} missing chunks`)
    }
    
    // Not enough chunks to reconstruct
    console.warn(`[FileReassemblyErasure] Cannot reconstruct file: ${missingDataChunks.length} chunks missing`)
    return null
  }

  /**
   * Concatenate data chunks into final file
   */
  private concatenateDataChunks(chunks: Uint8Array[]): Uint8Array {
    // Find the actual file size by looking at the last chunk
    // The last chunk might have padding that we need to remove
    let totalLength = 0
    for (let i = 0; i < chunks.length - 1; i++) {
      totalLength += chunks[i].length
    }
    
    // For the last chunk, find where the padding starts
    const lastChunk = chunks[chunks.length - 1]
    let lastChunkSize = lastChunk.length
    for (let i = lastChunk.length - 1; i >= 0; i--) {
      if (lastChunk[i] !== 0) {
        lastChunkSize = i + 1
        break
      }
    }
    totalLength += lastChunkSize
    
    // Concatenate chunks
    const result = new Uint8Array(totalLength)
    let offset = 0
    
    for (let i = 0; i < chunks.length - 1; i++) {
      result.set(chunks[i], offset)
      offset += chunks[i].length
    }
    
    // Copy only the non-padded part of the last chunk
    result.set(lastChunk.subarray(0, lastChunkSize), offset)
    
    return result
  }

  /**
   * Decrypt a chunk (simplified for simulation)
   */
  private async decryptChunk(encrypted: Uint8Array): Promise<Uint8Array | null> {
    if (encrypted.length < 28) {
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
   * Get SQL query to fetch all chunks of a file (including parity)
   */
  getFileChunksQuery(fileId: string): SqlQuery {
    return {
      sql: `
        SELECT arrival_seq, event_id, channel_id, authored_ts, 
               ciphertext, file_id, chunk_no, prf_tag, is_parity, covers_chunks
        FROM events
        WHERE file_id = ?
        ORDER BY chunk_no ASC
      `.trim(),
      params: [fileId]
    }
  }

  /**
   * Get erasure coding status for a file
   */
  getFileErasureStatusQuery(fileId: string): SqlQuery {
    return {
      sql: `
        SELECT 
          COUNT(CASE WHEN is_parity = 0 THEN 1 END) as data_chunks_received,
          COUNT(CASE WHEN is_parity = 1 THEN 1 END) as parity_chunks_received,
          MAX(CASE WHEN is_parity = 0 THEN chunk_no END) + 1 as expected_data_chunks
        FROM events
        WHERE file_id = ?
      `.trim(),
      params: [fileId]
    }
  }
}