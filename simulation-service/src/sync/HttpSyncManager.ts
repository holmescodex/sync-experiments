import { BloomFilter, CumulativeBloomFilter } from './BloomFilter'
import { InMemoryStore } from '../storage/InMemoryStore'
import { MessageGenerator } from '../crypto/MessageGenerator'
import fetch from 'node-fetch'

interface SyncConfig {
  deviceId: string
  syncInterval?: number
  peers?: { deviceId: string; url: string }[]
}

/**
 * HttpSyncManager implements sync using HTTP requests between backends
 * This is a simple implementation for testing - production would use UDP
 */
export class HttpSyncManager {
  private bloomFilter: CumulativeBloomFilter
  private store: InMemoryStore
  private messageGenerator: MessageGenerator
  private config: SyncConfig
  private syncTimer?: NodeJS.Timer
  private isRunning = false
  
  constructor(
    config: SyncConfig,
    store: InMemoryStore,
    messageGenerator: MessageGenerator
  ) {
    this.config = config
    this.store = store
    this.messageGenerator = messageGenerator
    this.bloomFilter = new CumulativeBloomFilter()
    
    // Default peers for 2-device setup
    if (!config.peers) {
      config.peers = config.deviceId === 'alice' 
        ? [{ deviceId: 'bob', url: 'http://localhost:3002' }]
        : [{ deviceId: 'alice', url: 'http://localhost:3001' }]
    }
  }
  
  async start() {
    console.log(`[HttpSyncManager] Starting sync for ${this.config.deviceId}`)
    this.isRunning = true
    
    // Update bloom filter with current events
    await this.updateBloomFilter()
    
    // Start periodic sync
    const interval = this.config.syncInterval || 5000
    this.syncTimer = setInterval(() => {
      if (this.isRunning) {
        this.performSync().catch(err => {
          console.error(`[HttpSyncManager] Sync error:`, err)
        })
      }
    }, interval)
    
    // Do initial sync
    await this.performSync()
  }
  
  stop() {
    this.isRunning = false
    if (this.syncTimer) {
      clearInterval(this.syncTimer)
      this.syncTimer = undefined
    }
  }
  
  private async updateBloomFilter() {
    const events = await this.store.getAllEvents()
    for (const event of events) {
      this.bloomFilter.add(event.event_id)
    }
  }
  
  private async performSync() {
    if (!this.isRunning) return
    
    // Update bloom filter before syncing
    await this.updateBloomFilter()
    
    // Send bloom filter to all peers
    const bloomData = this.bloomFilter.getFilterForTransmission().serialize()
    
    for (const peer of this.config.peers || []) {
      try {
        console.log(`[HttpSyncManager] ${this.config.deviceId} sending bloom filter to ${peer.deviceId}`)
        
        const response = await fetch(`${peer.url}/api/sync/bloom`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: this.config.deviceId,
            bloom: Array.from(bloomData)
          })
        })
        
        if (response.ok) {
          const data = await response.json()
          if (data.missingEvents && data.missingEvents.length > 0) {
            console.log(`[HttpSyncManager] ${this.config.deviceId}: Peer ${peer.deviceId} needs ${data.missingEvents.length} events`)
            
            // Send missing events
            for (const eventId of data.missingEvents.slice(0, 10)) {
              const event = await this.store.getEvent(eventId)
              if (event) {
                await this.sendEventToPeer(peer, event, eventId)
              }
            }
          }
        }
      } catch (error) {
        console.error(`[HttpSyncManager] ${this.config.deviceId} failed to sync with ${peer.deviceId}:`, error)
      }
    }
  }
  
  private async sendEventToPeer(peer: { deviceId: string; url: string }, event: any, eventId: string) {
    try {
      await fetch(`${peer.url}/api/sync/event`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: this.config.deviceId,
          event_id: eventId,
          encrypted: Array.from(event.encrypted)
        })
      })
    } catch (error) {
      console.error(`[HttpSyncManager] Failed to send event to ${peer.deviceId}:`, error)
    }
  }
  
  /**
   * Handle incoming bloom filter from peer
   */
  async handleBloomSync(from: string, bloomData: number[]): Promise<{ missingEvents: string[] }> {
    try {
      const peerBloom = BloomFilter.deserialize(new Uint8Array(bloomData))
      const localEvents = await this.store.getAllEvents()
      
      // Find events peer doesn't have
      const missingEvents = []
      for (const event of localEvents) {
        if (!peerBloom.test(event.event_id)) {
          missingEvents.push(event.event_id)
        }
      }
      
      return { missingEvents }
    } catch (error) {
      console.error(`[HttpSyncManager] ${this.config.deviceId} error handling bloom sync:`, error)
      return { missingEvents: [] }
    }
  }
  
  /**
   * Handle incoming event from peer
   */
  async handleIncomingEvent(from: string, eventId: string, encrypted: number[]) {
    try {
      // Check if we already have this event
      const existing = await this.store.getEvent(eventId)
      if (existing) {
        console.log(`[HttpSyncManager] ${this.config.deviceId} already has event ${eventId}`)
        return { success: true, message: 'Already have event' }
      }
      
      // Verify and decrypt the event
      const encryptedBytes = new Uint8Array(encrypted)
      const decrypted = await this.messageGenerator.decryptMessage({ encrypted: encryptedBytes })
      if (!decrypted) {
        console.error(`[HttpSyncManager] ${this.config.deviceId} failed to decrypt event ${eventId}`)
        return { success: false, message: 'Failed to decrypt' }
      }
      
      // Verify the author matches the source
      if (decrypted.author !== from) {
        console.error(`[HttpSyncManager] ${this.config.deviceId} author mismatch: ${decrypted.author} != ${from}`)
        return { success: false, message: 'Author mismatch' }
      }
      
      // Store the event
      await this.store.storeEvent({ encrypted: encryptedBytes }, eventId)
      this.bloomFilter.add(eventId)
      
      console.log(`[HttpSyncManager] ${this.config.deviceId} stored event ${eventId} from ${from}: "${decrypted.content}"`)
      return { success: true, message: 'Event stored' }
    } catch (error) {
      console.error(`[HttpSyncManager] ${this.config.deviceId} error handling event:`, error)
      return { success: false, message: 'Internal error' }
    }
  }
  
  /**
   * Send a new message (called when user creates a message)
   */
  async broadcastNewMessage(event: { encrypted: Uint8Array }, eventId: string) {
    if (!this.isRunning) return
    
    // Add to our bloom filter
    this.bloomFilter.add(eventId)
    
    console.log(`[HttpSyncManager] ${this.config.deviceId} broadcasting new message ${eventId}`)
    
    // Send directly to all peers
    for (const peer of this.config.peers || []) {
      await this.sendEventToPeer(peer, event, eventId)
    }
  }
}