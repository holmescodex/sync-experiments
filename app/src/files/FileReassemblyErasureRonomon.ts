import { blake3 } from '@noble/hashes/blake3'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'
const ReedSolomon = require('@ronomon/reed-solomon')

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
  }>
}

interface SqlQuery {
  sql: string
  params: any[]
}

export interface ErasureCodingConfig {
  enabled: boolean
  parityMultiplier: number // 2x means 1 parity chunk per data chunk
}

export class FileReassemblyErasure {
  private psk: Uint8Array
  private config: ErasureCodingConfig
  private static readonly MAX_DATA_SHARDS = 20 // ronomon/reed-solomon limit
  private static readonly MAX_PARITY_SHARDS = 4 // ronomon/reed-solomon limit
  
  constructor(psk: Uint8Array, config: ErasureCodingConfig = { enabled: false, parityMultiplier: 2 }) {
    this.psk = psk
    this.config = config
  }

  /**
   * Chunk a file into 500-byte pieces with optional erasure coding
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
      const chunk = fileData.slice(start, end)
      
      // Pad the last chunk if necessary
      if (chunk.length < chunkSize && i < totalDataChunks - 1) {
        const paddedChunk = new Uint8Array(chunkSize)
        paddedChunk.set(chunk)
        dataChunks.push(paddedChunk)
      } else {
        dataChunks.push(chunk)
      }
    }
    
    // Generate parity chunks if erasure coding is enabled
    let parityChunks: Uint8Array[] = []
    let totalParityChunks = 0
    
    if (this.config.enabled) {
      // For 2x multiplier, create as many parity chunks as data chunks
      const desiredParityChunks = Math.floor(totalDataChunks / this.config.parityMultiplier)
      
      if (desiredParityChunks > 0) {
        // Process in groups due to library limitations
        const groups = this.calculateGroups(totalDataChunks, desiredParityChunks)
        
        for (const group of groups) {
          const groupDataChunks = dataChunks.slice(group.dataStart, group.dataEnd)
          const groupParityChunks = await this.encodeGroup(groupDataChunks, group.parityCount, chunkSize)
          parityChunks.push(...groupParityChunks)
        }
        
        totalParityChunks = parityChunks.length
        console.log(`[FileReassemblyErasure] Generated ${totalParityChunks} parity chunks from ${totalDataChunks} data chunks`)
      }
    }
    
    // Create events for all chunks (data + parity)
    const events = []
    const timestamp = Date.now()
    
    // Process data chunks
    for (let i = 0; i < dataChunks.length; i++) {
      const chunk = dataChunks[i]
      const prfTag = await this.computePRFTag(fileId, i, false)
      
      // Encrypt the chunk
      const nonce = crypto.getRandomValues(new Uint8Array(12))
      const plaintext = chunk
      
      // Simple XOR encryption for simulation
      const ciphertext = new Uint8Array(plaintext.length)
      for (let j = 0; j < plaintext.length; j++) {
        ciphertext[j] = plaintext[j] ^ this.psk[j % this.psk.length]
      }
      
      // Combine nonce + ciphertext + auth tag
      const authTag = hmac(sha256, this.psk, new Uint8Array([...nonce, ...ciphertext])).slice(0, 16)
      const encrypted = new Uint8Array([...nonce, ...ciphertext, ...authTag])
      
      // Generate event ID from ciphertext
      const eventId = Buffer.from(blake3(encrypted)).toString('hex')
      
      events.push({
        event_id: eventId,
        channel_id: 'general',
        authored_ts: timestamp + i,
        ciphertext: encrypted,
        file_id: fileId,
        chunk_no: i,
        prf_tag: prfTag,
        is_parity: false
      })
    }
    
    // Process parity chunks
    for (let i = 0; i < parityChunks.length; i++) {
      const chunk = parityChunks[i]
      const chunkNo = totalDataChunks + i
      const prfTag = await this.computePRFTag(fileId, chunkNo, true)
      
      // Encrypt the parity chunk
      const nonce = crypto.getRandomValues(new Uint8Array(12))
      const plaintext = chunk
      
      const ciphertext = new Uint8Array(plaintext.length)
      for (let j = 0; j < plaintext.length; j++) {
        ciphertext[j] = plaintext[j] ^ this.psk[j % this.psk.length]
      }
      
      const authTag = hmac(sha256, this.psk, new Uint8Array([...nonce, ...ciphertext])).slice(0, 16)
      const encrypted = new Uint8Array([...nonce, ...ciphertext, ...authTag])
      
      const eventId = Buffer.from(blake3(encrypted)).toString('hex')
      
      events.push({
        event_id: eventId,
        channel_id: 'general',
        authored_ts: timestamp + chunkNo,
        ciphertext: encrypted,
        file_id: fileId,
        chunk_no: chunkNo,
        prf_tag: prfTag,
        is_parity: true
      })
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
   * Calculate groups for encoding based on library limitations
   */
  private calculateGroups(totalDataChunks: number, desiredParityChunks: number): Array<{
    dataStart: number
    dataEnd: number
    parityCount: number
  }> {
    const groups = []
    
    // Simple strategy: use max data shards per group with proportional parity
    let remainingData = totalDataChunks
    let remainingParity = desiredParityChunks
    let dataStart = 0
    
    while (remainingData > 0) {
      // Calculate this group size
      const groupDataSize = Math.min(remainingData, FileReassemblyErasure.MAX_DATA_SHARDS)
      const groupParitySize = Math.min(
        Math.ceil((groupDataSize / totalDataChunks) * desiredParityChunks),
        FileReassemblyErasure.MAX_PARITY_SHARDS,
        remainingParity
      )
      
      groups.push({
        dataStart,
        dataEnd: dataStart + groupDataSize,
        parityCount: groupParitySize
      })
      
      dataStart += groupDataSize
      remainingData -= groupDataSize
      remainingParity -= groupParitySize
    }
    
    return groups
  }

  /**
   * Encode a group of data chunks to produce parity chunks
   */
  private async encodeGroup(dataChunks: Uint8Array[], parityCount: number, chunkSize: number): Promise<Uint8Array[]> {
    return new Promise((resolve, reject) => {
      if (dataChunks.length === 0 || parityCount === 0) {
        resolve([])
        return
      }
      
      const k = dataChunks.length
      const m = parityCount
      
      // Create encoding context
      const context = ReedSolomon.create(k, m)
      
      // Ensure all chunks are the same size (pad if necessary)
      const paddedSize = Math.ceil(chunkSize / 8) * 8 // Must be multiple of 8
      const paddedChunks = dataChunks.map(chunk => {
        if (chunk.length === paddedSize) {
          return chunk
        }
        const padded = new Uint8Array(paddedSize)
        padded.set(chunk)
        return padded
      })
      
      // Create buffer containing all data shards
      const buffer = Buffer.alloc(paddedSize * k)
      for (let i = 0; i < k; i++) {
        buffer.set(paddedChunks[i], i * paddedSize)
      }
      
      // Create buffer for parity shards
      const parity = Buffer.alloc(paddedSize * m)
      
      // Mark all data shards as sources
      let sources = 0
      for (let i = 0; i < k; i++) {
        sources |= (1 << i)
      }
      
      // Mark all parity shards as targets
      let targets = 0
      for (let i = k; i < k + m; i++) {
        targets |= (1 << i)
      }
      
      // Encode parity shards
      ReedSolomon.encode(
        context,
        sources,
        targets,
        buffer,
        0,
        buffer.length,
        parity,
        0,
        parity.length,
        (error: any) => {
          if (error) {
            reject(error)
            return
          }
          
          // Extract parity shards and trim to original chunk size
          const parityChunks: Uint8Array[] = []
          for (let i = 0; i < m; i++) {
            const parityChunk = new Uint8Array(chunkSize)
            const paddedParity = parity.subarray(i * paddedSize, (i + 1) * paddedSize)
            parityChunk.set(paddedParity.subarray(0, chunkSize))
            parityChunks.push(parityChunk)
          }
          
          resolve(parityChunks)
        }
      )
    })
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
   * Reassemble a file from chunks using erasure coding if needed
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
    const totalParityChunks = parityEvents.length
    
    // Verify PRF tags and decrypt chunks
    const decryptedChunks: (Uint8Array | null)[] = new Array(totalDataChunks + totalParityChunks).fill(null)
    
    for (const event of fileEvents) {
      if (event.chunk_no === null || event.prf_tag === null) {
        continue
      }
      
      // Verify PRF tag
      const isParity = event.chunk_no >= totalDataChunks
      const expectedTag = await this.computePRFTag(fileId, event.chunk_no, isParity)
      if (event.prf_tag !== expectedTag) {
        console.warn(`[FileReassemblyErasure] Invalid PRF tag for chunk ${event.chunk_no}`)
        continue
      }
      
      // Decrypt the chunk
      const decrypted = await this.decryptChunk(event.ciphertext)
      if (!decrypted) {
        console.warn(`[FileReassemblyErasure] Failed to decrypt chunk ${event.chunk_no}`)
        continue
      }
      
      decryptedChunks[event.chunk_no] = decrypted
    }
    
    // Check if we have all data chunks
    const missingDataChunks = []
    for (let i = 0; i < totalDataChunks; i++) {
      if (!decryptedChunks[i]) {
        missingDataChunks.push(i)
      }
    }
    
    if (missingDataChunks.length === 0) {
      // All data chunks present, no need for erasure decoding
      return this.concatenateDataChunks(decryptedChunks.slice(0, totalDataChunks) as Uint8Array[])
    }
    
    // Try erasure decoding if we have enough chunks
    if (this.config.enabled && totalParityChunks > 0 && missingDataChunks.length <= totalParityChunks) {
      try {
        console.log(`[FileReassemblyErasure] Attempting erasure recovery for ${missingDataChunks.length} missing chunks`)
        
        // Determine which groups need recovery
        const groups = this.calculateGroups(totalDataChunks, totalParityChunks)
        const recoveredChunks = [...decryptedChunks]
        
        let parityOffset = totalDataChunks
        for (const group of groups) {
          const groupData = recoveredChunks.slice(group.dataStart, group.dataEnd)
          const groupParity = recoveredChunks.slice(parityOffset, parityOffset + group.parityCount)
          
          // Check if this group needs recovery
          const missingInGroup = []
          for (let i = 0; i < groupData.length; i++) {
            if (!groupData[i]) {
              missingInGroup.push(i)
            }
          }
          
          if (missingInGroup.length > 0 && missingInGroup.length <= group.parityCount) {
            // Recover this group
            const recovered = await this.recoverGroup(
              groupData,
              groupParity,
              missingInGroup,
              group.dataStart
            )
            
            // Update recovered chunks
            for (let i = 0; i < recovered.length; i++) {
              recoveredChunks[group.dataStart + i] = recovered[i]
            }
          }
          
          parityOffset += group.parityCount
        }
        
        // Return recovered data
        const dataChunks = recoveredChunks.slice(0, totalDataChunks) as Uint8Array[]
        if (dataChunks.every(chunk => chunk !== null)) {
          return this.concatenateDataChunks(dataChunks)
        }
      } catch (error) {
        console.error('[FileReassemblyErasure] Erasure decoding failed:', error)
      }
    }
    
    // Not enough chunks to reconstruct
    console.warn(`[FileReassemblyErasure] Cannot reconstruct file: ${missingDataChunks.length} chunks missing, only ${totalParityChunks} parity chunks available`)
    return null
  }

  /**
   * Recover missing chunks in a group
   */
  private async recoverGroup(
    dataChunks: (Uint8Array | null)[],
    parityChunks: (Uint8Array | null)[],
    missingIndices: number[],
    groupOffset: number
  ): Promise<Uint8Array[]> {
    return new Promise((resolve, reject) => {
      const k = dataChunks.length
      const m = parityChunks.length
      
      if (m === 0) {
        reject(new Error('No parity chunks available'))
        return
      }
      
      // Create encoding context
      const context = ReedSolomon.create(k, m)
      
      // Determine chunk size from any available chunk
      let chunkSize = 0
      for (const chunk of [...dataChunks, ...parityChunks]) {
        if (chunk) {
          chunkSize = chunk.length
          break
        }
      }
      
      // Pad size to multiple of 8
      const paddedSize = Math.ceil(chunkSize / 8) * 8
      
      // Combine data and parity into single buffer
      const buffer = Buffer.alloc(paddedSize * k)
      const parity = Buffer.alloc(paddedSize * m)
      
      // Fill buffers and track sources/targets
      let sources = 0
      let targets = 0
      
      // Process data chunks
      for (let i = 0; i < k; i++) {
        if (dataChunks[i]) {
          const padded = new Uint8Array(paddedSize)
          padded.set(dataChunks[i]!)
          buffer.set(padded, i * paddedSize)
          sources |= (1 << i)
        } else {
          targets |= (1 << i)
        }
      }
      
      // Process parity chunks
      for (let i = 0; i < m; i++) {
        if (parityChunks[i]) {
          const padded = new Uint8Array(paddedSize)
          padded.set(parityChunks[i]!)
          parity.set(padded, i * paddedSize)
          sources |= (1 << (k + i))
        } else {
          targets |= (1 << (k + i))
        }
      }
      
      // Reconstruct missing chunks
      ReedSolomon.encode(
        context,
        sources,
        targets,
        buffer,
        0,
        buffer.length,
        parity,
        0,
        parity.length,
        (error: any) => {
          if (error) {
            reject(error)
            return
          }
          
          // Extract recovered data chunks
          const recovered: Uint8Array[] = []
          for (let i = 0; i < k; i++) {
            const chunk = new Uint8Array(chunkSize)
            const paddedChunk = buffer.subarray(i * paddedSize, (i + 1) * paddedSize)
            chunk.set(paddedChunk.subarray(0, chunkSize))
            recovered.push(chunk)
          }
          
          resolve(recovered)
        }
      )
    })
  }

  /**
   * Concatenate data chunks into final file
   */
  private concatenateDataChunks(chunks: Uint8Array[]): Uint8Array {
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
               ciphertext, file_id, chunk_no, prf_tag, is_parity
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