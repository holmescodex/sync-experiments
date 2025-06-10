import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileReassembly } from '../../files/FileReassembly'
import initSqlJs, { type Database } from 'sql.js'
import { blake3 } from '@noble/hashes/blake3'
import { readFileSync } from 'fs'
import { join } from 'path'

// Mock PSK for testing
const TEST_PSK = new Uint8Array(32).fill(42)

interface PerformanceResult {
  fileSize: string
  totalEvents: number
  fileEvents: number
  discoveryTimeMs: number
  reassemblyTimeMs: number
  totalTimeMs: number
}

describe('FileReassembly Performance Tests', () => {
  let reassembly: FileReassembly
  let db: Database
  let SQL: any
  
  beforeEach(async () => {
    reassembly = new FileReassembly(TEST_PSK)
    
    // Initialize sql.js
    const wasmPath = join(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm')
    const wasmBinary = readFileSync(wasmPath)
    
    SQL = await initSqlJs({
      wasmBinary: wasmBinary
    })
    
    db = new SQL.Database()
    
    // Create events table matching our spec
    db.run(`
      CREATE TABLE events (
        arrival_seq  INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id     TEXT    UNIQUE NOT NULL,
        channel_id   TEXT    NOT NULL,
        authored_ts  INTEGER NOT NULL,
        ciphertext   BLOB    NOT NULL,
        file_id      TEXT,
        chunk_no     INTEGER,
        prf_tag      TEXT
      )
    `)
    
    db.run(`CREATE INDEX idx_file_id ON events(file_id)`)
    db.run(`CREATE INDEX idx_file_chunk ON events(file_id, chunk_no)`)
  })
  
  afterEach(() => {
    // Clean up database
    if (db) {
      db.close()
    }
  })
  
  /**
   * Generate noise events to fill the database
   */
  function generateNoiseEvents(count: number): void {
    const stmt = db.prepare(`
      INSERT INTO events (event_id, channel_id, authored_ts, ciphertext)
      VALUES (?, ?, ?, ?)
    `)
    
    // Use transactions for better performance
    db.run('BEGIN TRANSACTION')
    
    try {
      for (let i = 0; i < count; i++) {
        // Generate random noise event
        const ciphertext = crypto.getRandomValues(new Uint8Array(100 + Math.floor(Math.random() * 400)))
        const eventId = Buffer.from(blake3(ciphertext)).toString('hex')
        
        stmt.run([
          eventId,
          'general',
          Date.now() - Math.floor(Math.random() * 86400000), // Random time in last 24h
          ciphertext
        ])
      }
      
      db.run('COMMIT')
    } catch (e) {
      db.run('ROLLBACK')
      throw e
    } finally {
      stmt.free()
    }
  }
  
  /**
   * Insert file events into the database
   */
  function insertFileEvents(events: any[]): void {
    const stmt = db.prepare(`
      INSERT INTO events (event_id, channel_id, authored_ts, ciphertext, file_id, chunk_no, prf_tag)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    
    db.run('BEGIN TRANSACTION')
    
    try {
      for (const event of events) {
        stmt.run([
          event.event_id,
          event.channel_id,
          event.authored_ts,
          event.ciphertext,
          event.file_id,
          event.chunk_no,
          event.prf_tag
        ])
      }
      
      db.run('COMMIT')
    } catch (e) {
      db.run('ROLLBACK')
      throw e
    } finally {
      stmt.free()
    }
  }
  
  /**
   * Run performance test for a specific file size
   */
  async function runPerformanceTest(
    fileSize: number,
    noiseEventCount: number,
    description: string
  ): Promise<PerformanceResult> {
    // Generate test file
    const fileData = new Uint8Array(fileSize)
    for (let i = 0; i < fileSize; i++) {
      fileData[i] = (i * 13) % 256 // Deterministic pattern
    }
    
    // Chunk the file
    const startChunk = performance.now()
    const { fileId, events } = await reassembly.chunkFile(
      fileData,
      `test-${fileSize}.bin`,
      'application/octet-stream'
    )
    const chunkTime = performance.now() - startChunk
    console.log(`  Chunking ${description} took ${chunkTime.toFixed(2)}ms`)
    
    // Generate noise events
    console.log(`  Generating ${noiseEventCount.toLocaleString()} noise events...`)
    const startNoise = performance.now()
    generateNoiseEvents(noiseEventCount)
    const noiseTime = performance.now() - startNoise
    console.log(`  Noise generation took ${noiseTime.toFixed(2)}ms`)
    
    // Insert file events randomly throughout the noise
    console.log(`  Inserting ${events.length} file chunks...`)
    insertFileEvents(events)
    
    // Now test discovery and reassembly
    console.log(`  Testing file discovery and reassembly...`)
    
    // Test 1: Discover file chunks using SQL query
    const startDiscovery = performance.now()
    const query = reassembly.getFileChunksQuery(fileId)
    const stmt = db.prepare(query.sql)
    stmt.bind(query.params)
    const dbEvents = []
    while (stmt.step()) {
      dbEvents.push(stmt.getAsObject())
    }
    stmt.free()
    const discoveryTime = performance.now() - startDiscovery
    
    // Test 2: Reassemble file from discovered chunks
    const startReassembly = performance.now()
    const reassembled = await reassembly.reassembleFile(fileId, dbEvents.map(row => ({
      event_id: row.event_id,
      ciphertext: row.ciphertext,
      file_id: row.file_id,
      chunk_no: row.chunk_no,
      prf_tag: row.prf_tag
    })))
    const reassemblyTime = performance.now() - startReassembly
    
    // Verify reassembly worked
    expect(reassembled).not.toBeNull()
    expect(reassembled).toEqual(fileData)
    
    const totalTime = discoveryTime + reassemblyTime
    
    return {
      fileSize: description,
      totalEvents: noiseEventCount + events.length,
      fileEvents: events.length,
      discoveryTimeMs: discoveryTime,
      reassemblyTimeMs: reassemblyTime,
      totalTimeMs: totalTime
    }
  }
  
  describe('File Discovery and Reassembly Performance', () => {
    it('should efficiently discover and reassemble files from large event databases', async () => {
      console.log('\n=== FileReassembly Performance Test Results ===\n')
      
      const results: PerformanceResult[] = []
      
      // Test scenarios: [fileSize, noiseEvents, description]
      const scenarios: [number, number, string][] = [
        [100 * 1024, 10000, '100KB file in 10K events'],
        [100 * 1024, 100000, '100KB file in 100K events'],
        [1024 * 1024, 10000, '1MB file in 10K events'],
        [1024 * 1024, 100000, '1MB file in 100K events'],
        [10 * 1024 * 1024, 100000, '10MB file in 100K events'], // Reduced from 100MB for practical testing
      ]
      
      for (const [fileSize, noiseEvents, description] of scenarios) {
        console.log(`\nTesting: ${description}`)
        const result = await runPerformanceTest(fileSize, noiseEvents, description)
        results.push(result)
        
        console.log(`  Discovery time: ${result.discoveryTimeMs.toFixed(2)}ms`)
        console.log(`  Reassembly time: ${result.reassemblyTimeMs.toFixed(2)}ms`)
        console.log(`  Total time: ${result.totalTimeMs.toFixed(2)}ms`)
        console.log(`  Events/ms: ${(result.totalEvents / result.totalTimeMs).toFixed(0)}`)
      }
      
      // Print summary table
      console.log('\n=== Performance Summary ===\n')
      console.log('File Size | Total Events | File Chunks | Discovery (ms) | Reassembly (ms) | Total (ms)')
      console.log('----------|--------------|-------------|----------------|-----------------|------------')
      
      for (const result of results) {
        console.log(
          `${result.fileSize.padEnd(9)} | ` +
          `${result.totalEvents.toLocaleString().padStart(12)} | ` +
          `${result.fileEvents.toLocaleString().padStart(11)} | ` +
          `${result.discoveryTimeMs.toFixed(2).padStart(14)} | ` +
          `${result.reassemblyTimeMs.toFixed(2).padStart(15)} | ` +
          `${result.totalTimeMs.toFixed(2).padStart(10)}`
        )
      }
      
      // Performance assertions
      for (const result of results) {
        // Discovery should be fast with proper indexing
        // Allow more time for very large files (10MB = 20K chunks)
        const maxDiscoveryMs = result.fileEvents > 10000 ? 300 : 100
        expect(result.discoveryTimeMs).toBeLessThan(maxDiscoveryMs)
        
        // Reassembly time should scale linearly with file size
        const expectedMaxReassemblyMs = result.fileEvents * 2 // Allow 2ms per chunk
        expect(result.reassemblyTimeMs).toBeLessThan(expectedMaxReassemblyMs)
        
        // Total operation should complete quickly
        expect(result.totalTimeMs).toBeLessThan(5000) // 5 seconds max for any test
      }
    }, 60000) // 60 second timeout for all tests
  })
  
  describe('Query Performance', () => {
    it('should efficiently check file completeness', async () => {
      // Generate a large database
      generateNoiseEvents(50000)
      
      // Add multiple partial files
      const files = []
      for (let i = 0; i < 10; i++) {
        const fileData = new Uint8Array(100 * 1024) // 100KB files
        // Fill with deterministic pattern instead of random to avoid quota error
        for (let j = 0; j < fileData.length; j++) {
          fileData[j] = (j * 17 + i * 31) % 256
        }
        
        const { fileId, events } = await reassembly.chunkFile(
          fileData,
          `file-${i}.bin`,
          'application/octet-stream'
        )
        
        // Insert only some chunks for some files
        const eventsToInsert = i % 2 === 0 ? events : events.slice(0, Math.floor(events.length / 2))
        insertFileEvents(eventsToInsert)
        
        files.push({ fileId, totalChunks: events.length, insertedChunks: eventsToInsert.length })
      }
      
      // Test completeness query performance
      console.log('\n=== File Completeness Query Performance ===\n')
      
      for (const file of files) {
        const start = performance.now()
        const query = reassembly.getFileCompletenessQuery(file.fileId)
        const stmt = db.prepare(query.sql)
        stmt.bind(query.params)
        stmt.step()
        const result = stmt.getAsObject()
        stmt.free()
        const elapsed = performance.now() - start
        
        console.log(
          `File ${file.fileId}: ` +
          `${result.chunks_received}/${file.totalChunks} chunks, ` +
          `query took ${elapsed.toFixed(2)}ms`
        )
        
        expect(elapsed).toBeLessThan(10) // Should be very fast with indexes
        expect(result.chunks_received).toBe(file.insertedChunks)
      }
    })
  })
})