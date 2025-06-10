import { FileHandler, type FileChunk, type ChunkData } from './FileHandler'
import type { DeviceDB } from '../storage/device-db'
import type { NetworkSimulator } from '../network/simulator'

export interface FileChunkEvent {
  type: 'file_chunk'
  prfTag: string
  encryptedData: Uint8Array
  timestamp: number
}

export interface FileMessageAttachment {
  fileId: string
  fileKey: Uint8Array
  mimeType: string
  chunkCount: number
  fileName?: string
}

export class FileChunkHandler {
  private fileHandler: FileHandler
  private deviceId: string
  private db: DeviceDB
  private networkSimulator: NetworkSimulator
  private chunkCache: Map<string, ChunkData> = new Map()
  private fileDownloads: Map<string, {
    metadata: FileMessageAttachment,
    receivedChunks: Set<string>,
    startTime: number
  }> = new Map()
  
  constructor(
    deviceId: string,
    db: DeviceDB,
    networkSimulator: NetworkSimulator
  ) {
    this.deviceId = deviceId
    this.db = db
    this.networkSimulator = networkSimulator
    this.fileHandler = new FileHandler()
  }
  
  /**
   * Process a file for upload, chunk it, and store chunks as events
   */
  async uploadFile(
    fileData: Uint8Array,
    mimeType: string,
    fileName?: string
  ): Promise<FileMessageAttachment> {
    // Generate file key
    const fileKey = this.fileHandler.generateFileKey()
    
    // Chunk the file
    const { fileId, chunks } = await this.fileHandler.chunkFile(fileData, fileKey)
    
    // Store each chunk as an event in the database
    for (const chunk of chunks) {
      await this.storeChunkAsEvent(chunk)
    }
    
    // Broadcast chunks to peers
    for (const chunk of chunks) {
      this.broadcastChunk(chunk)
    }
    
    // Return attachment metadata for the message
    return {
      fileId,
      fileKey,
      mimeType,
      chunkCount: chunks.length,
      fileName
    }
  }
  
  /**
   * Store a chunk as an event in the database
   */
  private async storeChunkAsEvent(chunk: FileChunk): Promise<void> {
    const timestamp = Date.now()
    
    // Create event payload with chunk data embedded
    const payload = {
      type: 'file_chunk',
      prfTag: chunk.prfTag,
      timestamp: timestamp,
      author: this.deviceId,
      // Encode binary data as base64 for JSON storage
      chunkData: Buffer.from(chunk.encrypted).toString('base64')
    }
    
    // Store as a regular encrypted event
    const encrypted = new TextEncoder().encode(JSON.stringify(payload))
    
    await this.db.insertEvent({
      device_id: this.deviceId,
      created_at: timestamp,
      received_at: timestamp,
      simulation_event_id: 0,
      encrypted
    })
    
    // Cache the chunk
    this.chunkCache.set(chunk.prfTag, {
      prfTag: chunk.prfTag,
      data: chunk.encrypted
    })
  }
  
  /**
   * Broadcast a chunk to the network
   */
  private broadcastChunk(chunk: FileChunk): void {
    this.networkSimulator.broadcastEvent(this.deviceId, 'file_chunk', {
      prfTag: chunk.prfTag,
      encrypted: Array.from(chunk.encrypted) // Convert to array for JSON
    })
  }
  
  /**
   * Handle receiving a file attachment in a message
   */
  async handleFileAttachment(attachment: FileMessageAttachment): Promise<void> {
    // Track this file download
    this.fileDownloads.set(attachment.fileId, {
      metadata: attachment,
      receivedChunks: new Set(),
      startTime: Date.now()
    })
    
    // Check what chunks we already have
    const requiredTags = this.fileHandler.getRequiredPrfTags(
      attachment.fileKey,
      attachment.chunkCount
    )
    
    // TODO: Include required PRF tags in Bloom filter for sync
    // For now, we'll rely on broadcast chunks
  }
  
  /**
   * Handle receiving a file chunk event
   */
  async handleChunkEvent(event: FileChunkEvent): Promise<void> {
    // Cache the chunk
    this.chunkCache.set(event.prfTag, {
      prfTag: event.prfTag,
      data: event.encryptedData
    })
    
    // Check if this chunk belongs to any file we're downloading
    for (const [fileId, download] of this.fileDownloads) {
      const { metadata, receivedChunks } = download
      
      // Check if this PRF tag matches what we expect
      const requiredTags = this.fileHandler.getRequiredPrfTags(
        metadata.fileKey,
        metadata.chunkCount
      )
      
      if (requiredTags.includes(event.prfTag)) {
        receivedChunks.add(event.prfTag)
        
        // Check if we have all chunks
        if (this.fileHandler.hasAllChunks(receivedChunks, metadata.fileKey, metadata.chunkCount)) {
          // Assemble the file
          await this.assembleFile(fileId)
        }
      }
    }
  }
  
  /**
   * Attempt to assemble a file from cached chunks
   */
  private async assembleFile(fileId: string): Promise<Uint8Array | null> {
    const download = this.fileDownloads.get(fileId)
    if (!download) return null
    
    const { metadata } = download
    
    // Collect all chunks
    const chunks: ChunkData[] = []
    const requiredTags = this.fileHandler.getRequiredPrfTags(
      metadata.fileKey,
      metadata.chunkCount
    )
    
    for (const tag of requiredTags) {
      const chunk = this.chunkCache.get(tag)
      if (chunk) {
        chunks.push(chunk)
      }
    }
    
    // Try to assemble
    const assembled = await this.fileHandler.assembleFile(
      chunks,
      metadata.fileKey,
      fileId,
      metadata.chunkCount
    )
    
    if (assembled) {
      // File successfully assembled
      console.log(`[FileChunkHandler] Successfully assembled file ${fileId}`)
      
      // Clean up
      this.fileDownloads.delete(fileId)
      
      // TODO: Store assembled file and notify UI
    }
    
    return assembled
  }
  
  /**
   * Get chunk reception progress for a file
   */
  getFileProgress(fileId: string): { received: number, total: number, percentage: number } | null {
    const download = this.fileDownloads.get(fileId)
    if (!download) return null
    
    const received = download.receivedChunks.size
    const total = download.metadata.chunkCount
    const percentage = Math.round((received / total) * 100)
    
    return { received, total, percentage }
  }
  
  /**
   * Check if we have a chunk in cache
   */
  hasChunk(prfTag: string): boolean {
    return this.chunkCache.has(prfTag)
  }
  
  /**
   * Get a chunk from cache
   */
  getChunk(prfTag: string): ChunkData | undefined {
    return this.chunkCache.get(prfTag)
  }
}