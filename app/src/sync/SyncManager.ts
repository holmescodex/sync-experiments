import type { SyncStrategy, SyncStrategyConstructor, SyncStrategyRegistry, SyncStatus } from './SyncStrategy.interface'
import type { NetworkSimulator } from '../network/simulator'
import type { DeviceDB } from '../storage/device-db'
import { BloomFilterStrategy } from './strategies/BloomFilterStrategy'

/**
 * SyncManager orchestrates sync strategies and enables switching between them
 */
export class SyncManager {
  private static strategies: SyncStrategyRegistry = {
    'bloom-filter': BloomFilterStrategy,
    // Future strategies can be added here
    // 'gossip': GossipStrategy,
    // 'want-list': WantListStrategy,
  }
  
  private currentStrategy: SyncStrategy | null = null
  private deviceId = ''
  private network: NetworkSimulator | null = null
  private database: DeviceDB | null = null
  private syncIntervalId: NodeJS.Timeout | null = null
  
  constructor(
    deviceId: string,
    network: NetworkSimulator,
    database: DeviceDB,
    initialStrategy: string = 'bloom-filter'
  ) {
    this.deviceId = deviceId
    this.network = network
    this.database = database
    
    // Initialize with the specified strategy
    this.switchStrategy(initialStrategy)
  }
  
  /**
   * Switch to a different sync strategy
   */
  async switchStrategy(strategyName: string): Promise<void> {
    // Clean up current strategy
    if (this.currentStrategy) {
      this.currentStrategy.shutdown()
      this.stopSyncLoop()
    }
    
    // Create new strategy
    const StrategyClass = SyncManager.strategies[strategyName]
    if (!StrategyClass) {
      throw new Error(`Unknown sync strategy: ${strategyName}`)
    }
    
    this.currentStrategy = new StrategyClass()
    
    // Initialize the new strategy
    if (this.network && this.database) {
      await this.currentStrategy.initialize(this.deviceId, this.network, this.database)
      // Don't start the real-time sync loop - let the simulation engine control sync timing
      // this.startSyncLoop()
    }
  }
  
  /**
   * Get current sync status
   */
  getSyncStatus(): SyncStatus {
    if (!this.currentStrategy) {
      return {
        isSynced: true,
        syncPercentage: 100,
        knownEvents: 0,
        totalEvents: 0,
        strategy: 'none'
      }
    }
    
    return this.currentStrategy.getSyncStatus()
  }
  
  /**
   * Get the current strategy name
   */
  getCurrentStrategyName(): string {
    return this.currentStrategy?.name || 'none'
  }
  
  /**
   * Get list of available strategies
   */
  static getAvailableStrategies(): string[] {
    return Object.keys(SyncManager.strategies)
  }
  
  /**
   * Get strategy descriptions
   */
  static getStrategyInfo(): Array<{name: string, description: string}> {
    return Object.entries(SyncManager.strategies).map(([key, StrategyClass]) => {
      const instance = new StrategyClass()
      return {
        name: instance.name,
        description: instance.description
      }
    })
  }
  
  /**
   * Manually trigger sync with a specific peer (for testing)
   */
  async triggerSyncWith(peerId: string): Promise<void> {
    if (this.currentStrategy) {
      await this.currentStrategy.triggerSyncWith(peerId)
    }
  }
  
  /**
   * Update local state (like Bloom filter) after new events are added
   */
  async updateLocalState(): Promise<void> {
    if (this.currentStrategy) {
      await this.currentStrategy.onSyncTick()
    }
  }
  
  /**
   * Get list of peer devices
   */
  getPeerDevices(): string[] {
    return this.currentStrategy?.getPeerDevices() || []
  }
  
  /**
   * Get the current strategy instance (for testing)
   */
  getStrategy(): SyncStrategy | null {
    return this.currentStrategy
  }
  
  /**
   * Shutdown the sync manager
   */
  shutdown(): void {
    if (this.currentStrategy) {
      this.currentStrategy.shutdown()
    }
    this.stopSyncLoop()
  }
  
  // Private methods
  
  /**
   * Start the sync loop that calls onSyncTick every second
   */
  private startSyncLoop(): void {
    this.syncIntervalId = setInterval(async () => {
      if (this.currentStrategy) {
        try {
          await this.currentStrategy.onSyncTick()
        } catch (error) {
          console.warn('Error in sync tick:', error)
        }
      }
    }, 1000) // Tick every second
  }
  
  /**
   * Stop the sync loop
   */
  private stopSyncLoop(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId)
      this.syncIntervalId = null
    }
  }
  
  /**
   * Register a new sync strategy (for future extensibility)
   */
  static registerStrategy(name: string, StrategyClass: SyncStrategyConstructor): void {
    SyncManager.strategies[name] = StrategyClass
  }
}