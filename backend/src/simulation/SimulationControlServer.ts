import express from 'express'
import cors from 'cors'
import { AutoMessageGenerator } from './AutoMessageGenerator'
import { TimeController } from './TimeController'
import { EventEmitter } from 'events'

interface DeviceConfig {
  enabled: boolean
  messagesPerHour: number
  imageAttachmentPercentage: number
  generator?: AutoMessageGenerator
}

interface SimulationConfig {
  globalMessagesPerHour: number
  imageAttachmentPercentage: number
  enabledDevices: string[]
  simulationSpeed: number
  isRunning: boolean
}

/**
 * Simulation Control Server
 * Manages automatic message generation for all devices with time awareness
 */
class SimulationControlServer extends EventEmitter {
  private app = express()
  private port: number
  private devices: Map<string, DeviceConfig> = new Map()
  private timeController: TimeController
  private globalConfig: SimulationConfig = {
    globalMessagesPerHour: 50,
    imageAttachmentPercentage: 30,
    enabledDevices: ['alice', 'bob'],
    simulationSpeed: 1,
    isRunning: false
  }

  constructor(port: number = 3005, timeController?: TimeController) {
    super()
    this.port = port
    this.timeController = timeController || new TimeController()
    this.setupMiddleware()
    this.setupRoutes()
    this.initializeDevices()
  }

  private setupMiddleware() {
    this.app.use(cors())
    this.app.use(express.json())
  }

  private initializeDevices() {
    // Initialize default devices
    const devices = ['alice', 'bob']
    devices.forEach(deviceId => {
      this.devices.set(deviceId, {
        enabled: true,
        messagesPerHour: this.globalConfig.globalMessagesPerHour / devices.length,
        imageAttachmentPercentage: this.globalConfig.imageAttachmentPercentage
      })
    })
  }

  private setupRoutes() {
    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        service: 'simulation-control',
        simulationTime: this.timeController.getCurrentTime(),
        timeState: this.timeController.getState()
      })
    })

    // Get simulation configuration
    this.app.get('/api/simulation/config', (req, res) => {
      res.json({
        ...this.globalConfig,
        devices: Object.fromEntries(this.devices),
        simulationTime: this.timeController.getCurrentTime()
      })
    })

    // Get simulation status
    this.app.get('/api/simulation/status', (req, res) => {
      const deviceRates: Record<string, number> = {}
      this.devices.forEach((config, deviceId) => {
        deviceRates[deviceId] = config.enabled ? config.messagesPerHour : 0
      })

      res.json({
        globalMessagesPerHour: this.globalConfig.globalMessagesPerHour,
        deviceRates,
        imageAttachmentPercentage: this.globalConfig.imageAttachmentPercentage,
        isRunning: this.globalConfig.isRunning,
        simulationTime: this.timeController.getCurrentTime(),
        timeState: this.timeController.getState()
      })
    })

    // Device enable/disable
    this.app.post('/api/devices/:deviceId/enabled', (req, res) => {
      const { deviceId } = req.params
      const { enabled } = req.body

      const device = this.devices.get(deviceId)
      if (!device) {
        return res.status(404).json({ error: 'Device not found' })
      }

      device.enabled = enabled
      
      // Update the generator if running
      if (device.generator) {
        if (enabled) {
          device.generator.start()
        } else {
          device.generator.stop()
        }
      }

      // Update enabled devices list
      this.globalConfig.enabledDevices = Array.from(this.devices.entries())
        .filter(([_, config]) => config.enabled)
        .map(([id, _]) => id)

      // Redistribute global rate
      this.redistributeGlobalRate()

      console.log(`[SimControl] Device ${deviceId} ${enabled ? 'enabled' : 'disabled'}`)
      
      res.json({ 
        success: true, 
        enabled,
        deviceId,
        timestamp: Date.now()
      })
    })

    // Get device status
    this.app.get('/api/devices/:deviceId/status', (req, res) => {
      const { deviceId } = req.params
      
      const device = this.devices.get(deviceId)
      if (!device) {
        return res.status(404).json({ error: 'Device not found' })
      }

      res.json({
        deviceId,
        enabled: device.enabled,
        messagesPerHour: device.messagesPerHour,
        imageAttachmentPercentage: device.imageAttachmentPercentage,
        timestamp: Date.now()
      })
    })

    // Set device generation rate
    this.app.post('/api/devices/:deviceId/generation-rate', (req, res) => {
      const { deviceId } = req.params
      const { messagesPerHour } = req.body

      const device = this.devices.get(deviceId)
      if (!device) {
        return res.status(404).json({ error: 'Device not found' })
      }

      device.messagesPerHour = messagesPerHour
      
      // Update generator if exists
      if (device.generator) {
        device.generator.setMessagesPerHour(messagesPerHour)
      }

      // Recalculate global rate
      this.recalculateGlobalRate()

      console.log(`[SimControl] Device ${deviceId} rate set to ${messagesPerHour} msg/hr`)

      res.json({ 
        success: true, 
        messagesPerHour,
        deviceId,
        timestamp: Date.now()
      })
    })

    // Set global message rate
    this.app.post('/api/simulation/message-rate', (req, res) => {
      const { messagesPerHour } = req.body

      if (messagesPerHour < 0 || messagesPerHour > 1000) {
        return res.status(429).json({ 
          error: 'Rate limit exceeded. Maximum 1000 messages/hour' 
        })
      }

      this.globalConfig.globalMessagesPerHour = messagesPerHour
      this.redistributeGlobalRate()

      console.log(`[SimControl] Global rate set to ${messagesPerHour} msg/hr`)

      res.json({ 
        success: true, 
        messagesPerHour,
        timestamp: Date.now()
      })
    })

    // Set attachment rate (global)
    this.app.post('/api/simulation/attachment-rate', (req, res) => {
      const { imageAttachmentPercentage } = req.body

      if (imageAttachmentPercentage < 0 || imageAttachmentPercentage > 100) {
        return res.status(400).json({ 
          error: 'Attachment rate must be between 0 and 100' 
        })
      }

      this.globalConfig.imageAttachmentPercentage = imageAttachmentPercentage
      
      // Update all devices
      this.devices.forEach((device, deviceId) => {
        device.imageAttachmentPercentage = imageAttachmentPercentage
        if (device.generator) {
          device.generator.setImageAttachmentPercentage(imageAttachmentPercentage)
        }
      })

      // Also update individual device backends
      this.broadcastAttachmentRateToDevices(imageAttachmentPercentage)

      console.log(`[SimControl] Global attachment rate set to ${imageAttachmentPercentage}%`)

      res.json({ 
        success: true, 
        imageAttachmentPercentage,
        timestamp: Date.now()
      })
    })

    // Set device-specific attachment rate
    this.app.post('/api/devices/:deviceId/attachment-rate', (req, res) => {
      const { deviceId } = req.params
      const { imageAttachmentPercentage } = req.body

      const device = this.devices.get(deviceId)
      if (!device) {
        return res.status(404).json({ error: 'Device not found' })
      }

      device.imageAttachmentPercentage = imageAttachmentPercentage
      
      if (device.generator) {
        device.generator.setImageAttachmentPercentage(imageAttachmentPercentage)
      }

      console.log(`[SimControl] Device ${deviceId} attachment rate set to ${imageAttachmentPercentage}%`)

      res.json({ 
        success: true, 
        imageAttachmentPercentage,
        deviceId,
        timestamp: Date.now()
      })
    })

    // Simulation control endpoints
    this.app.post('/api/simulation/start', (req, res) => {
      if (this.globalConfig.isRunning) {
        return res.status(400).json({ error: 'Simulation already running' })
      }

      this.startSimulation()
      res.json({ success: true, status: 'started' })
    })

    this.app.post('/api/simulation/pause', (req, res) => {
      if (!this.globalConfig.isRunning) {
        return res.status(400).json({ error: 'Simulation not running' })
      }

      this.pauseSimulation()
      res.json({ success: true, status: 'paused' })
    })

    this.app.post('/api/simulation/speed', (req, res) => {
      const { speed } = req.body
      
      if (speed < 0.1 || speed > 10) {
        return res.status(400).json({ error: 'Speed must be between 0.1 and 10' })
      }

      this.globalConfig.simulationSpeed = speed
      this.timeController.setSpeed(speed)

      console.log(`[SimControl] Simulation speed set to ${speed}x`)
      
      res.json({ 
        success: true, 
        speed,
        timestamp: Date.now()
      })
    })
  }

  private redistributeGlobalRate() {
    const enabledDevices = Array.from(this.devices.entries())
      .filter(([_, config]) => config.enabled)
    
    if (enabledDevices.length === 0) return

    const ratePerDevice = this.globalConfig.globalMessagesPerHour / enabledDevices.length

    enabledDevices.forEach(([deviceId, config]) => {
      config.messagesPerHour = ratePerDevice
      if (config.generator) {
        config.generator.setMessagesPerHour(ratePerDevice)
      }
    })
  }

  private recalculateGlobalRate() {
    const totalRate = Array.from(this.devices.values())
      .filter(config => config.enabled)
      .reduce((sum, config) => sum + config.messagesPerHour, 0)
    
    this.globalConfig.globalMessagesPerHour = totalRate
  }

  private async broadcastAttachmentRateToDevices(percentage: number) {
    // Send to all device backends
    for (const [deviceId, config] of this.devices) {
      if (config.enabled) {
        const port = deviceId === 'alice' ? 3001 : 3002
        try {
          await fetch(`http://localhost:${port}/api/devices/${deviceId}/attachment-rate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ imageAttachmentPercentage: percentage })
          })
        } catch (error) {
          console.error(`[SimControl] Failed to update ${deviceId} attachment rate:`, error)
        }
      }
    }
  }

  private startSimulation() {
    console.log('[SimControl] Starting simulation...')
    
    this.globalConfig.isRunning = true
    this.timeController.start()

    // Start message generators for enabled devices
    this.devices.forEach((config, deviceId) => {
      if (config.enabled) {
        const generator = new AutoMessageGenerator(
          deviceId,
          config.messagesPerHour,
          config.imageAttachmentPercentage
        )
        generator.start()
        config.generator = generator
        console.log(`[SimControl] Started generator for ${deviceId}`)
      }
    })

    this.emit('simulation:started')
  }

  private pauseSimulation() {
    console.log('[SimControl] Pausing simulation...')
    
    this.globalConfig.isRunning = false
    this.timeController.stop()

    // Stop all generators
    this.devices.forEach((config, deviceId) => {
      if (config.generator) {
        config.generator.stop()
        config.generator = undefined
        console.log(`[SimControl] Stopped generator for ${deviceId}`)
      }
    })

    this.emit('simulation:paused')
  }

  async start() {
    return new Promise<void>((resolve) => {
      this.app.listen(this.port, () => {
        console.log(`[SimControl] Simulation Control Server running on port ${this.port}`)
        resolve()
      })
    })
  }

  stop() {
    this.pauseSimulation()
    // Server will be stopped by process termination
  }
}

// Export for use in tests and orchestrator
export { SimulationControlServer }

// If run directly, start the server
if (require.main === module) {
  const server = new SimulationControlServer()
  
  server.start().catch(error => {
    console.error('[SimControl] Failed to start:', error)
    process.exit(1)
  })

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[SimControl] Received SIGINT, shutting down...')
    server.stop()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    console.log('\n[SimControl] Received SIGTERM, shutting down...')
    server.stop()
    process.exit(0)
  })
}