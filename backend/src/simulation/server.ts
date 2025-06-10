import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'

const app = express()
const PORT = 3000

// Middleware
app.use(cors())
app.use(express.json())

// Event store
const EVENTS_DIR = path.join(__dirname, '../../events')
const SCENARIOS_DIR = path.join(__dirname, '../../scenarios')

// Ensure directories exist
if (!fs.existsSync(EVENTS_DIR)) {
  fs.mkdirSync(EVENTS_DIR, { recursive: true })
}
if (!fs.existsSync(SCENARIOS_DIR)) {
  fs.mkdirSync(SCENARIOS_DIR, { recursive: true })
}

// Current event file
let currentEventFile = path.join(EVENTS_DIR, 'current.jsonl')

// Event emitter for SSE
const eventEmitter = new EventEmitter()

// Replay state
let replayState: {
  active: boolean
  mode: 'test' | 'live'
  speed: number
  events: any[]
  currentIndex: number
  startTime: number
  timer?: NodeJS.Timeout
} = {
  active: false,
  mode: 'test',
  speed: 1,
  events: [],
  currentIndex: 0,
  startTime: 0
}

// Record an event
app.post('/api/events/record', (req, res) => {
  const event = {
    ts: Date.now(),
    ...req.body
  }
  
  // Append to event file
  fs.appendFileSync(currentEventFile, JSON.stringify(event) + '\n')
  
  // Emit for live subscribers
  eventEmitter.emit('event', event)
  
  console.log('[SimEngine] Recorded event:', event)
  res.json({ success: true, event })
})

// Start replay
app.post('/api/replay/start', async (req, res) => {
  const { scenario, mode = 'test', speed = 1 } = req.body
  
  if (replayState.active) {
    return res.status(400).json({ error: 'Replay already in progress' })
  }
  
  // Load scenario events
  const scenarioPath = path.join(SCENARIOS_DIR, scenario)
  if (!fs.existsSync(scenarioPath)) {
    return res.status(404).json({ error: 'Scenario not found' })
  }
  
  const eventsData = fs.readFileSync(scenarioPath, 'utf-8')
  const events = eventsData
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line))
  
  // Initialize replay state
  replayState = {
    active: true,
    mode,
    speed,
    events,
    currentIndex: 0,
    startTime: Date.now()
  }
  
  console.log(`[SimEngine] Starting replay: ${scenario} in ${mode} mode at ${speed}x speed`)
  
  // Start replay timer
  scheduleNextEvent()
  
  res.json({ success: true, eventCount: events.length })
})

// Stop replay
app.post('/api/replay/stop', (req, res) => {
  if (replayState.timer) {
    clearTimeout(replayState.timer)
  }
  
  replayState.active = false
  console.log('[SimEngine] Replay stopped')
  
  res.json({ success: true })
})

// Event stream (SSE)
app.get('/api/events/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })
  
  // Send initial connection
  res.write('data: {"type":"connected"}\n\n')
  
  // Listen for events
  const eventHandler = (event: any) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`)
  }
  
  eventEmitter.on('event', eventHandler)
  
  // Clean up on disconnect
  req.on('close', () => {
    eventEmitter.removeListener('event', eventHandler)
  })
})

// Save current scenario
app.post('/api/scenarios/save', (req, res) => {
  const { name, description } = req.body
  
  if (!name) {
    return res.status(400).json({ error: 'Name is required' })
  }
  
  const scenarioPath = path.join(SCENARIOS_DIR, `${name}.jsonl`)
  const metadataPath = path.join(SCENARIOS_DIR, `${name}.json`)
  
  // Copy current events to scenario
  fs.copyFileSync(currentEventFile, scenarioPath)
  
  // Save metadata
  const metadata = {
    name,
    description,
    savedAt: new Date().toISOString(),
    eventCount: fs.readFileSync(currentEventFile, 'utf-8').split('\n').filter(l => l.trim()).length
  }
  fs.writeFileSync(metadataPath, JSON.stringify(metadata, null, 2))
  
  console.log(`[SimEngine] Saved scenario: ${name}`)
  res.json({ success: true, metadata })
})

// List scenarios
app.get('/api/scenarios', (req, res) => {
  const scenarios = fs.readdirSync(SCENARIOS_DIR)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const metadata = JSON.parse(fs.readFileSync(path.join(SCENARIOS_DIR, file), 'utf-8'))
      return metadata
    })
  
  res.json({ scenarios })
})

// Clear current events
app.delete('/api/events/clear', (req, res) => {
  fs.writeFileSync(currentEventFile, '')
  console.log('[SimEngine] Cleared current events')
  res.json({ success: true })
})

// Helper: Schedule next replay event
function scheduleNextEvent() {
  if (!replayState.active || replayState.currentIndex >= replayState.events.length) {
    replayState.active = false
    console.log('[SimEngine] Replay completed')
    return
  }
  
  const event = replayState.events[replayState.currentIndex]
  const nextEvent = replayState.events[replayState.currentIndex + 1]
  
  // Send current event
  sendReplayEvent(event)
  replayState.currentIndex++
  
  if (nextEvent) {
    if (replayState.mode === 'test') {
      // In test mode, run as fast as possible with minimal delay
      setImmediate(() => scheduleNextEvent())
    } else {
      // In live mode, respect timestamps for realistic playback
      const delay = (nextEvent.ts - event.ts) / replayState.speed
      replayState.timer = setTimeout(() => scheduleNextEvent(), delay)
    }
  } else {
    // Last event
    replayState.active = false
    console.log('[SimEngine] Replay completed')
  }
}

// Helper: Send replay event
async function sendReplayEvent(event: any) {
  console.log(`[SimEngine] Replaying event: ${event.type} for ${event.device}`)
  
  if (replayState.mode === 'test') {
    // Direct to backend
    const port = event.device === 'alice' ? 3001 : 3002
    const url = `http://localhost:${port}/api`
    
    try {
      if (event.type === 'message') {
        await fetch(`${url}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content: event.content,
            attachments: event.attachments
          })
        })
      } else if (event.type === 'device_status') {
        // TODO: Implement device status API
        console.log(`[SimEngine] Device status: ${event.device} ${event.online ? 'online' : 'offline'}`)
      }
    } catch (error) {
      console.error(`[SimEngine] Error sending to backend:`, error)
    }
  } else {
    // Live mode - emit to frontend via SSE
    eventEmitter.emit('event', event)
  }
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'simulation-engine' })
})

app.listen(PORT, () => {
  console.log(`Simulation engine running on http://localhost:${PORT}`)
})