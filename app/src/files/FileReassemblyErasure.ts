import { blake3 } from '@noble/hashes/blake3'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'
import { encode as rsEncode, reconstruct as rsReconstruct } from 'wasm-reed-solomon-erasure'

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
      totalParityChunks = Math.floor(totalDataChunks / this.config.parityMultiplier)
      
      // Reed-Solomon library has a limit of 128 data shards
      // Process in groups if we have too many chunks
      const MAX_SHARDS_PER_GROUP = 128 // Tested limit for wasm-reed-solomon-erasure
      
      if (totalParityChunks > 0) {
        if (totalDataChunks <= MAX_SHARDS_PER_GROUP) {
          // Process all chunks at once if under the limit
          try {
            const encodedShards = rsEncode(dataChunks, totalParityChunks)
            
            for (let i = 0; i < totalParityChunks; i++) {
              parityChunks.push(encodedShards[totalDataChunks + i])
            }
          } catch (error) {
            console.warn('[FileReassemblyErasure] Failed to generate parity chunks:', error)
            totalParityChunks = 0
            parityChunks = []
          }
        } else {
          // For large files, create parity chunks for smaller groups
          // We need to ensure that data chunks + parity chunks <= 255 (library limit)
          // With 2x multiplier, we need data chunks * 1.5 <= 255, so max ~85 data chunks per group
          console.log(`[FileReassemblyErasure] File has ${totalDataChunks} chunks, exceeding RS limit of ${MAX_SHARDS_PER_GROUP}. Using grouped parity.`)
          
          // Calculate max data chunks per group considering parity overhead
          // For 2x multiplier: data + (data/2) must be < 128
          // To be safe, let's use 80 data chunks which gives 40 parity = 120 total
          const maxDataPerGroup = 80 // Conservative limit to ensure total shards < 128
          const numGroups = Math.ceil(totalDataChunks / maxDataPerGroup)
          const baseGroupSize = Math.floor(totalDataChunks / numGroups)
          const remainder = totalDataChunks % numGroups
          
          let processedChunks = 0
          
          for (let g = 0; g < numGroups; g++) {
            // Distribute remainder chunks evenly among first groups
            const groupSize = baseGroupSize + (g < remainder ? 1 : 0)
            const startIdx = processedChunks
            const endIdx = startIdx + groupSize
            const groupChunks = dataChunks.slice(startIdx, endIdx)
            const groupParityCount = Math.floor(groupChunks.length / this.config.parityMultiplier)
            
            if (groupParityCount > 0 && groupChunks.length > 0) {
              try {
                // Log detailed info for debugging
                const totalShards = groupChunks.length + groupParityCount
                if (g === numGroups - 1 || totalShards > 120) {
                  console.log(`[FileReassemblyErasure] Group ${g} (detailed): ${groupChunks.length} data + ${groupParityCount} parity = ${totalShards} total shards`)
                }
                
                const encodedShards = rsEncode(groupChunks, groupParityCount)
                
                for (let i = 0; i < groupParityCount; i++) {
                  parityChunks.push(encodedShards[groupChunks.length + i])
                }
                
                console.log(`[FileReassemblyErasure] Group ${g}: ${groupChunks.length} data chunks → ${groupParityCount} parity chunks`)
              } catch (error) {
                console.error(`[FileReassemblyErasure] Failed to generate parity for group ${g}: data=${groupChunks.length}, parity=${groupParityCount}, total=${groupChunks.length + groupParityCount}`, error)
              }
            }
            
            processedChunks = endIdx
          }
          
          totalParityChunks = parityChunks.length
          console.log(`[FileReassemblyErasure] Total parity chunks generated: ${totalParityChunks}`)
        }
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
      console.log(`[FileReassemblyErasure] Attempting erasure recovery for ${missingDataChunks.length} missing chunks`)
      
      // For grouped parity, we need to reconstruct group by group
      const MAX_SHARDS_PER_GROUP = 128
      
      if (totalDataChunks <= MAX_SHARDS_PER_GROUP) {
        // Simple case: all chunks fit in one group
        try {
          // Find indices of missing chunks
          const deadShardIndexes: number[] = []
          for (let i = 0; i < decryptedChunks.length; i++) {
            if (!decryptedChunks[i]) {
              deadShardIndexes.push(i)
            }
          }
          
          // Get chunk size from any available chunk
          let chunkSize = 0
          for (const chunk of decryptedChunks) {
            if (chunk) {
              chunkSize = chunk.length
              break
            }
          }
          
          const shards = decryptedChunks.map(chunk => chunk || new Uint8Array(chunkSize))
          
          // Reconstruct missing chunks
          const reconstructed = rsReconstruct(
            shards, 
            totalParityChunks, 
            new Uint32Array(deadShardIndexes)
          )
          
          const dataChunks = reconstructed.slice(0, totalDataChunks) as Uint8Array[]
          return this.concatenateDataChunks(dataChunks)
        } catch (error) {
          console.error('[FileReassemblyErasure] Erasure decoding failed:', error)
          return null
        }
      } else {
        // Complex case: chunks are in multiple groups
        console.log(`[FileReassemblyErasure] Using grouped erasure recovery for large file`)
        
        // Calculate group structure (must match encoding)
        const maxDataPerGroup = 80 // Must match encoding logic
        const numGroups = Math.ceil(totalDataChunks / maxDataPerGroup)
        const baseGroupSize = Math.floor(totalDataChunks / numGroups)
        const remainder = totalDataChunks % numGroups
        
        const reconstructedDataChunks: (Uint8Array | null)[] = new Array(totalDataChunks)
        let processedDataChunks = 0
        let processedParityChunks = 0
        
        for (let g = 0; g < numGroups; g++) {
          const groupSize = baseGroupSize + (g < remainder ? 1 : 0)
          const groupStartIdx = processedDataChunks
          const groupEndIdx = groupStartIdx + groupSize
          const groupParityCount = Math.floor(groupSize / this.config.parityMultiplier)
          
          // Check if this group needs recovery
          const groupMissingIndices: number[] = []
          for (let i = groupStartIdx; i < groupEndIdx; i++) {
            if (!decryptedChunks[i]) {
              groupMissingIndices.push(i - groupStartIdx)
            }
          }
          
          if (groupMissingIndices.length === 0) {
            // No missing chunks in this group, just copy
            for (let i = groupStartIdx; i < groupEndIdx; i++) {
              reconstructedDataChunks[i] = decryptedChunks[i]
            }
          } else if (groupMissingIndices.length <= groupParityCount) {
            // Can recover this group
            try {
              // Prepare group shards (data + parity for this group)
              const groupShards: (Uint8Array | null)[] = []
              
              // Add data chunks for this group
              for (let i = groupStartIdx; i < groupEndIdx; i++) {
                groupShards.push(decryptedChunks[i])
              }
              
              // Add parity chunks for this group
              const parityStartIdx = totalDataChunks + processedParityChunks
              for (let i = 0; i < groupParityCount; i++) {
                groupShards.push(decryptedChunks[parityStartIdx + i])
              }
              
              // Get chunk size
              let chunkSize = 0
              for (const chunk of groupShards) {
                if (chunk) {
                  chunkSize = chunk.length
                  break
                }
              }
              
              // Find all missing indices in this group (including parity)
              const deadIndices: number[] = []
              for (let i = 0; i < groupShards.length; i++) {
                if (!groupShards[i]) {
                  deadIndices.push(i)
                }
              }
              
              // Replace nulls with empty arrays
              const shards = groupShards.map(chunk => chunk || new Uint8Array(chunkSize))
              
              // Reconstruct
              const reconstructed = rsReconstruct(
                shards,
                groupParityCount,
                new Uint32Array(deadIndices)
              )
              
              // Copy reconstructed data chunks
              for (let i = 0; i < groupSize; i++) {
                reconstructedDataChunks[groupStartIdx + i] = reconstructed[i]
              }
              
              console.log(`[FileReassemblyErasure] Recovered group ${g}: ${groupMissingIndices.length} missing chunks`)
            } catch (error) {
              console.error(`[FileReassemblyErasure] Failed to recover group ${g}:`, error)
              return null
            }
          } else {
            console.error(`[FileReassemblyErasure] Cannot recover group ${g}: ${groupMissingIndices.length} missing chunks but only ${groupParityCount} parity chunks`)
            return null
          }
          
          processedDataChunks = groupEndIdx
          processedParityChunks += groupParityCount
        }
        
        // Filter out any null values and concatenate
        const validChunks = reconstructedDataChunks.filter(chunk => chunk !== null) as Uint8Array[]
        if (validChunks.length === totalDataChunks) {
          return this.concatenateDataChunks(validChunks)
        } else {
          console.error('[FileReassemblyErasure] Failed to recover all chunks')
          return null
        }
      }
    }
    
    // Not enough chunks to reconstruct
    console.warn(`[FileReassemblyErasure] Cannot reconstruct file: ${missingDataChunks.length} chunks missing, only ${totalParityChunks} parity chunks available`)
    return null
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