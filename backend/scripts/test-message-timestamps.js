// Test to check message timestamps

async function testTimestamps() {
  console.log('Testing message timestamps...')
  
  const backendUrl = 'http://localhost:3001'
  
  try {
    // Get all messages
    console.log('\n1. Getting all messages...')
    const getResponse = await fetch(`${backendUrl}/api/messages`)
    
    if (!getResponse.ok) {
      console.error('Failed to get messages:', getResponse.statusText)
      return
    }
    
    const data = await getResponse.json()
    console.log('Messages:')
    data.messages.forEach((msg, idx) => {
      console.log(`  ${idx + 1}. ID: ${msg.id}, Timestamp: ${msg.timestamp}, Content: "${msg.content.substring(0, 30)}..."`)
    })
    
    // Test different since values
    console.log('\n2. Testing different since values...')
    
    // Since 0
    const since0Response = await fetch(`${backendUrl}/api/messages?since=0`)
    const since0Data = await since0Response.json()
    console.log(`Messages since 0: ${since0Data.messages.length}`)
    
    // Since 1
    const since1Response = await fetch(`${backendUrl}/api/messages?since=1`)
    const since1Data = await since1Response.json()
    console.log(`Messages since 1: ${since1Data.messages.length}`)
    
    // Since current time minus 1 hour
    const oneHourAgo = Date.now() - 3600000
    const sinceHourResponse = await fetch(`${backendUrl}/api/messages?since=${oneHourAgo}`)
    const sinceHourData = await sinceHourResponse.json()
    console.log(`Messages since 1 hour ago (${oneHourAgo}): ${sinceHourData.messages.length}`)
    
  } catch (error) {
    console.error('Test failed:', error)
  }
}

testTimestamps()