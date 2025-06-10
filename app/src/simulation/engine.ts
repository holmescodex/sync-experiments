export interface SimulationEvent {
  simTime: number
  type: 'message' | 'file' | 'device_join' | 'device_leave'
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
}

import { NetworkSimulator, type NetworkEvent, type NetworkConfig } from '../network/simulator'
import { SyncManager } from '../sync/SyncManager'
import { DeviceDB } from '../storage/device-db'

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
  private networkSimulator: NetworkSimulator
  private totalGeneratedEvents = 0
  private syncManagers: Map<string, SyncManager> = new Map()
  private deviceDatabases: Map<string, DeviceDB> = new Map()
  private lastSyncTime = 0 // Track when we last ran sync

  constructor() {
    this.networkSimulator = new NetworkSimulator()
    
    // Set up network message delivery
    this.networkSimulator.onNetworkEvent((networkEvent: NetworkEvent) => {
      if (networkEvent.status === 'delivered' && networkEvent.type === 'message') {
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
        try {
          await syncManager.updateLocalState()
        } catch (error) {
          console.warn(`Sync tick failed for ${deviceId}:`, error)
        }
      }
      this.lastSyncTime = Math.floor(this.currentTime / syncInterval) * syncInterval
    }
  }

  async createMessageEvent(deviceId: string, content: string, simTime?: number) {
    const eventId = `msg-${deviceId}-${this.nextEventId++}`
    const event: SimulationEvent = {
      simTime: simTime ?? this.currentTime,
      type: 'message',
      deviceId,
      eventId,
      data: { content, eventId }
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
        this.eventTimeline.push({
          simTime: nextEventTime,
          type: 'message',
          deviceId: freq.deviceId,
          eventId,
          data: { 
            content: this.generateRandomMessage(),
            simulation_event_id: this.nextEventId,
            eventId
          }
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
    if (event.type === 'message' && event.eventId) {
      const db = this.deviceDatabases.get(event.deviceId)
      console.log(`[DEBUG] Looking for database for device ${event.deviceId}, found: ${db ? 'yes' : 'no'}`)
      console.log(`[DEBUG] Available databases: ${Array.from(this.deviceDatabases.keys()).join(', ')}`)
      if (db) {
        try {
          // Create encrypted payload (simplified for simulation)
          const payload = JSON.stringify({
            type: 'message',
            content: event.data.content,
            timestamp: event.simTime,
            author: event.deviceId
          })
          const encrypted = new TextEncoder().encode(payload)
          
          const insertedEventId = await db.insertEvent({
            device_id: event.deviceId,
            created_at: event.simTime,
            received_at: event.simTime,
            simulation_event_id: event.data.simulation_event_id,
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
      
      // NOTE: Direct broadcast disabled - rely on Bloom filter sync only
      // this.networkSimulator.broadcastEvent(event.deviceId, 'message', {
      //   content: event.data.content,
      //   eventId: event.eventId,
      //   timestamp: event.simTime
      // })
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
      const syncManager = new SyncManager(deviceId, this.networkSimulator, db)
      this.syncManagers.set(deviceId, syncManager)
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
}