export interface SimulationEvent {
  simTime: number
  type: 'message' | 'file' | 'device_join' | 'device_leave' | 'file_chunk' | 'reaction'
  deviceId: string
  data: any
  executed?: boolean
  eventId?: string
}

export interface EventTimeline {
  events: SimulationEvent[]
  duration: number
}

export interface DeviceFrequency {
  deviceId: string
  messagesPerHour: number
  enabled: boolean
  isOnline?: boolean
}

import { NetworkSimulator, type NetworkEvent, type NetworkConfig } from '../network/simulator'
import { SyncManager } from '../sync/SyncManager'
import { DeviceDB } from '../storage/device-db'
import { FileChunkHandler, type FileMessageAttachment } from '../files/FileChunkHandler'
// Crypto imports commented out for now
// import { KeyManager } from '../crypto/KeyManager'
// import { PacketSigner } from '../crypto/PacketSigner'
// import { SecureMessageLayer } from '../crypto/SecureMessageLayer'
// import { SecureNetworkAdapter } from '../network/SecureNetworkAdapter'

export interface NetworkMessageCallback {
  (deviceId: string, content: string, fromDevice: string): void
}

export class SimulationEngine {
  private currentTime = 0
  private isRunning = true // Start running by default for tests
  private speedMultiplier = 1
  private tickInterval = 100 // 100ms real-time per tick
  private eventTimeline: SimulationEvent[] = []
  private eventExecuteCallback?: (event: SimulationEvent) => void
  private networkMessageCallback?: NetworkMessageCallback
  private deviceFrequencies: DeviceFrequency[] = []
  private nextEventId = 1
  private deviceOfflineStatus: Map<string, boolean> = new Map()
  private networkSimulator: NetworkSimulator
  private totalGeneratedEvents = 0
  private imageAttachmentPercentage = 30
  private syncManagers: Map<string, SyncManager> = new Map()
  private deviceDatabases: Map<string, DeviceDB> = new Map()
  private fileChunkHandlers: Map<string, FileChunkHandler> = new Map()
  // Crypto infrastructure commented out for now
  // private keyManagers: Map<string, KeyManager> = new Map()
  // private packetSigners: Map<string, PacketSigner> = new Map()
  // private secureMessageLayers: Map<string, SecureMessageLayer> = new Map()
  // private secureNetworkAdapters: Map<string, SecureNetworkAdapter> = new Map()
  private lastSyncTime = 0 // Track when we last ran sync
  // private communityPSK = 'test-community-psk' // Shared key for the community

  constructor() {
    this.networkSimulator = new NetworkSimulator()
    
    // Set up network message delivery
    this.networkSimulator.onNetworkEvent((networkEvent: NetworkEvent) => {
      if (networkEvent.status === 'delivered') {
        // Skip if target device is offline
        if (this.deviceOfflineStatus.get(networkEvent.targetDevice)) {
          return
        }
        
        // Skip bloom sync encrypted events - they'll be handled by the sync manager
        if (networkEvent.payload.encrypted) {
          return
        }
        
        // Process regular message events with content
        if (networkEvent.type === 'message' && this.networkMessageCallback && networkEvent.payload.content) {
          this.networkMessageCallback(
            networkEvent.targetDevice, 
            networkEvent.payload.content,
            networkEvent.sourceDevice
          )
        }
        // Note: Reaction events are handled through the sync mechanism
      }
    })
  }

  currentSimTime(): number {
    return this.currentTime
  }

  setSpeed(multiplier: number) {
    this.speedMultiplier = multiplier
  }

  pause() {
    this.isRunning = false
  }

  resume() {
    this.isRunning = true
  }

  async tick() {
    if (!this.isRunning) return

    // Advance simulation time by tick * speed
    this.currentTime += this.tickInterval * this.speedMultiplier

    // Update network simulator
    this.networkSimulator.tick(this.currentTime)

    // Execute all events that should have happened by now
    await this.executeEventsUpToTime(this.currentTime)
    
    // Trigger sync manager ticks every 1 second of simulation time
    const syncInterval = 1000 // 1 second in simulation time
    if (this.currentTime - this.lastSyncTime >= syncInterval) {
      for (const [deviceId, syncManager] of this.syncManagers) {
        // Skip sync if device is offline
        if (this.deviceOfflineStatus.get(deviceId)) {
          continue
        }
        
        try {
          await syncManager.updateLocalState()
        } catch (error) {
          console.warn(`Sync tick failed for ${deviceId}:`, error)
        }
      }
      this.lastSyncTime = Math.floor(this.currentTime / syncInterval) * syncInterval
    }
  }

  async createMessageEvent(deviceId: string, content: string, simTime?: number, attachments?: any[]) {
    const eventId = `msg-${deviceId}-${this.nextEventId++}`
    const eventData: any = { content, eventId, attachments }
    
    // Manual messages should not get automatic file attachments
    // File attachments for manual messages should be passed explicitly via the attachments parameter
    // Automatic file generation only happens in generateUpcomingEvents() for simulation events
    
    const event: SimulationEvent = {
      simTime: simTime ?? this.currentTime,
      type: 'message',
      deviceId,
      eventId,
      data: eventData
    }
    this.eventTimeline.push(event)

    // If event is for "now", execute immediately
    if (event.simTime <= this.currentTime) {
      await this.executeEvent(event)
    }
  }

  async createReactionEvent(deviceId: string, messageId: string, emoji: string, remove: boolean = false, simTime?: number) {
    const eventId = `react-${deviceId}-${this.nextEventId++}`
    const event: SimulationEvent = {
      simTime: simTime ?? this.currentTime,
      type: 'reaction',
      deviceId,
      eventId,
      data: { messageId, emoji, remove, eventId, author: deviceId }
    }
    this.eventTimeline.push(event)

    // If event is for "now", execute immediately
    if (event.simTime <= this.currentTime) {
      await this.executeEvent(event)
    }
  }

  loadEventTimeline(events: SimulationEvent[]) {
    this.eventTimeline = events.sort((a, b) => a.simTime - b.simTime)
  }

  exportEventTimeline(): EventTimeline {
    return {
      events: [...this.eventTimeline],
      duration: Math.max(0, ...this.eventTimeline.map(e => e.simTime))
    }
  }

  onEventExecute(callback: (event: SimulationEvent) => void) {
    this.eventExecuteCallback = callback
  }

  onNetworkMessage(callback: NetworkMessageCallback) {
    this.networkMessageCallback = callback
  }

  async setDeviceFrequencies(frequencies: DeviceFrequency[]) {
    this.deviceFrequencies = [...frequencies]
    
    // Add devices to network simulator (only new ones)
    frequencies.forEach(freq => {
      this.networkSimulator.addDevice(freq.deviceId)
    })
    
    // Initialize databases and sync managers for each device (only if not already initialized)
    await this.initializeDeviceSync(frequencies.map(f => f.deviceId))
    
    this.generateUpcomingEvents()
  }

  getDeviceFrequencies(): DeviceFrequency[] {
    return [...this.deviceFrequencies]
  }

  setImageAttachmentPercentage(percentage: number) {
    this.imageAttachmentPercentage = percentage
  }

  getUpcomingEvents(count: number = 10): SimulationEvent[] {
    return this.eventTimeline
      .filter(e => !e.executed && e.simTime >= this.currentTime)
      .sort((a, b) => a.simTime - b.simTime)
      .slice(0, count)
  }

  private generateUpcomingEvents() {
    // Clear future events
    this.eventTimeline = this.eventTimeline.filter(e => e.executed || e.simTime <= this.currentTime)
    
    // Generate events for next hour of simulation time
    const generationWindow = 3600000 // 1 hour in milliseconds
    const endTime = this.currentTime + generationWindow
    
    this.deviceFrequencies.forEach(freq => {
      if (!freq.enabled || freq.messagesPerHour <= 0) return
      
      // Calculate average interval between messages
      const avgInterval = 3600000 / freq.messagesPerHour // ms between messages
      
      let nextEventTime = this.currentTime + this.randomInterval(avgInterval)
      
      while (nextEventTime < endTime) {
        const eventId = `msg-${freq.deviceId}-${this.nextEventId++}`
        const eventData: any = { 
          content: this.generateRandomMessage(),
          simulation_event_id: this.nextEventId,
          eventId
        }
        
        // Add file intent if percentage chance is met
        if (Math.random() < (this.imageAttachmentPercentage / 100)) {
          eventData.fileIntent = this.generateRandomFileIntent()
        }
        
        this.eventTimeline.push({
          simTime: nextEventTime,
          type: 'message',
          deviceId: freq.deviceId,
          eventId,
          data: eventData
        })
        // Don't increment totalGeneratedEvents here - only when executed
        
        // Schedule next event with some randomness
        nextEventTime += this.randomInterval(avgInterval)
      }
    })
    
    // Sort timeline by time
    this.eventTimeline.sort((a, b) => a.simTime - b.simTime)
    
    // Don't update total count here - only when events are actually executed
  }

  private randomInterval(avgInterval: number): number {
    // Exponential distribution for realistic spacing
    // Most messages come at avgInterval, but some much sooner/later
    return Math.max(1000, -Math.log(Math.random()) * avgInterval)
  }

  private generateRandomMessage(): string {
    const messages = [
      "Hey, how's it going?",
      "Just finished the presentation",
      "Running a bit late",
      "Can we reschedule?",
      "Great job on the project!",
      "Coffee break?",
      "The weather is nice today",
      "Did you see the news?",
      "Almost done with the feature",
      "Need help with debugging",
      "Meeting in 10 minutes",
      "Thanks for the feedback",
      "Working from home today",
      "System is running smoothly",
      "Found an interesting article",
      "Lunch plans?",
      "Code review completed",
      "Performance looks good",
      "New requirements came in",
      "Fixed the bug we discussed"
    ]
    return messages[Math.floor(Math.random() * messages.length)]
  }

  private generateRandomFileIntent(): {name: string, size: number, type: string} {
    // Pool of test images with realistic file sizes
    const testFiles = [
      { name: 'landscape.jpg', size: 45000, type: 'image/jpeg' },
      { name: 'portrait.jpg', size: 32000, type: 'image/jpeg' },
      { name: 'abstract.jpg', size: 78000, type: 'image/jpeg' },
      { name: 'diagram.png', size: 156000, type: 'image/png' },
      { name: 'small.jpg', size: 18000, type: 'image/jpeg' },
      { name: 'landscape-large.jpg', size: 235000, type: 'image/jpeg' },
      { name: 'large.jpg', size: 189000, type: 'image/jpeg' }
    ]

    return testFiles[Math.floor(Math.random() * testFiles.length)]
  }

  private async processFileIntent(deviceId: string, fileIntent: {name: string, size: number, type: string}): Promise<FileMessageAttachment | null> {
    const fileChunkHandler = this.fileChunkHandlers.get(deviceId)
    if (!fileChunkHandler) return null
    
    // Create simulated file data (for demo - in reality would load from filesystem)
    const fileData = new Uint8Array(fileIntent.size).map(() => Math.floor(Math.random() * 256))
    
    try {
      // Process file through FileChunkHandler - this creates chunks and stores them
      const attachment = await fileChunkHandler.uploadFile(fileData, fileIntent.type, fileIntent.name)
      console.log(`[SimulationEngine] Processed file attachment: ${fileIntent.name} (${fileIntent.size} bytes, ${attachment.chunkCount} chunks)`)
      return attachment
    } catch (error) {
      console.warn(`[SimulationEngine] Failed to process file attachment:`, error)
      return null
    }
  }

  private async executeEventsUpToTime(targetTime: number) {
    const eventsToExecute = this.eventTimeline.filter(e => 
      e.simTime <= targetTime && !e.executed
    )
    
    // Execute events sequentially to avoid database conflicts
    for (const event of eventsToExecute) {
      await this.executeEvent(event)
    }
    
    // Only regenerate events if we have device frequencies configured
    if (this.deviceFrequencies.length > 0) {
      const upcomingEvents = this.eventTimeline.filter(e => !e.executed && e.simTime > targetTime)
      if (upcomingEvents.length < 5) {
        this.generateUpcomingEvents()
      }
    }
  }

  private async executeEvent(event: SimulationEvent) {
    event.executed = true
    if (this.eventExecuteCallback) {
      this.eventExecuteCallback(event)
    }
    
    // Only count messages in total when they're actually sent
    this.totalGeneratedEvents++
    console.log(`[DEBUG] executeEvent: ${event.deviceId} sent "${event.data.content}" - totalGeneratedEvents now: ${this.totalGeneratedEvents}`)
    this.networkSimulator.updateTotalEventCount(this.totalGeneratedEvents)
    
    // Track that this device generated its own event
    this.networkSimulator.trackOwnEvent(event.deviceId)
    
    // Store event in the device's local database
    if ((event.type === 'message' || event.type === 'reaction') && event.eventId) {
      let encrypted: Uint8Array | null = null
      
      // Pass plaintext event to device - let the device handle encryption
      const db = this.deviceDatabases.get(event.deviceId)
      console.log(`[DEBUG] Looking for database for device ${event.deviceId}, found: ${db ? 'yes' : 'no'}`)
      console.log(`[DEBUG] Available databases: ${Array.from(this.deviceDatabases.keys()).join(', ')}`)
      if (db) {
        try {
          // For now, do simple encoding until we implement proper crypto in DeviceDB
          let payload: any
          if (event.type === 'message') {
            // Process file intent if present
            let attachments = event.data.attachments
            if (!attachments && event.data.fileIntent) {
              const fileAttachment = await this.processFileIntent(event.deviceId, event.data.fileIntent)
              if (fileAttachment) {
                attachments = [fileAttachment]
                // Update the event data for UI display
                event.data.attachments = attachments
              }
            }
            
            payload = {
              type: 'message',
              content: event.data.content,
              timestamp: event.simTime,
              author: event.deviceId,
              attachments
            }
          } else if (event.type === 'reaction') {
            payload = {
              type: 'reaction',
              messageId: event.data.messageId,
              emoji: event.data.emoji,
              remove: event.data.remove,
              timestamp: event.simTime,
              author: event.data.author
            }
          }
          encrypted = new TextEncoder().encode(JSON.stringify(payload))
          
          const insertedEventId = await db.insertEvent({
            device_id: event.deviceId,
            created_at: event.simTime,
            received_at: event.simTime,
            simulation_event_id: event.data.simulation_event_id || 0,
            encrypted
          })
          console.log(`[DEBUG] Stored event ${insertedEventId} in ${event.deviceId}'s database`)
          
          // Update the sync manager's Bloom filter with the new event
          const syncManager = this.syncManagers.get(event.deviceId)
          if (syncManager) {
            // Update local state (Bloom filter) after adding the event
            await syncManager.updateLocalState()
          }
        } catch (error) {
          console.warn(`Failed to store event for ${event.deviceId}:`, error)
        }
      }
      
      // Only broadcast if device is online and we have encrypted data
      if (!this.deviceOfflineStatus.get(event.deviceId) && encrypted) {
        // Broadcast the event directly to all peers for immediate delivery
        // This works alongside Bloom filter sync for better real-time performance
        let broadcastPayload: any
        if (event.type === 'message') {
          broadcastPayload = {
            content: event.data.content,
            eventId: event.eventId,
            timestamp: event.simTime,
            author: event.deviceId,
            attachments: event.data.attachments,
            encrypted: Array.from(encrypted)
          }
        } else if (event.type === 'reaction') {
          broadcastPayload = {
            messageId: event.data.messageId,
            emoji: event.data.emoji,
            remove: event.data.remove,
            eventId: event.eventId,
            timestamp: event.simTime,
            author: event.data.author,
            encrypted: Array.from(encrypted)
          }
        }
        this.networkSimulator.broadcastEvent(event.deviceId, event.type, broadcastPayload)
      }
    }
  }

  // Network-related methods
  getNetworkSimulator(): NetworkSimulator {
    return this.networkSimulator
  }

  getNetworkEvents(limit?: number) {
    return this.networkSimulator.getNetworkEvents(limit)
  }

  getNetworkStats() {
    return this.networkSimulator.getNetworkStats()
  }

  getNetworkConfig(): NetworkConfig {
    return this.networkSimulator.getConfig()
  }

  updateNetworkConfig(config: Partial<NetworkConfig>) {
    this.networkSimulator.updateConfig(config)
  }

  getDeviceSyncStatus() {
    const networkStatus = this.networkSimulator.getAllDeviceSyncStatus()
    const syncStatus = new Map()
    
    // Add sync manager status for each device
    for (const [deviceId, netStatus] of networkStatus) {
      const syncManager = this.syncManagers.get(deviceId)
      syncStatus.set(deviceId, {
        ...netStatus,
        sync: syncManager?.getSyncStatus() || { isSynced: false, syncPercentage: 0 }
      })
    }
    
    return syncStatus
  }

  /**
   * Initialize databases and sync managers for devices
   */
  private async initializeDeviceSync(deviceIds: string[]): Promise<void> {
    for (const deviceId of deviceIds) {
      // Skip if already initialized
      if (this.deviceDatabases.has(deviceId)) continue
      
      // Initialize database
      const db = new DeviceDB(deviceId)
      await db.initialize()
      this.deviceDatabases.set(deviceId, db)
      
      // Initialize sync manager
      const syncManager = new SyncManager(deviceId, this.networkSimulator, db, 'bloom-filter')
      
      // Set up online status callback
      syncManager.setOnlineStatusCallback(() => {
        return this.getDeviceOnlineStatus(deviceId)
      })
      
      this.syncManagers.set(deviceId, syncManager)
      
      // Initialize file chunk handler
      const fileChunkHandler = new FileChunkHandler(deviceId, db, this.networkSimulator)
      this.fileChunkHandlers.set(deviceId, fileChunkHandler)
    }
  }

  /**
   * Get sync manager for a device (for testing)
   */
  getSyncManager(deviceId: string): SyncManager | undefined {
    return this.syncManagers.get(deviceId)
  }

  /**
   * Get database for a device (for testing)
   */
  getDeviceDatabase(deviceId: string): DeviceDB | undefined {
    return this.deviceDatabases.get(deviceId)
  }

  /**
   * Set a device's online/offline status
   */
  setDeviceOnlineStatus(deviceId: string, isOnline: boolean): void {
    this.deviceOfflineStatus.set(deviceId, !isOnline)
    
    // Update device frequency to reflect status
    const deviceFreq = this.deviceFrequencies.find(d => d.deviceId === deviceId)
    if (deviceFreq) {
      deviceFreq.isOnline = isOnline
    }
    
    // Synchronize with network simulator
    this.networkSimulator.setDeviceOnline(deviceId, isOnline)
  }

  /**
   * Get a device's online status
   */
  getDeviceOnlineStatus(deviceId: string): boolean {
    return !this.deviceOfflineStatus.get(deviceId)
  }

  /**
   * Get all device online statuses
   */
  getAllDeviceOnlineStatus(): Map<string, boolean> {
    const statuses = new Map<string, boolean>()
    for (const freq of this.deviceFrequencies) {
      statuses.set(freq.deviceId, !this.deviceOfflineStatus.get(freq.deviceId))
    }
    return statuses
  }

  /**
   * Reset the simulation engine to initial state
   */
  reset(): void {
    console.log('[SimulationEngine] Resetting simulation...')
    
    // Reset time and state
    this.currentTime = 0
    this.isRunning = true
    this.speedMultiplier = 1
    this.totalGeneratedEvents = 0
    this.lastSyncTime = 0
    this.nextEventId = 1
    
    // Clear timelines and events
    this.eventTimeline = []
    
    // Clear device state
    this.deviceFrequencies = []
    this.deviceOfflineStatus.clear()
    
    // Clear sync managers and databases
    this.syncManagers.clear()
    this.deviceDatabases.clear()
    
    // Reset network simulator
    this.networkSimulator = new NetworkSimulator()
    
    // Re-setup network event handling
    this.networkSimulator.onNetworkEvent((networkEvent: NetworkEvent) => {
      if (networkEvent.status === 'delivered' && networkEvent.type === 'message') {
        // Skip if target device is offline
        if (this.deviceOfflineStatus.get(networkEvent.targetDevice)) {
          return
        }
        
        // Skip bloom sync encrypted events - they'll be handled by the sync manager
        if (networkEvent.payload.encrypted) {
          return
        }
        
        // Only process regular message events with content
        if (this.networkMessageCallback && networkEvent.payload.content) {
          this.networkMessageCallback(
            networkEvent.targetDevice, 
            networkEvent.payload.content,
            networkEvent.sourceDevice
          )
        }
      }
    })
    
    console.log('[SimulationEngine] Reset complete')
  }
}