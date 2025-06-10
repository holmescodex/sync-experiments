import { EventEmitter } from 'events'
import { spawn, ChildProcess } from 'child_process'
import express from 'express'
import { WebSocketServer } from 'ws'
import { TimeController } from '../simulation/TimeController'
import { NetworkSimulator } from '../network/NetworkSimulator'
import { AutoMessageGenerator } from '../simulation/AutoMessageGenerator'
import { findAvailablePorts, PortRegistry } from '../utils/port-finder'
import type { SimulationEvent } from '../types/simulation'

interface DeviceConfig {
  deviceId: string
  port: number
  process?: ChildProcess
  ready: boolean
  generator?: AutoMessageGenerator
}

interface OrchestratorConfig {
  devices: string[]
  basePort?: number
  syncInterval?: number
  globalMessagesPerHour?: number
  imageAttachmentPercentage?: number
  mode?: 'simulation' | 'direct-udp'  // Default is 'simulation'
  setupTrust?: boolean  // Auto-setup trust between devices
}

/**
 * Unified orchestrator that manages all simulation components in-memory
 * Provides a single API for controlling backends, time, and events
 */
export class UnifiedOrchestrator extends EventEmitter {
  private timeController: TimeController
  private networkSimulator: NetworkSimulator
  private devices: Map<string, DeviceConfig> = new Map()
  private eventTimeline: SimulationEvent[] = []
  private wsServer?: WebSocketServer
  private httpServer?: any
  private app = express()
  private config: OrchestratorConfig
  private instanceId: string
  private isRunning = false
  private ports?: any

  constructor(config: OrchestratorConfig) {
    super()
    this.config = { mode: 'simulation', ...config }  // Default to simulation mode
    this.instanceId = `orchestrator-${Date.now()}`
    this.timeController = new TimeController()
    
    // Only create network simulator in simulation mode
    if (this.config.mode === 'simulation') {
      this.networkSimulator = new NetworkSimulator()
      
      // Set up time-aware network simulation
      this.timeController.addListener({
        onTimeTick: (event) => {
          this.networkSimulator.tick(event.simulationTime)
        }
      })
    }
    
    this.setupAPI()
  }

  /**
   * Start the orchestrator and all services
   */
  async start(): Promise<void> {
    console.log(`[UnifiedOrchestrator] Starting ${this.instanceId} in ${this.config.mode} mode`)
    
    // 1. Allocate ports
    await this.allocatePorts()
    
    // 2. Setup trust BEFORE starting backends if requested
    if (this.config.setupTrust) {
      await this.setupTrust()
    }
    
    // 3. Start HTTP API (always) and network service (simulation mode only)
    await this.startAPIServer()
    if (this.config.mode === 'simulation') {
      await this.startNetworkService()
    }
    
    // 4. Start backend processes
    await this.startBackends()
    
    // 5. Wait for backends to be ready
    await this.waitForBackends()
    
    // 6. Initialize auto message generators (only in simulation mode)
    if (this.config.mode === 'simulation') {
      await this.initializeGenerators()
    }
    
    // 7. Start time controller
    this.timeController.start()
    this.isRunning = true
    
    // 8. Start time ticking (only in simulation mode)
    if (this.config.mode === 'simulation') {
      this.startTimeTicking()
    }
    
    console.log(`[UnifiedOrchestrator] Ready!`)
    this.emit('ready', this.getStatus())
  }

  /**
   * Stop everything
   */
  async stop(): Promise<void> {
    console.log(`[UnifiedOrchestrator] Stopping ${this.instanceId}`)
    
    this.isRunning = false
    this.timeController.stop()
    
    // Stop generators
    for (const device of this.devices.values()) {
      if (device.generator) {
        device.generator.stop()
      }
    }
    
    // Stop backends
    for (const device of this.devices.values()) {
      if (device.process) {
        device.process.kill('SIGTERM')
      }
    }
    
    // Stop network service
    if (this.wsServer) {
      this.wsServer.close()
    }
    if (this.httpServer) {
      this.httpServer.close()
    }
    
    // Wait a bit for processes to clean up
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Release ports
    PortRegistry.releasePorts(this.instanceId)
    
    console.log(`[UnifiedOrchestrator] Stopped`)
  }

  /**
   * Advance simulation time
   */
  advanceTime(deltaMs: number): void {
    this.timeController.advance(deltaMs)
    this.processGeneratorEvents()
  }

  /**
   * Set simulation speed
   */
  setSpeed(multiplier: number): void {
    this.timeController.setSpeed(multiplier)
  }

  /**
   * Get current status
   */
  getStatus() {
    return {
      instanceId: this.instanceId,
      isRunning: this.isRunning,
      simulationTime: this.timeController.getCurrentTime(),
      timeState: this.timeController.getState(),
      devices: Array.from(this.devices.entries()).map(([id, config]) => ({
        deviceId: id,
        port: config.port,
        ready: config.ready
      })),
      networkStats: this.networkSimulator ? this.networkSimulator.getNetworkStats() : {},
      eventCount: this.eventTimeline.length,
      ports: this.ports
    }
  }

  /**
   * Wait for a message to be delivered
   */
  async waitForMessageDelivery(fromDevice: string, toDevice: string, content: string, maxTime: number = 10000): Promise<boolean> {
    const startTime = this.timeController.getCurrentTime()
    
    while (this.timeController.getCurrentTime() - startTime < maxTime) {
      // Check if message was delivered
      const response = await fetch(`http://localhost:${this.devices.get(toDevice)?.port}/api/messages`)
      const messages = await response.json()
      
      if (messages.some((m: any) => m.content === content && m.author === fromDevice)) {
        return true
      }
      
      // Advance time by 100ms
      this.advanceTime(100)
      
      // Process any pending network events
      await new Promise(resolve => setImmediate(resolve))
    }
    
    return false
  }

  // Private methods

  private async allocatePorts() {
    let portCount = this.config.devices.length
    
    if (this.config.mode === 'direct-udp') {
      // Need HTTP + UDP port for each device
      portCount *= 2
    } else {
      // Need device ports + network ws + http
      portCount += 2
    }
    
    const ports = await findAvailablePorts(this.config.basePort || 7000, portCount)
    
    if (this.config.mode === 'direct-udp') {
      this.ports = {
        devices: {} as any,
        udpPorts: {} as any
      }
      
      // Assign HTTP and UDP ports for each device
      this.config.devices.forEach((deviceId, index) => {
        const httpPort = ports[index * 2]
        const udpPort = ports[index * 2 + 1]
        
        this.ports.devices[deviceId] = httpPort
        this.ports.udpPorts[deviceId] = udpPort
        
        this.devices.set(deviceId, {
          deviceId,
          port: httpPort,
          ready: false
        })
      })
    } else {
      this.ports = {
        devices: {} as any,
        networkWs: ports[this.config.devices.length],
        networkHttp: ports[this.config.devices.length + 1]
      }
      
      // Assign device ports
      this.config.devices.forEach((deviceId, index) => {
        this.ports.devices[deviceId] = ports[index]
        this.devices.set(deviceId, {
          deviceId,
          port: ports[index],
          ready: false
        })
      })
    }
    
    PortRegistry.reservePorts(this.instanceId, ports)
    console.log(`[UnifiedOrchestrator] Allocated ports:`, this.ports)
  }

  private async startAPIServer() {
    // Always start HTTP API server for status and port discovery
    const apiPort = this.config.mode === 'direct-udp' 
      ? this.ports.devices.alice + 100  // Use a port offset for direct-udp mode
      : this.ports.networkHttp
    
    this.httpServer = this.app.listen(apiPort)
    console.log(`[UnifiedOrchestrator] HTTP API started on port ${apiPort}`)
  }

  private async startNetworkService() {
    // WebSocket server for backend connections (simulation mode only)
    this.wsServer = new WebSocketServer({ port: this.ports.networkWs })
    
    this.wsServer.on('connection', (ws) => {
      let deviceId: string | null = null
      
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())
        
        if (message.type === 'register') {
          deviceId = message.deviceId
          this.networkSimulator.addDevice(deviceId)
          ws.send(JSON.stringify({ type: 'registered' }))
          console.log(`[UnifiedOrchestrator] Device ${deviceId} connected`)
        } else if (message.type === 'broadcast') {
          const events = this.networkSimulator.broadcastEvent(
            message.from,
            message.eventType,
            message.payload
          )
          // Events will be delivered on next tick
        }
      })
      
      // Set up network event forwarding
      this.networkSimulator.onNetworkEvent((event) => {
        if (event.status === 'delivered' && event.targetDevice === deviceId) {
          ws.send(JSON.stringify({
            type: 'network_event',
            event
          }))
        }
      })
    })
    
    console.log(`[UnifiedOrchestrator] WebSocket service started on port ${this.ports.networkWs}`)
  }

  private async startBackends() {
    for (const [deviceId, config] of this.devices) {
      let env: any = {
        ...process.env,
        DEVICE_ID: deviceId,
        PORT: config.port.toString(),
        SYNC_INTERVAL: (this.config.syncInterval || 1000).toString()
      }
      
      if (this.config.mode === 'direct-udp') {
        // Direct UDP mode - backends communicate directly
        env.UDP_PORT = this.ports.udpPorts[deviceId].toString()
        
        // Build peer endpoints string
        const peerEndpoints = this.config.devices
          .filter(id => id !== deviceId)
          .map(id => `${id}:localhost:${this.ports.udpPorts[id]}`)
          .join(',')
        
        env.PEER_ENDPOINTS = peerEndpoints
      } else {
        // Simulation mode - use network simulator
        env.NETWORK_SIMULATOR_PORT = this.ports.networkWs.toString()
      }
      
      config.process = spawn('npx', ['tsx', 'src/server.ts'], {
        env,
        cwd: process.cwd()
      })
      
      // Capture output
      config.process.stdout?.on('data', (data) => {
        console.log(`[${deviceId}]`, data.toString().trim())
      })
      
      config.process.stderr?.on('data', (data) => {
        console.error(`[${deviceId}]`, data.toString().trim())
      })
    }
  }

  private async waitForBackends() {
    console.log(`[UnifiedOrchestrator] Waiting for backends...`)
    
    // First wait for HTTP endpoints
    for (const [deviceId, config] of this.devices) {
      let attempts = 0
      while (attempts < 30) {
        try {
          const response = await fetch(`http://localhost:${config.port}/api/health`)
          if (response.ok) {
            console.log(`[UnifiedOrchestrator] ${deviceId} HTTP endpoint ready`)
            break
          }
        } catch (e) {
          // Not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
      }
      
      if (attempts >= 30) {
        throw new Error(`${deviceId} backend failed to start`)
      }
    }
    
    // Then wait for sync to be active
    for (const [deviceId, config] of this.devices) {
      let syncActive = false
      let attempts = 0
      
      while (!syncActive && attempts < 50) {
        try {
          const response = await fetch(`http://localhost:${config.port}/api/health`)
          const health = await response.json()
          syncActive = health.syncActive
          
          if (syncActive) {
            config.ready = true
            console.log(`[UnifiedOrchestrator] ${deviceId} sync active`)
            break
          }
        } catch (e) {
          // Not ready yet
        }
        await new Promise(resolve => setTimeout(resolve, 100))
        attempts++
      }
      
      if (!config.ready) {
        throw new Error(`${deviceId} sync failed to start`)
      }
    }
  }

  private async initializeGenerators() {
    const messagesPerDevice = (this.config.globalMessagesPerHour || 60) / this.devices.size
    
    for (const [deviceId, config] of this.devices) {
      config.generator = new AutoMessageGenerator(
        deviceId,
        `http://localhost:${config.port}`,
        messagesPerDevice,
        this.config.imageAttachmentPercentage || 30
      )
      
      // Use time controller for scheduling
      config.generator.setTimeSource(() => this.timeController.getCurrentTime())
    }
  }

  private startTimeTicking() {
    // Don't auto-tick in test mode - let tests control time
    if (process.env.TEST_MODE === 'true') {
      return
    }
    
    // Otherwise tick at 10Hz real-time
    setInterval(() => {
      if (this.isRunning) {
        this.timeController.tick()
        this.processGeneratorEvents()
      }
    }, 100)
  }

  private processGeneratorEvents() {
    // Check if any generators should fire based on current time
    const currentTime = this.timeController.getCurrentTime()
    
    for (const device of this.devices.values()) {
      if (device.generator) {
        device.generator.checkAndGenerate(currentTime)
      }
    }
  }

  private async setupTrust() {
    console.log(`[UnifiedOrchestrator] Setting up trust between devices...`)
    
    // Import KeyManager here to set up trust
    const { KeyManager } = await import('../crypto/KeyManager')
    
    // Initialize all key managers first
    const keyManagers = new Map<string, any>()
    for (const deviceId of this.config.devices) {
      const km = new KeyManager(deviceId)
      await km.initialize()
      keyManagers.set(deviceId, km)
    }
    
    // Reload to pick up all keys
    for (const km of keyManagers.values()) {
      await km.initialize()
    }
    
    // Establish mutual trust
    for (let i = 0; i < this.config.devices.length; i++) {
      for (let j = i + 1; j < this.config.devices.length; j++) {
        const device1 = this.config.devices[i]
        const device2 = this.config.devices[j]
        
        try {
          keyManagers.get(device1)!.trustPeer(device2)
          keyManagers.get(device2)!.trustPeer(device1)
          console.log(`[UnifiedOrchestrator] ✓ Trust established: ${device1} <-> ${device2}`)
        } catch (e) {
          console.log(`[UnifiedOrchestrator] Trust already exists: ${device1} <-> ${device2}`)
        }
      }
    }
  }
  
  private runCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { exec } = require('child_process')
      exec(command, (error: any, stdout: string, stderr: string) => {
        if (error) {
          reject(error)
        } else {
          resolve()
        }
      })
    })
  }
  
  private setupAPI() {
    this.app.use(express.json())
    
    // Status
    this.app.get('/api/status', (req, res) => {
      res.json(this.getStatus())
    })
    
    // Time control
    this.app.post('/api/time/advance', (req, res) => {
      const { deltaMs } = req.body
      this.advanceTime(deltaMs)
      res.json({ 
        success: true, 
        simulationTime: this.timeController.getCurrentTime() 
      })
    })
    
    this.app.post('/api/time/speed', (req, res) => {
      const { multiplier } = req.body
      this.setSpeed(multiplier)
      res.json({ success: true, multiplier })
    })
    
    // Network stats
    this.app.get('/api/network/stats', (req, res) => {
      if (this.networkSimulator) {
        res.json(this.networkSimulator.getNetworkStats())
      } else {
        res.json({ mode: 'direct-udp', message: 'No network simulation in direct UDP mode' })
      }
    })
    
    // Events
    this.app.get('/api/events', (req, res) => {
      res.json(this.eventTimeline)
    })
    
    // Device URLs
    this.app.get('/api/devices', (req, res) => {
      const devices: any = {}
      for (const [id, config] of this.devices) {
        devices[id] = `http://localhost:${config.port}`
      }
      res.json(devices)
    })
  }
}

// Export singleton getter
let instance: UnifiedOrchestrator | null = null

export function getOrchestrator(config?: OrchestratorConfig): UnifiedOrchestrator {
  if (!instance && config) {
    instance = new UnifiedOrchestrator(config)
  }
  if (!instance) {
    throw new Error('Orchestrator not initialized')
  }
  return instance
}