import { describe, it, expect } from 'vitest'
import { encode, reconstruct } from 'wasm-reed-solomon-erasure'

describe('Reed-Solomon Library Test', () => {
  it('should find the maximum shard limit', async () => {
    console.log('Finding maximum shard limit for wasm-reed-solomon-erasure...')
    
    // Test various shard counts to find the limit
    const testSizes = [16, 32, 64, 128, 255, 256]
    let maxWorking = 0
    
    for (const size of testSizes) {
      try {
        console.log(`\nTesting ${size} shards...`)
        const shards = []
        for (let i = 0; i < size; i++) {
          const data = new Uint8Array(10)
          for (let j = 0; j < 10; j++) {
            data[j] = (i * 10 + j) % 256
          }
          shards.push(data)
        }
        
        const parityCount = Math.floor(size / 2)
        const encoded = encode(shards, parityCount)
        console.log(`✓ Success with ${size} data shards + ${parityCount} parity shards`)
        maxWorking = size
      } catch (error) {
        console.log(`✗ Failed with ${size} shards: ${error.message}`)
        break
      }
    }
    
    console.log(`\nMaximum working shard count: ${maxWorking}`)
    expect(maxWorking).toBeGreaterThan(0)
  })
  
  it('should test last group calculation', async () => {
    console.log('Testing last group calculation for large file test...')
    
    // 10MB file = 10485760 bytes / 500 bytes per chunk = 20972 chunks
    const totalChunks = 20972
    const maxDataPerGroup = 80
    const numGroups = Math.ceil(totalChunks / maxDataPerGroup)
    const baseGroupSize = Math.floor(totalChunks / numGroups)
    const remainder = totalChunks % numGroups
    
    console.log(`Total chunks: ${totalChunks}`)
    console.log(`Max data per group: ${maxDataPerGroup}`)
    console.log(`Number of groups: ${numGroups}`)
    console.log(`Base group size: ${baseGroupSize}`)
    console.log(`Remainder: ${remainder}`)
    
    // Calculate all groups to verify
    let totalProcessed = 0
    for (let g = 0; g < numGroups; g++) {
      const groupSize = baseGroupSize + (g < remainder ? 1 : 0)
      totalProcessed += groupSize
    }
    
    console.log(`\nTotal chunks processed: ${totalProcessed} (should be ${totalChunks})`)
    
    // Calculate last group
    const lastGroupIndex = numGroups - 1
    let processedBeforeLastGroup = 0
    for (let g = 0; g < lastGroupIndex; g++) {
      const groupSize = baseGroupSize + (g < remainder ? 1 : 0)
      processedBeforeLastGroup += groupSize
    }
    
    const lastGroupSize = totalChunks - processedBeforeLastGroup
    const lastGroupParity = Math.floor(lastGroupSize / 2)
    const lastGroupTotal = lastGroupSize + lastGroupParity
    
    console.log(`\nLast group (${lastGroupIndex}):`)
    console.log(`  Processed before: ${processedBeforeLastGroup}`)
    console.log(`  Data chunks: ${lastGroupSize}`)
    console.log(`  Parity chunks: ${lastGroupParity}`)
    console.log(`  Total shards: ${lastGroupTotal}`)
    
    // Test if the last group configuration works
    try {
      const shards = []
      for (let i = 0; i < lastGroupSize; i++) {
        const data = new Uint8Array(500)
        for (let j = 0; j < 500; j++) {
          data[j] = Math.floor(Math.random() * 256)
        }
        shards.push(data)
      }
      
      console.log(`\nTesting encode with ${shards.length} data shards, ${lastGroupParity} parity shards...`)
      const encoded = encode(shards, lastGroupParity)
      console.log(`✓ Encoding successful! Generated ${encoded.length} total shards`)
      
      expect(encoded.length).toBe(lastGroupTotal)
      expect(lastGroupTotal).toBeLessThanOrEqual(128)
      
    } catch (error) {
      console.error(`✗ Failed:`, error)
      throw error
    }
  })
  
  it('should understand the library API', async () => {
  console.log('Testing wasm-reed-solomon-erasure library...')
  
  try {
    // Test 1: Very simple case - 2 data shards, 1 parity shard
    console.log('\n=== Test 1: Simple 2+1 ===')
    const data1 = new Uint8Array([1, 2, 3, 4, 5])
    const data2 = new Uint8Array([6, 7, 8, 9, 10])
    
    // Ensure same size
    console.log('Data shard 1:', data1)
    console.log('Data shard 2:', data2)
    
    const encoded = encode([data1, data2], 1)
    console.log('Encoded result:', encoded)
    console.log('Number of shards:', encoded.length)
    console.log('Parity shard:', encoded[2])
    
    // Test reconstruction
    const corrupted = [
      null, // Missing first data shard
      encoded[1], // Second data shard intact
      encoded[2]  // Parity shard intact
    ]
    
    const reconstructed = reconstruct(corrupted, 1, new Uint32Array([0]))
    console.log('Reconstructed:', reconstructed)
    console.log('Recovered shard 0:', reconstructed[0])
    
  } catch (error) {
    console.error('Test 1 failed:', error)
    console.error('Stack:', error.stack)
  }
  
  try {
    // Test 2: Larger case
    console.log('\n=== Test 2: Larger 4+2 ===')
    const shards = []
    for (let i = 0; i < 4; i++) {
      const data = new Uint8Array(10)
      for (let j = 0; j < 10; j++) {
        data[j] = i * 10 + j
      }
      shards.push(data)
    }
    
    console.log('Data shards:', shards.map(s => Array.from(s)))
    
    const encoded2 = encode(shards, 2)
    console.log('Encoded shards count:', encoded2.length)
    
    // Corrupt 2 shards
    const corrupted2 = [...encoded2]
    corrupted2[1] = null
    corrupted2[3] = null
    
    const reconstructed2 = reconstruct(corrupted2, 2, new Uint32Array([1, 3]))
    console.log('Reconstruction successful')
    console.log('Recovered shard 1:', Array.from(reconstructed2[1]))
    console.log('Recovered shard 3:', Array.from(reconstructed2[3]))
    
  } catch (error) {
    console.error('Test 2 failed:', error)
    console.error('Stack:', error.stack)
  }
  
  try {
    // Test 3: Different shard sizes
    console.log('\n=== Test 3: Different sizes ===')
    const shard1 = new Uint8Array(100).fill(1)
    const shard2 = new Uint8Array(100).fill(2)
    
    const encoded3 = encode([shard1, shard2], 1)
    console.log('Success with 100-byte shards')
    
    const shard3 = new Uint8Array(500).fill(3)
    const shard4 = new Uint8Array(500).fill(4)
    
    const encoded4 = encode([shard3, shard4], 1)
    console.log('Success with 500-byte shards')
    
  } catch (error) {
    console.error('Test 3 failed:', error)
  }
  })
})