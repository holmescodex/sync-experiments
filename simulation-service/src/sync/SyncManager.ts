import { BloomFilter, CumulativeBloomFilter } from './BloomFilter'
import { InMemoryStore } from '../storage/InMemoryStore'
import { NetworkSimulator, NetworkEvent } from '../network/NetworkSimulator'
import { MessageGenerator } from '../crypto/MessageGenerator'

interface SyncConfig {
  deviceId: string
  syncInterval?: number
}

export class SyncManager {
  private bloomFilter: CumulativeBloomFilter
  private store: InMemoryStore
  private networkSimulator: NetworkSimulator
  private messageGenerator: MessageGenerator
  private config: SyncConfig
  private syncTimer?: NodeJS.Timer
  private isRunning = false
  private currentTime = 0
  private online = true
  
  constructor(
    config: SyncConfig,
    store: InMemoryStore,
    networkSimulator: NetworkSimulator,
    messageGenerator: MessageGenerator
  ) {
    this.config = config
    this.store = store
    this.networkSimulator = networkSimulator
    this.messageGenerator = messageGenerator
    this.bloomFilter = new CumulativeBloomFilter()
    
    // Register with network simulator
    this.networkSimulator.addDevice(config.deviceId)
    
    // Listen for network events
    this.networkSimulator.onNetworkEvent(this.handleNetworkEvent.bind(this))
  }
  
  async start() {
    console.log(`[SyncManager] Starting sync for ${this.config.deviceId}`)
    this.isRunning = true
    
    // Update bloom filter with current events
    await this.updateBloomFilter()
    
    // Start periodic sync
    const interval = this.config.syncInterval || 5000
    this.syncTimer = setInterval(() => {
      if (this.isRunning) {
        this.performSync()
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
    if (!this.isRunning || !this.online) return
    
    // Update bloom filter before syncing
    await this.updateBloomFilter()
    
    // Send bloom filter to all peers
    const bloomData = this.bloomFilter.getFilterForTransmission().serialize()
    const packet = {
      type: 'bloom_sync' as const,
      deviceId: this.config.deviceId,
      bloom: Array.from(bloomData), // Convert to array for JSON
      timestamp: this.currentTime
    }
    
    console.log(`[SyncManager] ${this.config.deviceId} broadcasting bloom filter`)
    this.networkSimulator.broadcastEvent(this.config.deviceId, 'bloom_filter', packet)
  }
  
  private async handleNetworkEvent(event: NetworkEvent) {
    // Only process delivered events when online
    if (event.status !== 'delivered' || !this.online) {
      return
    }
    
    // Process events targeted at this device or broadcasts
    if (event.targetDevice !== this.config.deviceId && event.targetDevice !== '*') {
      return
    }
    
    console.log(`[SyncManager] ${this.config.deviceId} received ${event.type} from ${event.sourceDevice}`)
    
    if (event.type === 'bloom_filter') {
      await this.handleBloomSync(event.payload, event.sourceDevice)
    } else if (event.type === 'message') {
      await this.handleIncomingMessage(event.payload, event.sourceDevice)
    }
  }
  
  private async handleBloomSync(packet: any, sourceDevice: string) {
    try {
      const peerBloom = BloomFilter.deserialize(new Uint8Array(packet.bloom))
      const localEvents = await this.store.getAllEvents()
      
      // Find events peer doesn't have
      const missingEvents = []
      for (const event of localEvents) {
        if (!peerBloom.test(event.event_id)) {
          missingEvents.push(event)
        }
      }
      
      if (missingEvents.length > 0) {
        console.log(`[SyncManager] ${this.config.deviceId}: Peer ${sourceDevice} missing ${missingEvents.length} events`)
        
        // Send missing events directly
        for (const event of missingEvents.slice(0, 10)) { // Limit to 10 at a time
          const messagePayload = {
            event_id: event.event_id,
            encrypted: Array.from(event.encrypted),
            timestamp: this.currentTime
          }
          
          this.networkSimulator.sendEvent(
            this.config.deviceId,
            sourceDevice,
            'message',
            messagePayload
          )
        }
      }
    } catch (error) {
      console.error(`[SyncManager] ${this.config.deviceId} error handling bloom sync:`, error)
    }
  }
  
  private async handleIncomingMessage(payload: any, sourceDevice: string) {
    try {
      // Convert array back to Uint8Array
      const encrypted = new Uint8Array(payload.encrypted)
      const eventId = payload.event_id
      
      // Check if we already have this event
      const existing = await this.store.getEvent(eventId)
      if (existing) {
        console.log(`[SyncManager] ${this.config.deviceId} already has event ${eventId}`)
        return
      }
      
      // Verify and decrypt the event
      const decrypted = await this.messageGenerator.decryptMessage({ encrypted })
      if (!decrypted) {
        console.error(`[SyncManager] ${this.config.deviceId} failed to decrypt event ${eventId}`)
        return
      }
      
      // Verify the author matches the source
      if (decrypted.author !== sourceDevice) {
        console.error(`[SyncManager] ${this.config.deviceId} author mismatch: ${decrypted.author} != ${sourceDevice}`)
        return
      }
      
      // Store the event
      await this.store.storeEvent({
        device_id: sourceDevice,
        created_at: decrypted.timestamp,
        received_at: Date.now(),
        encrypted
      }, eventId)
      this.bloomFilter.add(eventId)
      
      // Track that we received this event
      this.networkSimulator.trackOwnEvent(this.config.deviceId)
      
      console.log(`[SyncManager] ${this.config.deviceId} stored event ${eventId} from ${sourceDevice}: "${decrypted.content}"`)
    } catch (error) {
      console.error(`[SyncManager] ${this.config.deviceId} error handling message:`, error)
    }
  }
  
  /**
   * Send a new message (called when user creates a message)
   */
  async broadcastNewMessage(event: { encrypted: Uint8Array }, eventId: string) {
    if (!this.isRunning || !this.online) return
    
    // Add to our bloom filter
    this.bloomFilter.add(eventId)
    
    // Broadcast to all peers
    const messagePayload = {
      event_id: eventId,
      encrypted: Array.from(event.encrypted),
      timestamp: this.currentTime
    }
    
    console.log(`[SyncManager] ${this.config.deviceId} broadcasting new message ${eventId}`)
    this.networkSimulator.broadcastEvent(this.config.deviceId, 'message', messagePayload)
    
    // Track that we sent this event
    this.networkSimulator.trackOwnEvent(this.config.deviceId)
  }
  
  getSyncPercentage(): number {
    // Calculate sync percentage based on bloom filter comparison
    // For now, return a simple estimate
    return 100 // Since we're actively syncing
  }
  
  isOnline(): boolean {
    return this.online
  }
  
  setOnline(online: boolean) {
    this.online = online
    console.log(`[SyncManager] ${this.config.deviceId} is now ${online ? 'online' : 'offline'}`)
    
    if (!online && this.syncTimer) {
      // Stop syncing when offline
      clearInterval(this.syncTimer)
      this.syncTimer = undefined
    } else if (online && !this.syncTimer && this.isRunning) {
      // Resume syncing when back online
      const interval = this.config.syncInterval || 5000
      this.syncTimer = setInterval(() => {
        if (this.isRunning && this.online) {
          this.broadcastBloomFilter()
        }
      }, interval)
    }
  }
}