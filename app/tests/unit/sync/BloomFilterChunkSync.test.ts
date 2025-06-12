import { describe, it, expect, beforeEach } from 'vitest'
import { SimulationEngine } from '../../simulation/engine'
import { FileChunkHandler } from '../../files/FileChunkHandler'

function extractChunkEvents(events: any[]) {
  return events.filter(e => {
    try {
      const payload = JSON.parse(new TextDecoder().decode(new Uint8Array(e.payload.encrypted)))
      return payload.type === 'file_chunk'
    } catch {
      return false
    }
  })
}

describe('Bloom filter file chunk sync', () => {
  let engine: SimulationEngine

  beforeEach(async () => {
    engine = new SimulationEngine()
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: true },
      { deviceId: 'bob', messagesPerHour: 0, enabled: true }
    ])
  })

  it('stops sending known chunks after bloom filter exchange and syncs full file', async () => {
    const network = engine.getNetworkSimulator()
    const aliceDB = engine.getDeviceDatabase('alice')!
    const bobDB = engine.getDeviceDatabase('bob')!

    const bobChunks = new FileChunkHandler('bob', bobDB, network)
    const data = new Uint8Array(1500).map((_, i) => i % 256)
    const meta = await bobChunks.uploadFile(data, 'application/octet-stream', 'test.bin')

    const aliceSync = engine.getSyncManager('alice')!
    const bobSync = engine.getSyncManager('bob')!

    await aliceSync.updateLocalState()
    await bobSync.updateLocalState()

    // First round - Alice requests from Bob
    await aliceSync.triggerSyncWith('bob')
    for (let i = 0; i < 10; i++) await engine.tick()

    const eventsAfterFirst = network.getNetworkEvents()
    const firstChunkEvents = extractChunkEvents(eventsAfterFirst.filter(e => e.sourceDevice === 'bob' && e.targetDevice === 'alice'))
    expect(firstChunkEvents.length).toBe(meta.chunkCount)

    // Alice should now have all chunks
    const aliceEvents = await aliceDB.getAllEvents()
    const aliceChunks = aliceEvents.filter(e => {
      const payload = JSON.parse(new TextDecoder().decode(e.encrypted))
      return payload.type === 'file_chunk'
    })
    expect(aliceChunks.length).toBe(meta.chunkCount)

    // Update bloom filters with new state
    await aliceSync.updateLocalState()
    await bobSync.updateLocalState()

    const countBeforeSecond = network.getNetworkEvents().length
    await aliceSync.triggerSyncWith('bob')
    for (let i = 0; i < 5; i++) await engine.tick()
    const newEvents = network.getNetworkEvents().slice(countBeforeSecond)
    const secondChunkEvents = extractChunkEvents(newEvents.filter(e => e.sourceDevice === 'bob' && e.targetDevice === 'alice'))
    expect(secondChunkEvents.length).toBe(0)
  })
})
