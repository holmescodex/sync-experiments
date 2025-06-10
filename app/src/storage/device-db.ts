import initSqlJs, { type Database } from 'sql.js'
import { hash } from 'tweetnacl'

export interface Event {
  event_id: string           // Content-addressed hash of encrypted payload
  device_id: string          // Device that created this event
  created_at: number         // Device's wall-clock time when created
  received_at: number        // This device's wall-clock time when received
  simulation_event_id?: number // For debugging - which sim event caused this
  encrypted: Uint8Array      // AEAD encrypted payload
}

export class DeviceDB {
  private db: Database | null = null
  private SQL: any = null

  public deviceId: string
  
  constructor(deviceId: string) {
    this.deviceId = deviceId
  }

  async initialize() {
    // Initialize sql.js
    // Check if we're in Node.js (test environment) or browser
    if (typeof window === 'undefined') {
      // Node.js environment (tests)
      const { readFileSync } = await import('fs')
      const { join } = await import('path')
      const wasmPath = join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
      const wasmBinary = readFileSync(wasmPath)
      
      this.SQL = await initSqlJs({
        wasmBinary: wasmBinary
      })
    } else {
      // Browser environment
      this.SQL = await initSqlJs({
        locateFile: (file: string) => `node_modules/sql.js/dist/${file}`
      })
    }
    
    this.db = new this.SQL.Database()
    
    // Create events table with event_id as primary key
    this.db!.run(`
      CREATE TABLE events (
        event_id TEXT PRIMARY KEY,
        device_id TEXT,
        created_at INTEGER,
        received_at INTEGER,
        simulation_event_id INTEGER,
        encrypted BLOB
      )
    `)
  }

  async insertEvent(event: Omit<Event, 'event_id'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized')
    
    const eventId = this.computeEventId(event.encrypted)
    
    // Insert with computed event_id as primary key
    this.db.run(`
      INSERT OR REPLACE INTO events (
        event_id, device_id, created_at, received_at, simulation_event_id, encrypted
      ) VALUES (?, ?, ?, ?, ?, ?)
    `, [
      eventId,
      event.device_id,
      event.created_at,
      event.received_at,
      event.simulation_event_id || null,
      event.encrypted
    ])
    
    return eventId
  }

  async getEvent(eventId: string): Promise<Event | null> {
    if (!this.db) throw new Error('Database not initialized')
    
    const stmt = this.db.prepare('SELECT * FROM events WHERE event_id = ?')
    stmt.bind([eventId])
    
    if (!stmt.step()) {
      stmt.free()
      return null
    }
    
    const result = stmt.getAsObject()
    stmt.free()
    
    return {
      event_id: result.event_id as string,
      device_id: result.device_id as string,
      created_at: result.created_at as number,
      received_at: result.received_at as number,
      simulation_event_id: result.simulation_event_id as number,
      encrypted: new Uint8Array(result.encrypted as ArrayBuffer)
    }
  }

  async getAllEvents(): Promise<Event[]> {
    if (!this.db) throw new Error('Database not initialized')
    
    // Order by created_at (when original device created it)
    const stmt = this.db.prepare('SELECT * FROM events ORDER BY created_at ASC')
    const results: Event[] = []
    
    while (stmt.step()) {
      const row = stmt.getAsObject()
      results.push({
        event_id: row.event_id as string,
        device_id: row.device_id as string,
        created_at: row.created_at as number,
        received_at: row.received_at as number,
        simulation_event_id: row.simulation_event_id as number,
        encrypted: new Uint8Array(row.encrypted as ArrayBuffer)
      })
    }
    
    stmt.free()
    return results
  }

  async query(sql: string): Promise<any[]> {
    if (!this.db) throw new Error('Database not initialized')
    
    const stmt = this.db.prepare(sql)
    const results: any[] = []
    
    while (stmt.step()) {
      results.push(stmt.getAsObject())
    }
    
    stmt.free()
    return results
  }

  private computeEventId(encrypted: Uint8Array): string {
    // Convert to proper Uint8Array if needed (handle different contexts in Node.js vs browser)
    const encryptedBytes = encrypted instanceof Uint8Array ? encrypted : new Uint8Array(encrypted)
    
    const hashBytes = hash(encryptedBytes)
    return Array.from(hashBytes.slice(0, 8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  // For UI updates - get events as they arrive, even if out of order
  onNewEvent(_callback: (event: Event) => void): void {
    // Subscribe to new events by received_at order
    // TODO: Implement event subscription mechanism
  }
}