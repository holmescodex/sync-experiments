#!/usr/bin/env node

// Test script for the combined test server
// Usage: node test-combined-api.js

const baseUrl = 'http://localhost:3000/api'

async function testDevice(device) {
  console.log(`\n=== Testing ${device.toUpperCase()} ===`)
  
  try {
    // Send a message
    const sendRes = await fetch(`${baseUrl}/${device}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `Hello from ${device} at ${new Date().toLocaleTimeString()}`
      })
    })
    if (!sendRes.ok) {
      throw new Error(`HTTP ${sendRes.status}: ${sendRes.statusText}`)
    }
    
    const sent = await sendRes.json()
    console.log('Sent message:', sent)
    
    // Get messages
    const getRes = await fetch(`${baseUrl}/${device}/messages`)
    if (!getRes.ok) {
      throw new Error(`HTTP ${getRes.status}: ${getRes.statusText}`)
    }
    
    const { messages } = await getRes.json()
    console.log(`${device} has ${messages.length} messages`)
    
    return sent
  } catch (error) {
    console.error(`Error testing ${device}:`, error.message)
  }
}

async function testCombinedApi() {
  console.log('Testing combined API server...')
  
  try {
    // Health check
    const healthRes = await fetch(`${baseUrl}/health`)
    const health = await healthRes.json()
    console.log('\nHealth check:', health)
    
    // Test both devices
    const aliceMsg = await testDevice('alice')
    const bobMsg = await testDevice('bob')
    
    // Cross-check - each device should only see its own messages
    console.log('\n=== Cross-device check ===')
    
    const aliceRes = await fetch(`${baseUrl}/alice/messages`)
    const aliceData = await aliceRes.json()
    console.log(`Alice sees ${aliceData.messages.length} messages`)
    
    const bobRes = await fetch(`${baseUrl}/bob/messages`)
    const bobData = await bobRes.json()
    console.log(`Bob sees ${bobData.messages.length} messages`)
    
    console.log('\nNote: Each device only sees its own messages (no sync yet)')
    
  } catch (error) {
    console.error('Error:', error.message)
    console.log('\nMake sure the test server is running:')
    console.log('  cd backend && npm run dev:test')
  }
}

testCombinedApi()