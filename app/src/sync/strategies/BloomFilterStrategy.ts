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
        // Handle received events (messages sent due to Bloom sync)
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
      
      // Send Bloom filter every 10 seconds
      if (now - lastSync > 10000) {
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
  }
  
  // Private methods
  
  private async updateLocalBloom(): Promise<void> {
    if (!this.database) return
    
    const events = await this.database.getAllEvents()
    
    // Add any new events to our Bloom filter
    for (const event of events) {
      this.myBloom.add(event.event_id)
    }
    
    // Update scan queue for efficient peer scanning
    this.scanQueue.updateFromDatabase(events)
  }
  
  private async sendBloomFilter(targetDevice: string): Promise<void> {
    if (!this.network || !this.database) return
    
    const filter = this.myBloom.getFilterForTransmission()
    const serialized = filter.serialize()
    
    this.network.sendEvent(this.deviceId, targetDevice, 'bloom_filter', {
      filter: Array.from(serialized), // Convert for network transmission
      filterSize: serialized.length,
      eventCount: this.myBloom.getEventCount(),
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
      const eventsToSend = await this.scanQueue.getEventsToSend(peerId, peerFilter, {
        recentEventsBatch: 50,     // Check last 50 recent events
        olderEventsBatch: 10,      // Then check 10 older events
        maxEventsPerRound: 20      // Don't overwhelm UDP
      })
      
      // Send missing events in UDP-safe batches
      for (const eventToSend of eventsToSend) {
        this.network.sendEvent(this.deviceId, peerId, 'message', {
          eventId: eventToSend.event_id,
          encrypted: Array.from(eventToSend.encrypted),
          createdAt: eventToSend.created_at,
          deviceId: eventToSend.device_id
        })
        
        // Small delay to avoid UDP flooding
        await new Promise(resolve => setTimeout(resolve, 5))
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
      const existing = await this.database.getEvent(eventId)
      
      if (!existing) {
        // Store new event
        await this.database.insertEvent({
          device_id: eventData.deviceId,
          created_at: eventData.createdAt,
          received_at: this.network.getCurrentTime(),
          encrypted: new Uint8Array(eventData.encrypted)
        })
        
        // Update our Bloom filter to include this new event
        this.myBloom.add(eventId)
      }
    } catch (error) {
      console.warn(`Failed to handle received event from ${networkEvent.sourceDevice}:`, error)
    }
  }
}