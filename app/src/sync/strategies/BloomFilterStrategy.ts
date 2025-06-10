import type { SyncStrategy, SyncStatus } from '../SyncStrategy.interface'
import type { NetworkEvent } from '../../network/simulator'
import type { DeviceDB } from '../../storage/device-db'
import type { NetworkSimulator } from '../../network/simulator'
import { CumulativeBloomFilter, PeerKnowledge, BloomFilter } from '../BloomFilter'
import { EventScanQueue } from '../EventScanQueue'

/**
 * Bloom Filter Sync Strategy
 * Uses small (~500 byte) Bloom filters to advertise what events each device has.
 * Achieves accuracy through composition over multiple rounds.
 */
export class BloomFilterStrategy implements SyncStrategy {
  readonly name = 'Bloom Filter Sync'
  readonly description = 'Compositional accuracy via small UDP-safe filters'
  
  private deviceId = ''
  private network: NetworkSimulator | null = null
  private database: DeviceDB | null = null
  
  private myBloom: CumulativeBloomFilter
  private peerKnowledge: PeerKnowledge
  private scanQueue: EventScanQueue
  private lastSyncTimes: Map<string, number> = new Map()
  private addedEventIds: Set<string> = new Set() // Track events already added to Bloom filter
  
  constructor() {
    this.myBloom = new CumulativeBloomFilter()
    this.peerKnowledge = new PeerKnowledge()
    this.scanQueue = new EventScanQueue()
  }
  
  async initialize(deviceId: string, network: NetworkSimulator, database: DeviceDB): Promise<void> {
    this.deviceId = deviceId
    this.network = network
    this.database = database
    
    // Set up network event handlers
    this.network.onNetworkEvent(async (event) => {
      if (event.targetDevice === this.deviceId && event.status === 'delivered') {
        await this.handleNetworkEvent(event)
      }
    })
    
    // Initialize Bloom filter with existing events
    await this.updateLocalBloom()
  }
  
  async handleNetworkEvent(event: NetworkEvent): Promise<void> {
    switch (event.type) {
      case 'bloom_filter':
        await this.handleBloomFilter(event)
        break
      case 'message':
        // Handle both direct broadcast messages and bloom sync messages
        if (event.payload.encrypted) {
          await this.handleReceivedEvent(event)
        }
        break
    }
  }
  
  async onSyncTick(): Promise<void> {
    if (!this.network) return
    
    // Update our Bloom filter with any new events
    await this.updateLocalBloom()
    
    // Check if it's time to send Bloom filters to peers
    const now = this.network.getCurrentTime()
    const peers = this.getPeerDevices()
    
    for (const peerId of peers) {
      const lastSync = this.lastSyncTimes.get(peerId) || 0
      
      // Send Bloom filter every 2 seconds (reduced from 10 for testing)
      if (now - lastSync >= 2000) {
        await this.sendBloomFilter(peerId)
        this.lastSyncTimes.set(peerId, now)
      }
    }
  }
  
  getSyncStatus(): SyncStatus {
    if (!this.network) {
      return {
        isSynced: true,
        syncPercentage: 100,
        knownEvents: 0,
        totalEvents: 0,
        strategy: this.name
      }
    }
    
    const totalEvents = this.network.getTotalEventCount()
    const knownEvents = this.myBloom.getEventCount()
    const syncPercentage = totalEvents > 0 ? Math.round((knownEvents / totalEvents) * 100) : 100
    
    return {
      isSynced: syncPercentage >= 95,
      syncPercentage,
      knownEvents,
      totalEvents,
      strategy: this.name
    }
  }
  
  getPeerDevices(): string[] {
    if (!this.network) return []
    
    // Get all devices except ourselves
    const allDevices = this.network.getAllDeviceSyncStatus()
    return Array.from(allDevices.keys()).filter(id => id !== this.deviceId)
  }
  
  async triggerSyncWith(peerId: string): Promise<void> {
    await this.sendBloomFilter(peerId)
  }
  
  shutdown(): void {
    this.lastSyncTimes.clear()
    this.scanQueue.reset()
    this.addedEventIds.clear()
  }
  
  // Private methods
  
  private async updateLocalBloom(): Promise<void> {
    if (!this.database) return
    
    const events = await this.database.getAllEvents()
    
    // Add only new events to our Bloom filter
    for (const event of events) {
      if (!this.addedEventIds.has(event.event_id)) {
        this.myBloom.add(event.event_id)
        this.addedEventIds.add(event.event_id)
      }
    }
    
    // Update scan queue for efficient peer scanning
    this.scanQueue.updateFromDatabase(events)
  }
  
  private async sendBloomFilter(targetDevice: string): Promise<void> {
    if (!this.network || !this.database) return
    
    // Check database event count for debugging
    const dbEvents = await this.database.getAllEvents()
    const dbEventCount = dbEvents.length
    const bloomEventCount = this.myBloom.getEventCount()
    console.log(`[BLOOM SYNC] ${this.deviceId}: DB has ${dbEventCount} events, Bloom has ${bloomEventCount} events`)
    
    const filter = this.myBloom.getFilterForTransmission()
    const serialized = filter.serialize()
    
    
    this.network.sendEvent(this.deviceId, targetDevice, 'bloom_filter', {
      filter: Array.from(serialized), // Convert for network transmission
      filterSize: serialized.length,
      eventCount: bloomEventCount,
      timestamp: this.network.getCurrentTime(),
      deviceId: this.deviceId
    })
  }
  
  private async handleBloomFilter(event: NetworkEvent): Promise<void> {
    if (!this.network || !this.database) return
    
    try {
      const peerFilter = BloomFilter.deserialize(new Uint8Array(event.payload.filter))
      const peerId = event.sourceDevice
      
      // Update our knowledge of what this peer has
      this.peerKnowledge.updatePeer(peerId, peerFilter)
      
      // Use prioritized scanning to find events peer might be missing
      const allEvents = await this.database.getAllEvents()
      console.log(`[BLOOM] ${this.deviceId} has ${allEvents.length} total events when checking what to send to ${peerId}`)
      
      const eventsToSend = await this.scanQueue.getEventsToSend(peerId, peerFilter, {
        recentEventsBatch: 10,     // Check last 10 recent events (reduced from 50)
        olderEventsBatch: 5,       // Then check 5 older events (reduced from 10)
        maxEventsPerRound: 20      // Don't overwhelm UDP
      })
      
      // Send missing events in UDP-safe batches
      console.log(`[BLOOM] ${this.deviceId} has ${eventsToSend.length} events to send to ${peerId}`)
      for (let i = 0; i < eventsToSend.length; i++) {
        const eventToSend = eventsToSend[i]
        console.log(`[BLOOM] ${this.deviceId} sending event ${i+1}/${eventsToSend.length}: ${eventToSend.event_id}`)
        this.network.sendEvent(this.deviceId, peerId, 'message', {
          eventId: eventToSend.event_id,
          encrypted: Array.from(eventToSend.encrypted),
          createdAt: eventToSend.created_at,
          deviceId: eventToSend.device_id
        })
        
        // Small delay to avoid UDP flooding (removed for now to debug)
        // await new Promise(resolve => setTimeout(resolve, 5))
      }
    } catch (error) {
      console.warn(`Failed to process Bloom filter from ${event.sourceDevice}:`, error)
    }
  }
  
  private async handleReceivedEvent(networkEvent: NetworkEvent): Promise<void> {
    if (!this.database || !this.network) return
    
    const eventData = networkEvent.payload
    
    try {
      // Check if we already have this event
      const eventId = eventData.eventId
      console.log(`[BLOOM] ${this.deviceId} processing received event ${eventId} from ${networkEvent.sourceDevice}`)
      const existing = await this.database.getEvent(eventId)
      
      if (!existing) {
        // Store new event
        const encryptedBytes = new Uint8Array(eventData.encrypted)
        await this.database.insertEvent({
          device_id: eventData.deviceId,
          created_at: eventData.createdAt,
          received_at: this.network.getCurrentTime(),
          encrypted: encryptedBytes
        })
        
        // Update our Bloom filter to include this new event
        if (!this.addedEventIds.has(eventId)) {
          this.myBloom.add(eventId)
          this.addedEventIds.add(eventId)
        }
        
        // Update our scan queue to include this new event
        await this.updateLocalBloom()
        
        // Decrypt the event and notify the UI
        try {
          const decrypted = new TextDecoder().decode(encryptedBytes)
          const eventPayload = JSON.parse(decrypted)
          
          // If this is a message event, we need to notify the UI
          // But we can't use the network simulator since that would create loops
          // Instead, we should use a direct callback or event system
          console.log(`[BLOOM] ${this.deviceId} successfully stored event ${eventId} from ${networkEvent.sourceDevice}`)
        } catch (decryptError) {
          console.warn('Failed to decrypt event:', decryptError)
        }
      }
    } catch (error) {
      console.warn(`Failed to handle received event from ${networkEvent.sourceDevice}:`, error)
    }
  }
}