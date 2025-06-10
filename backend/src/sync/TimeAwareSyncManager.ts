import { SyncManager } from './SyncManager'
import { TimeListener, TimeEvent } from '../simulation/TimeController'
import { InMemoryStore } from '../storage/InMemoryStore'
import { NetworkSimulator } from '../network/NetworkSimulator'
import { MessageGenerator } from '../crypto/MessageGenerator'

interface TimeAwareSyncConfig {
  deviceId: string
  syncInterval?: number // In simulation time, not real time
}

/**
 * TimeAwareSyncManager extends SyncManager to work with TimeController
 * for deterministic simulation time management
 */
export class TimeAwareSyncManager extends SyncManager implements TimeListener {
  private simulationTime: number = 0
  private lastSyncTime: number = 0
  private syncIntervalMs: number
  
  constructor(
    config: TimeAwareSyncConfig,
    store: InMemoryStore,
    networkSimulator: NetworkSimulator,
    messageGenerator: MessageGenerator
  ) {
    super(config, store, networkSimulator, messageGenerator)
    this.syncIntervalMs = config.syncInterval || 5000
  }
  
  /**
   * Override start to not use real-time intervals
   */
  async start() {
    console.log(`[TimeAwareSyncManager] Starting sync for ${this.config.deviceId}`)
    this.isRunning = true
    
    // Update bloom filter with current events
    await this['updateBloomFilter']()
    
    // Do initial sync
    await this['performSync']()
  }
  
  /**
   * Override stop to not clear real-time intervals
   */
  stop() {
    this.isRunning = false
  }
  
  /**
   * Handle time tick from TimeController
   */
  onTimeTick(event: TimeEvent): void {
    this.simulationTime = event.simulationTime
    
    // Update network simulator time
    this.tick(this.simulationTime)
    
    // Check if it's time to sync
    if (this.simulationTime - this.lastSyncTime >= this.syncIntervalMs) {
      if (this.isRunning) {
        this['performSync']()
      }
      this.lastSyncTime = Math.floor(this.simulationTime / this.syncIntervalMs) * this.syncIntervalMs
    }
  }
  
  /**
   * Get current simulation time
   */
  getSimulationTime(): number {
    return this.simulationTime
  }
  
  /**
   * Reset sync manager state
   */
  reset() {
    this.stop()
    this.simulationTime = 0
    this.lastSyncTime = 0
  }
}