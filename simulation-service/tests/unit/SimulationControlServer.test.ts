import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SimulationControlServer } from '../../src/SimulationControlServer'
import { TimeController } from '../../src/TimeController'
import { testHelpers } from '../test-setup'

describe('SimulationControlServer', () => {
  let server: SimulationControlServer
  let timeController: TimeController
  let port: number

  beforeEach(async () => {
    port = testHelpers.generateRandomPort()
    timeController = new TimeController()
    server = new SimulationControlServer(port, timeController)
  })

  afterEach(async () => {
    if (server) {
      server.stop()
    }
  })

  describe('initialization', () => {
    it('should create server with correct port and time controller', () => {
      expect(server).toBeDefined()
      expect(port).toBeGreaterThan(10000)
      expect(timeController).toBeDefined()
    })

    it('should have default global configuration', async () => {
      await server.start()
      
      // Test health endpoint
      const response = await fetch(`http://localhost:${port}/api/health`)
      const health = await response.json()
      
      expect(health.status).toBe('ok')
      expect(health.service).toBe('simulation-control')
      expect(health.timeState).toBeDefined()
    })
  })

  describe('device management', () => {
    it('should enable and disable devices', async () => {
      await server.start()
      
      // Enable alice
      const enableResponse = await fetch(`http://localhost:${port}/api/devices/alice/enabled`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true })
      })
      
      const enableResult = await enableResponse.json()
      expect(enableResult.success).toBe(true)
      expect(enableResult.enabled).toBe(true)
      
      // Check status
      const statusResponse = await fetch(`http://localhost:${port}/api/devices/alice/status`)
      const status = await statusResponse.json()
      expect(status.enabled).toBe(true)
    })
  })

  describe('simulation control', () => {
    it('should start and pause simulation', async () => {
      await server.start()
      
      // Start simulation
      const startResponse = await fetch(`http://localhost:${port}/api/simulation/start`, {
        method: 'POST'
      })
      const startResult = await startResponse.json()
      expect(startResult.success).toBe(true)
      expect(startResult.status).toBe('started')
      
      // Pause simulation
      const pauseResponse = await fetch(`http://localhost:${port}/api/simulation/pause`, {
        method: 'POST'
      })
      const pauseResult = await pauseResponse.json()
      expect(pauseResult.success).toBe(true)
      expect(pauseResult.status).toBe('paused')
    })

    it('should set simulation speed', async () => {
      await server.start()
      
      const speedResponse = await fetch(`http://localhost:${port}/api/simulation/speed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speed: 2.0 })
      })
      
      const speedResult = await speedResponse.json()
      expect(speedResult.success).toBe(true)
      expect(speedResult.speed).toBe(2.0)
    })
  })
})