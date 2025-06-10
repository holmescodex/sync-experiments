import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { EventEmitter } from 'events'
import { TimeController } from './TimeController'

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

// Time controller for deterministic time management
const timeController = new TimeController()

// Replay state
interface ReplayState {
  active: boolean
  mode: 'test' | 'live'
  speed: number
  events: any[]
  currentIndex: number
  startSimTime: number
  timer?: NodeJS.Timeout
}

let replayState: ReplayState = {
  active: false,
  mode: 'test',
  speed: 1,
  events: [],
  currentIndex: 0,
  startSimTime: 0
}

// Record an event with simulation time
app.post('/api/events/record', (req, res) => {
  const event = {
    ts: timeController.getCurrentTime(), // Use simulation time
    wallClockTime: Date.now(), // Also record wall clock time for reference
    ...req.body
  }
  
  // Append to event file
  fs.appendFileSync(currentEventFile, JSON.stringify(event) + '\n')
  
  // Emit for live subscribers
  eventEmitter.emit('event', event)
  
  console.log('[SimEngine] Recorded event:', event)
  res.json({ success: true, event })
})

// Get current simulation time
app.get('/api/time/current', (req, res) => {
  res.json({
    simulationTime: timeController.getCurrentTime(),
    state: timeController.getState()
  })
})

// Control simulation time
app.post('/api/time/control', (req, res) => {
  const { action, speed, deltaMs, targetTime } = req.body
  
  switch (action) {
    case 'start':
      timeController.start()
      break
    case 'stop':
      timeController.stop()
      break
    case 'reset':
      timeController.reset()
      break
    case 'setSpeed':
      if (speed !== undefined) {
        timeController.setSpeed(speed)
      }
      break
    case 'advance':
      if (deltaMs !== undefined) {
        timeController.advance(deltaMs)
      }
      break
    case 'jump':
      if (targetTime !== undefined) {
        timeController.jumpToTime(targetTime)
      }
      break
  }
  
  res.json({
    success: true,
    state: timeController.getState()
  })
})

// Start replay with time control
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
    startSimTime: events[0]?.ts || 0
  }
  
  // Configure time controller
  timeController.reset()
  timeController.setSpeed(speed)
  timeController.setRealTimeMode(mode === 'live')
  timeController.start()
  
  // Jump to first event time
  if (events[0]) {
    timeController.jumpToTime(events[0].ts)
  }
  
  console.log(`[SimEngine] Starting replay: ${scenario} in ${mode} mode at ${speed}x speed`)
  
  // Start replay timer
  scheduleNextEvent()
  
  res.json({ 
    success: true, 
    eventCount: events.length,
    duration: events.length > 0 ? events[events.length - 1].ts - events[0].ts : 0
  })
})

// Stop replay
app.post('/api/replay/stop', (req, res) => {
  if (replayState.timer) {
    clearTimeout(replayState.timer)
  }
  
  replayState.active = false
  timeController.stop()
  console.log('[SimEngine] Replay stopped')
  
  res.json({ success: true })
})

// Event stream (SSE) with time info
app.get('/api/events/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  })
  
  // Send initial connection with time info
  res.write(`data: ${JSON.stringify({
    type: 'connected',
    simulationTime: timeController.getCurrentTime()
  })}\n\n`)
  
  // Listen for events
  const eventHandler = (event: any) => {
    res.write(`data: ${JSON.stringify({
      ...event,
      simulationTime: timeController.getCurrentTime()
    })}\n\n`)
  }
  
  eventEmitter.on('event', eventHandler)
  
  // Also listen for time ticks
  const timeHandler = (timeEvent: any) => {
    res.write(`data: ${JSON.stringify({
      type: 'time_tick',
      ...timeEvent
    })}\n\n`)
  }
  
  timeController.on('tick', timeHandler)
  
  // Clean up on disconnect
  req.on('close', () => {
    eventEmitter.removeListener('event', eventHandler)
    timeController.removeListener('tick', timeHandler)
  })
})

// Helper: Schedule next replay event using simulation time
function scheduleNextEvent() {
  if (!replayState.active || replayState.currentIndex >= replayState.events.length) {
    replayState.active = false
    timeController.stop()
    console.log('[SimEngine] Replay completed')
    return
  }
  
  const event = replayState.events[replayState.currentIndex]
  const currentSimTime = timeController.getCurrentTime()
  
  // Advance time to event timestamp if needed
  if (event.ts > currentSimTime) {
    timeController.jumpToTime(event.ts)
  }
  
  // Send current event
  sendReplayEvent(event)
  replayState.currentIndex++
  
  if (replayState.currentIndex < replayState.events.length) {
    const nextEvent = replayState.events[replayState.currentIndex]
    
    if (replayState.mode === 'test') {
      // In test mode, process all events immediately
      // but advance simulation time appropriately
      setImmediate(() => scheduleNextEvent())
    } else {
      // In live mode, schedule based on real time delay
      const simDelay = nextEvent.ts - event.ts
      const realDelay = simDelay / replayState.speed
      replayState.timer = setTimeout(() => scheduleNextEvent(), realDelay)
    }
  } else {
    // Last event processed
    replayState.active = false
    console.log('[SimEngine] Replay completed')
  }
}

// Helper: Send replay event
async function sendReplayEvent(event: any) {
  console.log(`[SimEngine] Replaying event at sim time ${timeController.getCurrentTime()}: ${event.type} for ${event.device}`)
  
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
            attachments: event.attachments,
            simulationTime: timeController.getCurrentTime()
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
    eventEmitter.emit('event', {
      ...event,
      replayTime: timeController.getCurrentTime()
    })
  }
}

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
  
  // Calculate duration
  const events = fs.readFileSync(currentEventFile, 'utf-8')
    .split('\n')
    .filter(l => l.trim())
    .map(l => JSON.parse(l))
  
  const duration = events.length > 0 
    ? events[events.length - 1].ts - events[0].ts 
    : 0
  
  // Save metadata
  const metadata = {
    name,
    description,
    savedAt: new Date().toISOString(),
    eventCount: events.length,
    duration,
    simulationStartTime: events[0]?.ts || 0,
    simulationEndTime: events[events.length - 1]?.ts || 0
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
  timeController.reset()
  console.log('[SimEngine] Cleared current events and reset time')
  res.json({ success: true })
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'simulation-engine',
    simulationTime: timeController.getCurrentTime(),
    timeState: timeController.getState()
  })
})

// Export for testing
export { app, timeController }

// Start server if not in test mode
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Time-aware simulation engine running on http://localhost:${PORT}`)
  })
}