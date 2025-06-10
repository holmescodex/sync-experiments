#!/usr/bin/env node

// Manual test for backend API
const deviceId = process.argv[2] || 'alice'
const port = deviceId === 'alice' ? 3001 : 3002
const baseUrl = `http://localhost:${port}/api`

async function testBackend() {
  console.log(`\nTesting ${deviceId.toUpperCase()} backend on port ${port}...`)
  
  try {
    // Health check
    console.log('\n1. Health check:')
    const healthRes = await fetch(`${baseUrl}/health`)
    const health = await healthRes.json()
    console.log('   ', health)
    
    // Send a message
    console.log('\n2. Sending message:')
    const message = {
      content: `Test message from ${deviceId} at ${new Date().toLocaleTimeString()}`
    }
    const sendRes = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message)
    })
    const sent = await sendRes.json()
    console.log('   Sent:', sent)
    
    // Get messages
    console.log('\n3. Getting messages:')
    const getRes = await fetch(`${baseUrl}/messages`)
    const data = await getRes.json()
    console.log(`   Found ${data.messages.length} messages`)
    data.messages.forEach((msg, i) => {
      console.log(`   [${i + 1}] ${msg.author}: ${msg.content} (${new Date(msg.timestamp).toLocaleTimeString()})`)
    })
    
  } catch (error) {
    console.error('Error:', error.message)
    console.log('\nMake sure the backend server is running:')
    console.log(`  cd backend && npm run dev:${deviceId}`)
  }
}

testBackend()