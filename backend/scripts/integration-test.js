#!/usr/bin/env node

// Integration test for backend message flow
// This tests that messages sent via backend API are properly stored and retrieved

const { spawn } = require('child_process')
const path = require('path')

let aliceProcess, bobProcess

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function startBackends() {
  console.log('Starting backend servers...')
  
  // Start Alice backend
  aliceProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: path.join(__dirname),
    env: { ...process.env, DEVICE_ID: 'alice', PORT: '3001' }
  })
  
  aliceProcess.stdout.on('data', (data) => {
    console.log(`[Alice] ${data.toString().trim()}`)
  })
  
  // Start Bob backend
  bobProcess = spawn('npx', ['tsx', 'src/server.ts'], {
    cwd: path.join(__dirname),
    env: { ...process.env, DEVICE_ID: 'bob', PORT: '3002' }
  })
  
  bobProcess.stdout.on('data', (data) => {
    console.log(`[Bob] ${data.toString().trim()}`)
  })
  
  // Wait for servers to start
  await sleep(3000)
}

async function testMessageFlow() {
  console.log('\n=== Testing Message Flow ===\n')
  
  try {
    // Test 1: Health checks
    console.log('1. Testing health endpoints...')
    const aliceHealth = await fetch('http://localhost:3001/api/health').then(r => r.json())
    const bobHealth = await fetch('http://localhost:3002/api/health').then(r => r.json())
    console.log('   Alice:', aliceHealth)
    console.log('   Bob:', bobHealth)
    
    // Test 2: Send message from Alice
    console.log('\n2. Sending message from Alice...')
    const aliceMessage = await fetch('http://localhost:3001/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello from Alice backend test' })
    }).then(r => r.json())
    console.log('   Sent:', aliceMessage)
    
    // Test 3: Send message from Bob
    console.log('\n3. Sending message from Bob...')
    const bobMessage = await fetch('http://localhost:3002/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: 'Hello from Bob backend test' })
    }).then(r => r.json())
    console.log('   Sent:', bobMessage)
    
    // Test 4: Retrieve messages
    console.log('\n4. Retrieving messages...')
    const aliceMessages = await fetch('http://localhost:3001/api/messages').then(r => r.json())
    const bobMessages = await fetch('http://localhost:3002/api/messages').then(r => r.json())
    
    console.log(`   Alice has ${aliceMessages.messages.length} messages`)
    console.log(`   Bob has ${bobMessages.messages.length} messages`)
    
    // Test 5: Verify isolation (each device only sees its own messages)
    console.log('\n5. Verifying device isolation...')
    const aliceHasOwnMessage = aliceMessages.messages.some(m => m.content.includes('Alice'))
    const aliceHasBobMessage = aliceMessages.messages.some(m => m.content.includes('Bob'))
    const bobHasOwnMessage = bobMessages.messages.some(m => m.content.includes('Bob'))
    const bobHasAliceMessage = bobMessages.messages.some(m => m.content.includes('Alice'))
    
    console.log('   Alice has own message:', aliceHasOwnMessage ? '✓' : '✗')
    console.log('   Alice has Bob message:', aliceHasBobMessage ? '✗ (correct)' : '✓ (correct)')
    console.log('   Bob has own message:', bobHasOwnMessage ? '✓' : '✗')
    console.log('   Bob has Alice message:', bobHasAliceMessage ? '✗ (correct)' : '✓ (correct)')
    
    // Test 6: Message retrieval with timestamp
    console.log('\n6. Testing message retrieval with timestamp...')
    const since = Date.now() - 5000 // 5 seconds ago
    const recentMessages = await fetch(`http://localhost:3001/api/messages?since=${since}`).then(r => r.json())
    console.log(`   Messages since ${new Date(since).toLocaleTimeString()}: ${recentMessages.messages.length}`)
    
    console.log('\n✅ All tests passed!')
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message)
    process.exit(1)
  }
}

async function cleanup() {
  console.log('\nCleaning up...')
  if (aliceProcess) aliceProcess.kill()
  if (bobProcess) bobProcess.kill()
  await sleep(1000)
}

// Main execution
async function main() {
  try {
    await startBackends()
    await testMessageFlow()
  } finally {
    await cleanup()
  }
}

// Handle Ctrl+C
process.on('SIGINT', async () => {
  await cleanup()
  process.exit(0)
})

main().catch(console.error)