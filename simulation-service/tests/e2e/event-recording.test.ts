import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { spawn, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'

describe('Event Recording and Replay', () => {
  let simProcess: ChildProcess
  let aliceProcess: ChildProcess
  let bobProcess: ChildProcess
  const simUrl = process.env.SIM_ENGINE_URL || 'http://localhost:3000'
  const aliceUrl = process.env.ALICE_BACKEND_URL || 'http://localhost:3001'
  const bobUrl = process.env.BOB_BACKEND_URL || 'http://localhost:3002'
  const isOrchestrated = process.env.TEST_MODE === 'orchestrated'
  
  // Helper to wait for server to be ready
  const waitForServer = async (url: string, maxRetries = 30): Promise<void> => {
    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await request(url).get('/api/health')
        if (response.status === 200) return
      } catch {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    throw new Error(`Server at ${url} failed to start`)
  }
  
  beforeAll(async () => {
    if (isOrchestrated) {
      // In orchestrated mode, services are already running
      console.log('[Event Recording] Using orchestrated environment - servers already running')
      
      // Just verify they're ready
      await Promise.all([
        waitForServer(aliceUrl),
        waitForServer(bobUrl)
      ])
      return
    }
    
    // In non-orchestrated mode, start our own processes
    console.log('[Event Recording] Starting test processes for non-orchestrated mode')
    
    // Start simulation engine
    simProcess = spawn('npx', ['tsx', 'src/simulation/server.ts'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env }
    })
    
    // Start device backends
    aliceProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, DEVICE_ID: 'alice', PORT: '3001' }
    })
    
    bobProcess = spawn('npx', ['tsx', 'src/server.ts'], {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, DEVICE_ID: 'bob', PORT: '3002' }
    })
    
    // Wait for all servers to be ready
    await Promise.all([
      waitForServer(simUrl),
      waitForServer(aliceUrl),
      waitForServer(bobUrl)
    ])
  }, 60000)
  
  afterAll(async () => {
    // Only kill processes if we started them (non-orchestrated mode)
    if (!isOrchestrated) {
      console.log('[Event Recording] Cleaning up test processes')
      if (simProcess) simProcess.kill()
      if (aliceProcess) aliceProcess.kill()
      if (bobProcess) bobProcess.kill()
      
      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  })
  
  beforeEach(async () => {
    // Clear events and messages
    await request(simUrl).delete('/api/events/clear')
    await request(aliceUrl).delete('/api/messages/clear')
    await request(bobUrl).delete('/api/messages/clear')
  })
  
  describe('Event Recording', () => {
    it('should record message events', async () => {
      const event = {
        type: 'message',
        device: 'alice',
        content: 'Test message',
        source: 'manual'
      }
      
      const response = await request(simUrl)
        .post('/api/events/record')
        .send(event)
      
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.event).toMatchObject(event)
      expect(response.body.event.ts).toBeDefined()
    })
    
    it('should record device status events', async () => {
      const event = {
        type: 'device_status',
        device: 'alice',
        online: false
      }
      
      const response = await request(simUrl)
        .post('/api/events/record')
        .send(event)
      
      expect(response.status).toBe(200)
      expect(response.body.success).toBe(true)
      expect(response.body.event).toMatchObject(event)
    })
    
    it('should append events to file', async () => {
      // Record multiple events
      await request(simUrl).post('/api/events/record').send({
        type: 'message',
        device: 'alice',
        content: 'Message 1'
      })
      
      await request(simUrl).post('/api/events/record').send({
        type: 'message',
        device: 'bob',
        content: 'Message 2'
      })
      
      // Check event file
      const eventFile = path.join(__dirname, '../../../events/current.jsonl')
      const events = fs.readFileSync(eventFile, 'utf-8')
        .split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line))
      
      expect(events.length).toBe(2)
      expect(events[0].content).toBe('Message 1')
      expect(events[1].content).toBe('Message 2')
    })
  })
  
  describe('Scenario Management', () => {
    it('should save and list scenarios', async () => {
      // Record some events
      await request(simUrl).post('/api/events/record').send({
        type: 'message',
        device: 'alice',
        content: 'Test scenario message'
      })
      
      // Save scenario
      const saveResponse = await request(simUrl)
        .post('/api/scenarios/save')
        .send({
          name: 'test-scenario',
          description: 'Test scenario for unit tests'
        })
      
      expect(saveResponse.status).toBe(200)
      expect(saveResponse.body.success).toBe(true)
      expect(saveResponse.body.metadata.name).toBe('test-scenario')
      
      // List scenarios
      const listResponse = await request(simUrl).get('/api/scenarios')
      
      expect(listResponse.status).toBe(200)
      const scenarios = listResponse.body.scenarios.filter((s: any) => s.name === 'test-scenario')
      expect(scenarios.length).toBe(1)
      expect(scenarios[0].description).toBe('Test scenario for unit tests')
    })
  })
  
  describe('Event Replay', () => {
    it('should replay events in test mode', async () => {
      // Create a test scenario
      const events = [
        { type: 'message', device: 'alice', content: 'Hello from Alice' },
        { type: 'message', device: 'bob', content: 'Hello from Bob' }
      ]
      
      // Record events with timestamps
      for (const event of events) {
        await request(simUrl).post('/api/events/record').send(event)
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // Save scenario
      await request(simUrl).post('/api/scenarios/save').send({
        name: 'replay-test'
      })
      
      // Clear current state
      await request(aliceUrl).delete('/api/messages/clear')
      await request(bobUrl).delete('/api/messages/clear')
      
      // Start replay in test mode
      const replayResponse = await request(simUrl)
        .post('/api/replay/start')
        .send({
          scenario: 'replay-test.jsonl',
          mode: 'test',
          speed: 10 // 10x speed for testing
        })
      
      expect(replayResponse.status).toBe(200)
      expect(replayResponse.body.success).toBe(true)
      
      // Wait for replay to complete
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Verify messages were sent to backends
      const aliceMessages = await request(aliceUrl).get('/api/messages')
      const bobMessages = await request(bobUrl).get('/api/messages')
      
      // Check response format
      expect(Array.isArray(aliceMessages.body)).toBe(true)
      expect(Array.isArray(bobMessages.body)).toBe(true)
      
      // Alice should have her own message
      const aliceMsg = aliceMessages.body.find((m: any) => m.content === 'Hello from Alice')
      expect(aliceMsg).toBeDefined()
      expect(aliceMsg.author).toBe('alice')
      
      // Bob should have his own message  
      const bobMsg = bobMessages.body.find((m: any) => m.content === 'Hello from Bob')
      expect(bobMsg).toBeDefined()
      expect(bobMsg.author).toBe('bob')
    })
  })
  
  describe('Event Stream (SSE)', () => {
    it.skip('should stream events to subscribers', async () => {
      // Skip this test in Node environment as EventSource is a browser API
      // This would be tested in E2E browser tests
    })
  })
})