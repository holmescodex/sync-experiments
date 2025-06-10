import type { NetworkEvent } from '../network/simulator'
import type { DeviceDB } from '../storage/device-db'
import type { NetworkSimulator } from '../network/simulator'

export interface SyncStatus {
  isSynced: boolean
  syncPercentage: number
  knownEvents: number
  totalEvents: number
  strategy: string
}

export interface SyncStrategy {
  readonly name: string
  readonly description: string
  
  /**
   * Initialize the sync strategy for a specific device
   */
  initialize(deviceId: string, network: NetworkSimulator, database: DeviceDB, ...args: any[]): Promise<void>
  
  /**
   * Handle incoming network events (bloom filters, messages, etc.)
   */
  handleNetworkEvent(event: NetworkEvent): Promise<void>
  
  /**
   * Periodic sync tick - called every second to perform sync operations
   */
  onSyncTick(): Promise<void>
  
  /**
   * Get current sync status for UI display
   */
  getSyncStatus(): SyncStatus
  
  /**
   * Get list of peer devices this strategy is syncing with
   */
  getPeerDevices(): string[]
  
  /**
   * Manually trigger sync with a specific peer (for testing)
   */
  triggerSyncWith(peerId: string): Promise<void>
  
  /**
   * Clean up resources when strategy is no longer needed
   */
  shutdown(): void
}

export interface SyncStrategyConstructor {
  new(): SyncStrategy
}

export interface SyncStrategyRegistry {
  [strategyName: string]: SyncStrategyConstructor
}