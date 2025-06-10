import fs from 'fs'
import path from 'path'

// Replay test runner for headless scenario testing
async function runReplayTest(scenarioPath: string) {
  console.log(`[ReplayTest] Loading scenario: ${scenarioPath}`)
  
  // Load events
  const eventsData = fs.readFileSync(scenarioPath, 'utf-8')
  const events = eventsData
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
  
  console.log(`[ReplayTest] Loaded ${events.length} events`)
  
  // Group events by device
  const deviceEvents = new Map<string, any[]>()
  for (const event of events) {
    if (!deviceEvents.has(event.device)) {
      deviceEvents.set(event.device, [])
    }
    deviceEvents.get(event.device)!.push(event)
  }
  
  // Report statistics
  console.log('[ReplayTest] Event statistics:')
  for (const [device, events] of deviceEvents) {
    const messageEvents = events.filter(e => e.type === 'message')
    const statusEvents = events.filter(e => e.type === 'device_status')
    console.log(`  ${device}: ${messageEvents.length} messages, ${statusEvents.length} status changes`)
  }
  
  // Replay events in test mode (direct to backends)
  console.log('[ReplayTest] Starting replay in test mode...')
  
  const startTime = Date.now()
  let lastEventTime = events[0]?.ts || 0
  
  for (const event of events) {
    // Calculate delay
    const delay = event.ts - lastEventTime
    if (delay > 0) {
      await new Promise(resolve => setTimeout(resolve, delay))
    }
    lastEventTime = event.ts
    
    // Send event to backend
    if (event.type === 'message') {
      const port = event.device === 'alice' ? 3001 : 3002
      const url = `http://localhost:${port}/api/messages`
      
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: event.content,
            attachments: event.attachments
          })
        })
        
        if (!response.ok) {
          console.error(`[ReplayTest] Failed to send message to ${event.device}: ${response.statusText}`)
        } else {
          console.log(`[ReplayTest] Sent message to ${event.device}: "${event.content}"`)
        }
      } catch (error) {
        console.error(`[ReplayTest] Error sending to ${event.device}:`, error)
      }
    } else if (event.type === 'device_status') {
      console.log(`[ReplayTest] Device status: ${event.device} ${event.online ? 'online' : 'offline'}`)
      // TODO: Implement device status API when available
    }
  }
  
  const duration = Date.now() - startTime
  console.log(`[ReplayTest] Replay completed in ${duration}ms`)
  
  // Verify final state
  console.log('[ReplayTest] Verifying final database state...')
  
  for (const device of ['alice', 'bob']) {
    const port = device === 'alice' ? 3001 : 3002
    const url = `http://localhost:${port}/api/messages`
    
    try {
      const response = await fetch(url)
      if (response.ok) {
        const messages = await response.json()
        console.log(`[ReplayTest] ${device} has ${messages.length} messages in database`)
      }
    } catch (error) {
      console.error(`[ReplayTest] Error checking ${device} database:`, error)
    }
  }
}

// Main
const scenarioPath = process.argv[2]
if (!scenarioPath) {
  console.error('Usage: npm run test:replay <scenario-file>')
  process.exit(1)
}

runReplayTest(scenarioPath).catch(console.error)