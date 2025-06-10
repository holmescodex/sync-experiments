// Test backend message API directly

async function testBackend() {
  console.log('Testing backend message API...')
  
  const backendUrl = 'http://localhost:3001'
  
  try {
    // Check health
    console.log('\n1. Checking health endpoint...')
    const healthResponse = await fetch(`${backendUrl}/api/health`)
    if (!healthResponse.ok) {
      console.error('Backend not running or not healthy')
      return
    }
    const health = await healthResponse.json()
    console.log('Health:', health)
    
    // Send a test message
    console.log('\n2. Sending test message...')
    const sendResponse = await fetch(`${backendUrl}/api/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: 'Test message from direct API test',
        attachments: []
      })
    })
    
    if (!sendResponse.ok) {
      console.error('Failed to send message:', sendResponse.statusText)
      return
    }
    
    const sentMessage = await sendResponse.json()
    console.log('Sent message:', sentMessage)
    
    // Get all messages
    console.log('\n3. Getting all messages...')
    const getResponse = await fetch(`${backendUrl}/api/messages`)
    
    if (!getResponse.ok) {
      console.error('Failed to get messages:', getResponse.statusText)
      return
    }
    
    const data = await getResponse.json()
    console.log('Response data:', data)
    console.log('Messages array:', data.messages)
    console.log('Number of messages:', data.messages?.length || 0)
    
    // Get messages since timestamp 0
    console.log('\n4. Getting messages since timestamp 0...')
    const sinceResponse = await fetch(`${backendUrl}/api/messages?since=0`)
    
    if (!sinceResponse.ok) {
      console.error('Failed to get messages since 0:', sinceResponse.statusText)
      return
    }
    
    const sinceData = await sinceResponse.json()
    console.log('Messages since 0:', sinceData.messages?.length || 0)
    
    // Try to get the specific message
    if (sentMessage.id) {
      console.log('\n5. Getting specific message by ID...')
      const messageResponse = await fetch(`${backendUrl}/api/messages/${sentMessage.id}`)
      
      if (!messageResponse.ok) {
        console.error('Failed to get specific message:', messageResponse.statusText)
      } else {
        const message = await messageResponse.json()
        console.log('Retrieved message:', message)
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

testBackend()