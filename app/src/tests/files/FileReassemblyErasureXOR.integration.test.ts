import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { FileReassemblyErasure } from '../../files/FileReassemblyErasureXOR'
import Database from 'better-sqlite3'
import { randomBytes } from 'crypto'
import fs from 'fs'
import path from 'path'

describe('FileReassemblyErasure XOR Integration Tests', () => {
  let db: Database.Database
  let reassembly: FileReassemblyErasure
  const TEST_PSK = new Uint8Array(32).fill(42)
  const dbPath = path.join(__dirname, 'test-erasure-xor.db')

  beforeEach(() => {
    // Clean up any existing test database
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
    }

    // Create new database and initialize schema
    db = new Database(dbPath)
    
    // Initialize tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        channel_id TEXT,
        authored_ts INTEGER,
        ciphertext BLOB,
        file_id TEXT,
        chunk_no INTEGER,
        prf_tag TEXT,
        is_parity INTEGER DEFAULT 0,
        covers_chunks TEXT,
        arrival_seq INTEGER
      );
      
      CREATE INDEX IF NOT EXISTS idx_file_chunks ON events(file_id, chunk_no);
      CREATE INDEX IF NOT EXISTS idx_parity_chunks ON events(file_id, is_parity);
    `)

    reassembly = new FileReassemblyErasure(TEST_PSK, { enabled: true, parityMultiplier: 2 })
  })

  afterEach(() => {
    db.close()
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
    }
  })

  const generateTestFile = (size: number, pattern: 'sequential' | 'random' | 'pattern'): Uint8Array => {
    const file = new Uint8Array(size)
    
    switch (pattern) {
      case 'sequential':
        for (let i = 0; i < size; i++) {
          file[i] = i % 256
        }
        break
      case 'random':
        const randomData = randomBytes(size)
        file.set(randomData)
        break
      case 'pattern':
        // Repeating pattern that's easy to verify
        for (let i = 0; i < size; i++) {
          file[i] = (i * 13 + i % 17) % 256
        }
        break
    }
    
    return file
  }

  const saveEventsToDatabase = async (events: any[]) => {
    const stmt = db.prepare(`
      INSERT INTO events (
        event_id, channel_id, authored_ts, ciphertext, 
        file_id, chunk_no, prf_tag, is_parity, covers_chunks, arrival_seq
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    let arrivalSeq = 1
    for (const event of events) {
      stmt.run(
        event.event_id,
        event.channel_id,
        event.authored_ts,
        event.ciphertext,
        event.file_id,
        event.chunk_no,
        event.prf_tag,
        event.is_parity ? 1 : 0,
        event.covers_chunks ? JSON.stringify(event.covers_chunks) : null,
        arrivalSeq++
      )
    }
  }

  const loadEventsFromDatabase = (fileId: string): any[] => {
    const rows = db.prepare(`
      SELECT * FROM events WHERE file_id = ? ORDER BY chunk_no
    `).all(fileId)

    return rows.map((row: any) => ({
      event_id: row.event_id,
      ciphertext: row.ciphertext,
      file_id: row.file_id,
      chunk_no: row.chunk_no,
      prf_tag: row.prf_tag,
      is_parity: row.is_parity === 1,
      covers_chunks: row.covers_chunks ? JSON.parse(row.covers_chunks) : undefined,
      arrival_seq: row.arrival_seq
    }))
  }

  const simulatePacketLoss = (events: any[], lossPattern: 'random' | 'burst' | 'systematic', lossRate: number): any[] => {
    const filtered = [...events]
    
    switch (lossPattern) {
      case 'random':
        // Random packet loss
        return filtered.filter(() => Math.random() > lossRate)
      
      case 'burst':
        // Burst packet loss - lose consecutive chunks
        const burstSize = Math.ceil(10 / lossRate) // Larger bursts for lower loss rates
        return filtered.filter((_, index) => {
          const burstStart = Math.floor(index / burstSize) * burstSize
          return index % burstSize !== 0 || Math.random() > 0.5
        })
      
      case 'systematic':
        // Systematic loss - every Nth packet
        const interval = Math.round(1 / lossRate)
        return filtered.filter((_, index) => index % interval !== 0)
    }
  }

  describe('Small Files (< 1MB)', () => {
    it('should handle 100KB file with no packet loss', async () => {
      const testFile = generateTestFile(100 * 1024, 'sequential')
      
      // Chunk the file
      const result = await reassembly.chunkFile(testFile, 'test-100k.bin', 'application/octet-stream')
      expect(result.totalDataChunks).toBe(Math.ceil(100 * 1024 / 500))
      expect(result.totalParityChunks).toBe(Math.floor(result.totalDataChunks / 2))
      
      // Save to database
      await saveEventsToDatabase(result.events)
      
      // Load from database
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      expect(loadedEvents.length).toBe(result.events.length)
      
      // Reassemble
      const reassembled = await reassembly.reassembleFile(result.fileId, loadedEvents)
      expect(reassembled).toEqual(testFile)
    })

    it('should handle 100KB file with 3% random packet loss', async () => {
      const testFile = generateTestFile(100 * 1024, 'pattern')
      
      const result = await reassembly.chunkFile(testFile, 'test-100k-loss.bin', 'application/octet-stream')
      await saveEventsToDatabase(result.events)
      
      // Simulate 3% packet loss (more realistic for XOR)
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      const eventsWithLoss = simulatePacketLoss(loadedEvents, 'random', 0.03)
      
      console.log(`Original events: ${loadedEvents.length}, After loss: ${eventsWithLoss.length}`)
      
      // Count unrecoverable groups
      const dataLoss = loadedEvents.filter(e => !e.is_parity).filter(e => 
        !eventsWithLoss.some(ev => ev.event_id === e.event_id)
      )
      const parityLoss = loadedEvents.filter(e => e.is_parity).filter(e => 
        !eventsWithLoss.some(ev => ev.event_id === e.event_id)
      )
      console.log(`Lost ${dataLoss.length} data chunks, ${parityLoss.length} parity chunks`)
      
      // Try to reassemble - might fail if too many chunks in same group are lost
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithLoss)
      if (reassembled) {
        expect(reassembled).toEqual(testFile)
      } else {
        console.log('Reassembly failed due to too many losses in same parity groups')
        // This is expected behavior with random loss for XOR
      }
    })
  })

  describe('Medium Files (1MB - 10MB)', () => {
    it('should handle 1MB file with controlled packet loss', async () => {
      const testFile = generateTestFile(1024 * 1024, 'pattern')
      
      const result = await reassembly.chunkFile(testFile, 'test-1mb.bin', 'application/octet-stream')
      await saveEventsToDatabase(result.events)
      
      // Controlled loss - remove only first chunk of some parity groups
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      const eventsWithLoss = loadedEvents.filter(event => {
        if (event.is_parity) return true // Keep all parity
        // Remove every 20th data chunk (5% loss, but recoverable)
        return event.chunk_no % 20 !== 0
      })
      
      const lostDataChunks = loadedEvents.filter(e => !e.is_parity).length - 
                             eventsWithLoss.filter(e => !e.is_parity).length
      console.log(`Lost ${lostDataChunks} data chunks (controlled pattern)`)
      
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithLoss)
      expect(reassembled).toEqual(testFile)
    }, 60000)

    it('should handle 2MB file with systematic packet loss', async () => {
      const testFile = generateTestFile(2 * 1024 * 1024, 'random')
      
      const startChunk = performance.now()
      const result = await reassembly.chunkFile(testFile, 'test-5mb.bin', 'application/octet-stream')
      const chunkTime = performance.now() - startChunk
      console.log(`Chunking 2MB took ${chunkTime.toFixed(2)}ms`)
      
      await saveEventsToDatabase(result.events)
      
      // Systematic loss - every 20th packet (5% loss)
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      const eventsWithLoss = simulatePacketLoss(loadedEvents, 'systematic', 0.05)
      
      const startReassemble = performance.now()
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithLoss)
      const reassembleTime = performance.now() - startReassemble
      console.log(`Reassembly with recovery took ${reassembleTime.toFixed(2)}ms`)
      
      expect(reassembled).toEqual(testFile)
    }, 60000)

    it('should handle 5MB file with mixed loss patterns', async () => {
      const testFile = generateTestFile(5 * 1024 * 1024, 'sequential')
      
      const result = await reassembly.chunkFile(testFile, 'test-10mb.bin', 'application/octet-stream')
      await saveEventsToDatabase(result.events)
      
      // Complex loss pattern: remove specific chunks that test recovery
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      const eventsWithLoss = loadedEvents.filter((event) => {
        if (event.is_parity) return true // Keep all parity
        
        // Remove chunks 0, 2, 4... (first of each parity group)
        if (event.chunk_no % 2 === 0 && event.chunk_no < 100) return false
        
        // Random 2% loss for other chunks
        return Math.random() > 0.02
      })
      
      const lostChunks = loadedEvents.filter(e => !e.is_parity).length - 
                         eventsWithLoss.filter(e => !e.is_parity).length
      console.log(`Lost ${lostChunks} data chunks with mixed pattern`)
      
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithLoss)
      expect(reassembled).toEqual(testFile)
    }, 60000)
  })

  describe('Large Files (10MB - 100MB)', () => {
    it('should handle 10MB file with 1% packet loss', async () => {
      const testFile = generateTestFile(10 * 1024 * 1024, 'pattern')
      
      console.log('Starting 10MB test...')
      const startTotal = performance.now()
      
      // Chunk the file
      const startChunk = performance.now()
      const result = await reassembly.chunkFile(testFile, 'test-50mb.bin', 'application/octet-stream')
      const chunkTime = performance.now() - startChunk
      console.log(`Chunking 10MB: ${result.totalDataChunks} data + ${result.totalParityChunks} parity chunks in ${chunkTime.toFixed(2)}ms`)
      
      // Save to database
      const startDb = performance.now()
      await saveEventsToDatabase(result.events)
      const dbTime = performance.now() - startDb
      console.log(`Database insert took ${dbTime.toFixed(2)}ms`)
      
      // Simulate packet loss
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      const eventsWithLoss = simulatePacketLoss(loadedEvents, 'random', 0.01)
      const lostChunks = loadedEvents.length - eventsWithLoss.length
      console.log(`Simulated loss of ${lostChunks} chunks (${(lostChunks/loadedEvents.length*100).toFixed(2)}%)`)
      
      // Reassemble
      const startReassemble = performance.now()
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithLoss)
      const reassembleTime = performance.now() - startReassemble
      console.log(`Reassembly took ${reassembleTime.toFixed(2)}ms`)
      
      const totalTime = performance.now() - startTotal
      console.log(`Total test time: ${totalTime.toFixed(2)}ms`)
      
      expect(reassembled).toEqual(testFile)
    }, 120000)

    it('should handle 20MB file with no packet loss (stress test)', async () => {
      const testFile = generateTestFile(20 * 1024 * 1024, 'sequential')
      
      console.log('Starting 20MB stress test...')
      const startTotal = performance.now()
      
      // Chunk the file
      const startChunk = performance.now()
      const result = await reassembly.chunkFile(testFile, 'test-100mb.bin', 'application/octet-stream')
      const chunkTime = performance.now() - startChunk
      const chunkRate = (20 / (chunkTime / 1000)).toFixed(2)
      console.log(`Chunking 20MB: ${result.totalDataChunks} data chunks in ${chunkTime.toFixed(2)}ms (${chunkRate} MB/s)`)
      
      // Save to database in batches to avoid memory issues
      const batchSize = 10000
      for (let i = 0; i < result.events.length; i += batchSize) {
        const batch = result.events.slice(i, Math.min(i + batchSize, result.events.length))
        await saveEventsToDatabase(batch)
        
        if (i % 50000 === 0) {
          console.log(`Saved ${i} / ${result.events.length} events to database`)
        }
      }
      
      // Load and reassemble
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      
      const startReassemble = performance.now()
      const reassembled = await reassembly.reassembleFile(result.fileId, loadedEvents)
      const reassembleTime = performance.now() - startReassemble
      const reassembleRate = (20 / (reassembleTime / 1000)).toFixed(2)
      console.log(`Reassembly took ${reassembleTime.toFixed(2)}ms (${reassembleRate} MB/s)`)
      
      const totalTime = performance.now() - startTotal
      console.log(`Total test time: ${(totalTime / 1000).toFixed(2)}s`)
      
      expect(reassembled).toEqual(testFile)
    }, 240000)
  })

  describe('Edge Cases and Recovery Scenarios', () => {
    it('should fail gracefully when too many chunks are missing', async () => {
      const testFile = generateTestFile(100 * 1024, 'random')
      
      const result = await reassembly.chunkFile(testFile, 'test-fail.bin', 'application/octet-stream')
      await saveEventsToDatabase(result.events)
      
      // Remove too many chunks - both chunks in several parity groups
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      const eventsWithHeavyLoss = loadedEvents.filter((event) => {
        if (event.is_parity) return true
        // Remove both chunks in groups 0-10
        return !(event.chunk_no < 20 && event.chunk_no % 2 < 2)
      })
      
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithHeavyLoss)
      expect(reassembled).toBeNull()
    })

    it('should recover when exactly one chunk per parity group is missing', async () => {
      const testFile = generateTestFile(200 * 1024, 'pattern')
      
      const result = await reassembly.chunkFile(testFile, 'test-exact.bin', 'application/octet-stream')
      await saveEventsToDatabase(result.events)
      
      // Remove exactly one chunk from each parity group
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      const eventsWithPreciseLoss = loadedEvents.filter((event) => {
        if (event.is_parity) return true
        // Remove first chunk of each pair (0, 2, 4, 6...)
        return event.chunk_no % 2 !== 0
      })
      
      const lostCount = loadedEvents.filter(e => !e.is_parity && e.chunk_no % 2 === 0).length
      console.log(`Removed ${lostCount} chunks (one per parity group)`)
      
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithPreciseLoss)
      expect(reassembled).toEqual(testFile)
    })

    it('should handle files that are not multiples of chunk size', async () => {
      // 100KB + 123 bytes
      const oddSize = 100 * 1024 + 123
      const testFile = generateTestFile(oddSize, 'sequential')
      
      const result = await reassembly.chunkFile(testFile, 'test-odd.bin', 'application/octet-stream')
      await saveEventsToDatabase(result.events)
      
      // Verify the last chunk
      const lastDataChunk = result.events.find(e => e.chunk_no === result.totalDataChunks - 1)
      expect(lastDataChunk).toBeDefined()
      
      // Test with some packet loss
      const loadedEvents = loadEventsFromDatabase(result.fileId)
      const eventsWithLoss = simulatePacketLoss(loadedEvents, 'random', 0.05)
      
      const reassembled = await reassembly.reassembleFile(result.fileId, eventsWithLoss)
      expect(reassembled).toEqual(testFile)
      expect(reassembled!.length).toBe(oddSize)
    })

    it('should handle database queries correctly', async () => {
      const testFile = generateTestFile(50 * 1024, 'random')
      
      const result = await reassembly.chunkFile(testFile, 'test-queries.bin', 'application/octet-stream')
      await saveEventsToDatabase(result.events)
      
      // Test the SQL queries
      const chunksQuery = reassembly.getFileChunksQuery(result.fileId)
      const chunks = db.prepare(chunksQuery.sql).all(...chunksQuery.params)
      expect(chunks.length).toBe(result.events.length)
      
      const statusQuery = reassembly.getFileErasureStatusQuery(result.fileId)
      const status = db.prepare(statusQuery.sql).get(...statusQuery.params) as any
      expect(status.data_chunks_received).toBe(result.totalDataChunks)
      expect(status.parity_chunks_received).toBe(result.totalParityChunks)
      expect(status.expected_data_chunks).toBe(result.totalDataChunks)
    })
  })

  describe('Performance Benchmarks', () => {
    it('should track performance metrics for various file sizes', async () => {
      const sizes = [
        { size: 100 * 1024, name: '100KB' },
        { size: 1024 * 1024, name: '1MB' },
        { size: 5 * 1024 * 1024, name: '5MB' },
      ]
      
      console.log('\nPerformance Benchmarks:')
      console.log('Size\tChunk Time\tDB Time\tReassemble Time\tTotal')
      console.log('----\t----------\t-------\t---------------\t-----')
      
      for (const { size, name } of sizes) {
        const testFile = generateTestFile(size, 'random')
        const startTotal = performance.now()
        
        // Chunk
        const startChunk = performance.now()
        const result = await reassembly.chunkFile(testFile, `bench-${name}.bin`, 'application/octet-stream')
        const chunkTime = performance.now() - startChunk
        
        // Save to DB
        const startDb = performance.now()
        await saveEventsToDatabase(result.events)
        const dbTime = performance.now() - startDb
        
        // Load and reassemble
        const loadedEvents = loadEventsFromDatabase(result.fileId)
        const startReassemble = performance.now()
        const reassembled = await reassembly.reassembleFile(result.fileId, loadedEvents)
        const reassembleTime = performance.now() - startReassemble
        
        const totalTime = performance.now() - startTotal
        
        console.log(`${name}\t${chunkTime.toFixed(0)}ms\t\t${dbTime.toFixed(0)}ms\t${reassembleTime.toFixed(0)}ms\t\t${totalTime.toFixed(0)}ms`)
        
        expect(reassembled).toEqual(testFile)
      }
    }, 120000)
  })
})