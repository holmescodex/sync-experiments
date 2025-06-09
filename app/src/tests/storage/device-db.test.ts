import { describe, test, expect, beforeEach } from 'vitest'
import { DeviceDB } from '../../storage/device-db'

describe('DeviceDB', () => {
  let db: DeviceDB

  beforeEach(async () => {
    db = new DeviceDB('alice')
    await db.initialize()
  })

  test('creates database with events table', async () => {
    // Using alice/bob for Phase 1
    // TODO: Future - Human-readable names from device IDs using library like 'human-id'
    // Generate names from public key hashes: device_id "0x1234..." → "brave-salmon"
    
    const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table'")
    expect(tables.some(row => row.name === 'events')).toBe(true)
  })
  
  test('stores and retrieves events', async () => {
    const event = {
      device_id: 'alice',
      created_at: 1000, // Device's wall-clock time when created (starts as sim-time)
      received_at: 1000, // This device's wall-clock time when received
      simulation_event_id: 42, // For debugging - which sim event caused this
      encrypted: new Uint8Array([1, 2, 3])
    }
    
    const eventId = await db.insertEvent(event) // Returns computed hash
    const retrieved = await db.getEvent(eventId)
    
    expect(retrieved).toEqual(event)
  })
  
  test('returns events in chronological order', async () => {
    // Create events with different encrypted content so they get different event_ids
    const event1 = {
      device_id: 'alice',
      received_at: 1000,
      simulation_event_id: 1,
      created_at: 2000,
      encrypted: new Uint8Array([1, 2, 3])
    }
    
    const event2 = {
      device_id: 'alice',
      received_at: 1000,
      simulation_event_id: 2,
      created_at: 1000,
      encrypted: new Uint8Array([4, 5, 6])
    }
    
    const event3 = {
      device_id: 'alice',
      received_at: 1000,
      simulation_event_id: 3,
      created_at: 3000,
      encrypted: new Uint8Array([7, 8, 9])
    }
    
    await db.insertEvent(event1)
    await db.insertEvent(event2)
    await db.insertEvent(event3)
    
    const events = await db.getAllEvents()
    // Verify ordering by created_at, not event_id
    expect(events).toHaveLength(3)
    expect(events[0].created_at).toBe(1000)
    expect(events[1].created_at).toBe(2000)
    expect(events[2].created_at).toBe(3000)
  })
  
  test('handles database isolation between devices', async () => {
    const dbAlice = new DeviceDB('alice')
    const dbBob = new DeviceDB('bob')
    await dbAlice.initialize()
    await dbBob.initialize()
    
    const baseEvent = {
      received_at: 1000,
      simulation_event_id: 1,
      encrypted: new Uint8Array([1, 2, 3]),
      created_at: 1000
    }
    
    await dbAlice.insertEvent({...baseEvent, device_id: 'alice'})
    await dbBob.insertEvent({...baseEvent, device_id: 'bob'})
    
    const eventsAlice = await dbAlice.getAllEvents()
    const eventsBob = await dbBob.getAllEvents()
    
    expect(eventsAlice).toHaveLength(1)
    expect(eventsBob).toHaveLength(1)
    expect(eventsAlice[0].device_id).toBe('alice')
    expect(eventsBob[0].device_id).toBe('bob')
  })
  
  test('computes consistent event IDs from encrypted content', async () => {
    const event1 = {
      device_id: 'alice',
      created_at: 1000,
      received_at: 1000,
      encrypted: new Uint8Array([1, 2, 3, 4])
    }
    
    const event2 = {
      device_id: 'bob', // Different device
      created_at: 2000, // Different time
      received_at: 2000,
      encrypted: new Uint8Array([1, 2, 3, 4]) // Same encrypted content
    }
    
    const id1 = await db.insertEvent(event1)
    const id2 = await db.insertEvent(event2)
    
    // Same encrypted content should produce same event ID
    expect(id1).toBe(id2)
    expect(id1).toMatch(/^[a-f0-9]{16}$/) // 16 char hex string
  })
})