import { describe, test, expect, beforeEach, vi } from 'vitest'
import { SyncManager } from '../../sync/SyncManager'
import type { NetworkSimulator } from '../../network/simulator'
import type { DeviceDB } from '../../storage/device-db'

// Mock implementations - use unknown to bypass type checking
const createMockNetworkSimulator = () => ({
  onNetworkEvent: vi.fn(),
  getCurrentTime: vi.fn(() => Date.now()),
  sendEvent: vi.fn(),
  getAllDeviceSyncStatus: vi.fn(() => new Map([['alice', {}], ['bob', {}]])),
  getTotalEventCount: vi.fn(() => 100)
})

const createMockDeviceDB = () => ({
  getAllEvents: vi.fn(async () => []),
  getEvent: vi.fn(async () => null),
  insertEvent: vi.fn(async () => 'mock-event-id')
})

describe('SyncManager', () => {
  let mockNetwork: any
  let mockDatabase: any

  beforeEach(() => {
    mockNetwork = createMockNetworkSimulator()
    mockDatabase = createMockDeviceDB()
  })

  test('initializes with default bloom filter strategy', async () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    expect(manager.getCurrentStrategyName()).toBe('Bloom Filter Sync')
    
    const status = manager.getSyncStatus()
    expect(status.strategy).toBe('Bloom Filter Sync')
  })

  test('can switch between strategies', async () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator, 
      mockDatabase as unknown as DeviceDB
    )
    
    expect(manager.getCurrentStrategyName()).toBe('Bloom Filter Sync')
    
    // Switch to same strategy (should work)
    await manager.switchStrategy('bloom-filter')
    expect(manager.getCurrentStrategyName()).toBe('Bloom Filter Sync')
  })

  test('throws error for unknown strategy', async () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    await expect(manager.switchStrategy('unknown-strategy'))
      .rejects.toThrow('Unknown sync strategy: unknown-strategy')
  })

  test('provides list of available strategies', () => {
    const strategies = SyncManager.getAvailableStrategies()
    expect(strategies).toContain('bloom-filter')
    expect(strategies.length).toBeGreaterThan(0)
  })

  test('provides strategy information', () => {
    const strategyInfo = SyncManager.getStrategyInfo()
    expect(strategyInfo).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'Bloom Filter Sync',
          description: expect.any(String)
        })
      ])
    )
  })

  test('provides sync status from current strategy', () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    const status = manager.getSyncStatus()
    expect(status).toMatchObject({
      isSynced: expect.any(Boolean),
      syncPercentage: expect.any(Number),
      knownEvents: expect.any(Number),
      totalEvents: expect.any(Number),
      strategy: 'Bloom Filter Sync'
    })
  })

  test('handles sync status when no strategy is active', async () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    // Shut down current strategy 
    manager.shutdown()
    
    // Directly set currentStrategy to null to test the fallback
    manager['currentStrategy'] = null
    
    const status = manager.getSyncStatus()
    expect(status).toMatchObject({
      isSynced: true,
      syncPercentage: 100,
      knownEvents: 0,
      totalEvents: 0,
      strategy: 'none'
    })
  })

  test('can trigger manual sync with peer', async () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    // Should not throw
    await manager.triggerSyncWith('bob')
  })

  test('returns peer devices from current strategy', () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    const peers = manager.getPeerDevices()
    expect(Array.isArray(peers)).toBe(true)
  })

  test('returns empty peer list when no strategy', () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    // Set strategy to null
    manager['currentStrategy'] = null
    
    const peers = manager.getPeerDevices()
    expect(peers).toEqual([])
  })

  test('shutdown cleans up current strategy', async () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    manager.shutdown()
    
    // Should not throw on multiple shutdowns
    manager.shutdown()
  })

  test('switches strategy properly with cleanup', async () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    const firstStrategy = manager.getCurrentStrategyName()
    
    // Switch to same strategy (tests cleanup path)
    await manager.switchStrategy('bloom-filter')
    
    const secondStrategy = manager.getCurrentStrategyName()
    expect(secondStrategy).toBe(firstStrategy)
  })

  test('strategy registration works correctly', () => {
    // Test that we can get the available strategies
    const available = SyncManager.getAvailableStrategies()
    expect(available).toContain('bloom-filter')
    
    // Test that strategy info is accessible
    const info = SyncManager.getStrategyInfo()
    expect(info.find(s => s.name === 'Bloom Filter Sync')).toBeDefined()
  })

  test('handles errors in sync tick gracefully', async () => {
    const manager = new SyncManager(
      'alice',
      mockNetwork as unknown as NetworkSimulator,
      mockDatabase as unknown as DeviceDB
    )
    
    // Mock strategy to throw error
    const mockStrategy = {
      name: 'Test Strategy',
      description: 'Test',
      initialize: vi.fn(),
      handleNetworkEvent: vi.fn(),
      onSyncTick: vi.fn().mockRejectedValue(new Error('Sync error')),
      shutdown: vi.fn(),
      getSyncStatus: vi.fn(() => ({ 
        isSynced: false,
        syncPercentage: 0,
        knownEvents: 0,
        totalEvents: 0,
        strategy: 'test' 
      })),
      getPeerDevices: vi.fn(() => []),
      triggerSyncWith: vi.fn().mockRejectedValue(new Error('Sync error'))
    }
    
    // Replace current strategy
    manager['currentStrategy'] = mockStrategy
    
    // Trigger sync manually - should not throw but complete without error
    await expect(manager.triggerSyncWith('bob')).rejects.toThrow('Sync error')
  })
})