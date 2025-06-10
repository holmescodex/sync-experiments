import { createHash } from 'crypto'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'

// Initialize sha512 for the ed25519 library
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

export interface BloomFilterData {
  filter: Uint8Array
  eventCount: number
  timestamp: number
}

export interface SignedBloomFilter {
  data: BloomFilterData
  signature: Uint8Array
  deviceId: string
}

/**
 * Cached Bloom Filter with signature support
 * According to design: "cached bloom filters might be signed by their creator"
 */
export class CachedBloomFilter {
  private static readonly FILTER_SIZE = 2048 // 2KB bloom filter
  private static readonly HASH_COUNT = 3
  private filter: Uint8Array
  private eventCount: number = 0
  private timestamp: number = Date.now()
  
  constructor(
    private deviceId: string,
    private privateKey?: Uint8Array
  ) {
    this.filter = new Uint8Array(CachedBloomFilter.FILTER_SIZE)
  }
  
  /**
   * Add an event ID to the bloom filter
   */
  add(eventId: string): void {
    const positions = this.getHashPositions(eventId)
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / 8)
      const bitIndex = pos % 8
      this.filter[byteIndex] |= (1 << bitIndex)
    }
    this.eventCount++
    this.timestamp = Date.now()
  }
  
  /**
   * Check if an event ID might be in the set
   */
  contains(eventId: string): boolean {
    const positions = this.getHashPositions(eventId)
    for (const pos of positions) {
      const byteIndex = Math.floor(pos / 8)
      const bitIndex = pos % 8
      if (!(this.filter[byteIndex] & (1 << bitIndex))) {
        return false
      }
    }
    return true
  }
  
  /**
   * Get multiple hash positions for an event ID
   */
  private getHashPositions(eventId: string): number[] {
    const positions: number[] = []
    const baseHash = createHash('sha256').update(eventId).digest()
    
    for (let i = 0; i < CachedBloomFilter.HASH_COUNT; i++) {
      const hash = createHash('sha256')
        .update(baseHash)
        .update(Buffer.from([i]))
        .digest()
      
      // Use first 4 bytes as 32-bit integer
      const position = hash.readUInt32BE(0) % (CachedBloomFilter.FILTER_SIZE * 8)
      positions.push(position)
    }
    
    return positions
  }
  
  /**
   * Get the current bloom filter data
   */
  getData(): BloomFilterData {
    return {
      filter: new Uint8Array(this.filter),
      eventCount: this.eventCount,
      timestamp: this.timestamp
    }
  }
  
  /**
   * Sign the bloom filter (if private key available)
   */
  async sign(): Promise<SignedBloomFilter | null> {
    if (!this.privateKey) {
      return null
    }
    
    const data = this.getData()
    const dataBytes = this.serializeData(data)
    const signature = await ed.sign(dataBytes, this.privateKey)
    
    return {
      data,
      signature,
      deviceId: this.deviceId
    }
  }
  
  /**
   * Verify a signed bloom filter
   */
  static async verify(
    signed: SignedBloomFilter, 
    publicKey: Uint8Array
  ): Promise<boolean> {
    const dataBytes = CachedBloomFilter.prototype.serializeData.call(null, signed.data)
    return await ed.verify(signed.signature, dataBytes, publicKey)
  }
  
  /**
   * Create from signed data (after verification)
   */
  static fromSigned(signed: SignedBloomFilter): CachedBloomFilter {
    const bf = new CachedBloomFilter(signed.deviceId)
    bf.filter = new Uint8Array(signed.data.filter)
    bf.eventCount = signed.data.eventCount
    bf.timestamp = signed.data.timestamp
    return bf
  }
  
  /**
   * Serialize bloom filter data for signing
   */
  private serializeData(data: BloomFilterData): Buffer {
    const countBuffer = Buffer.allocUnsafe(4)
    countBuffer.writeUInt32BE(data.eventCount, 0)
    
    const timestampBuffer = Buffer.allocUnsafe(8)
    timestampBuffer.writeBigUInt64BE(BigInt(data.timestamp), 0)
    
    const parts = [
      Buffer.from(data.filter),
      countBuffer,
      timestampBuffer
    ]
    return Buffer.concat(parts)
  }
  
  /**
   * Merge another bloom filter into this one
   */
  merge(other: CachedBloomFilter): void {
    // OR the two filters together
    for (let i = 0; i < this.filter.length; i++) {
      this.filter[i] |= other.filter[i]
    }
    this.eventCount += other.eventCount
    this.timestamp = Math.max(this.timestamp, other.timestamp)
  }
  
  /**
   * Estimate false positive rate
   */
  estimateFalsePositiveRate(): number {
    const m = CachedBloomFilter.FILTER_SIZE * 8 // bits
    const k = CachedBloomFilter.HASH_COUNT
    const n = this.eventCount
    
    // Formula: (1 - e^(-k*n/m))^k
    return Math.pow(1 - Math.exp(-k * n / m), k)
  }
  
  /**
   * Clear the filter
   */
  clear(): void {
    this.filter.fill(0)
    this.eventCount = 0
    this.timestamp = Date.now()
  }
}