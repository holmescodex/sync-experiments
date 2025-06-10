import { spawn, ChildProcess } from 'child_process'
import { BaseOrchestrator, OrchestratorPorts } from './BaseOrchestrator'
import { NetworkSimulatorService } from '../simulation/NetworkSimulatorService'

/**
 * Backend orchestrator for integration tests
 * Starts alice/bob backends + network service
 */
export class BackendOrchestrator extends BaseOrchestrator {
  private networkService: NetworkSimulatorService | null = null
  private backends: Map<string, ChildProcess> = new Map()
  
  constructor(ports: OrchestratorPorts, instanceId?: string) {
    super(ports, instanceId)
  }
  
  /**
   * Start network service and backend processes
   */
  protected async startServices(): Promise<void> {
    console.log(`[BackendOrchestrator] Starting network service and backends...`)
    
    // 1. Start network simulator service
    await this.startNetworkService()
    
    // 2. Start backend processes
    await this.startBackends()
    
    // 3. Wait for all services to be ready
    await this.waitForServices()
    
    console.log(`[BackendOrchestrator] All services ready!`)
  }
  
  /**
   * Stop all services
   */
  protected async stopServices(): Promise<void> {
    console.log(`[BackendOrchestrator] Stopping all services...`)
    
    // Stop backends
    for (const [deviceId, process] of this.backends) {
      console.log(`[BackendOrchestrator] Stopping ${deviceId} backend...`)
      process.kill('SIGTERM')
      
      // Give it time to shutdown gracefully
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      if (!process.killed) {
        console.log(`[BackendOrchestrator] Force killing ${deviceId} backend...`)
        process.kill('SIGKILL')
      }
    }
    this.backends.clear()
    
    // Stop network service
    if (this.networkService) {
      console.log(`[BackendOrchestrator] Stopping network service...`)
      this.networkService.stop()
      this.networkService = null
    }
  }
  
  /**
   * Start the network simulator service
   */
  private async startNetworkService(): Promise<void> {
    console.log(`[BackendOrchestrator] Starting network simulator service...`)
    
    this.networkService = new NetworkSimulatorService(
      this.ports.networkSimulator,
      this.ports.networkHttp
    )
    
    // Wait for service to start
    await new Promise(resolve => setTimeout(resolve, 2000))
    console.log(`[BackendOrchestrator] Network service started on ports ${this.ports.networkSimulator}/${this.ports.networkHttp}`)
  }
  
  /**
   * Start backend processes with injected keys and configuration
   */
  private async startBackends(): Promise<void> {
    console.log(`[BackendOrchestrator] Starting backend processes...`)
    
    for (const [deviceId, config] of this.deviceConfigs) {
      const env = this.getDeviceEnvironment(deviceId)
      
      console.log(`[BackendOrchestrator] Starting ${deviceId} backend on port ${config.port}...`)
      
      const backend = spawn('npx', ['tsx', 'src/server.ts'], {
        env,
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      })
      
      // Log output with device prefix
      backend.stdout?.on('data', (data) => {
        const lines = data.toString().trim().split('\\n')
        lines.forEach((line: string) => {
          if (line) console.log(`[${deviceId}] ${line}`)
        })
      })
      
      backend.stderr?.on('data', (data) => {
        const lines = data.toString().trim().split('\\n')
        lines.forEach((line: string) => {
          if (line) console.error(`[${deviceId}] ERROR: ${line}`)
        })
      })
      
      backend.on('exit', (code) => {
        console.log(`[BackendOrchestrator] ${deviceId} backend exited with code ${code}`)
        this.backends.delete(deviceId)
      })
      
      this.backends.set(deviceId, backend)
    }
  }
  
  /**
   * Wait for all services to be ready
   */
  private async waitForServices(): Promise<void> {
    console.log(`[BackendOrchestrator] Waiting for services to be ready...`)
    
    const maxAttempts = 30
    const delay = 1000
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check alice backend
        const aliceResponse = await fetch(`http://localhost:${this.ports.alice}/api/health`)
        const bobResponse = await fetch(`http://localhost:${this.ports.bob}/api/health`)
        
        if (aliceResponse.ok && bobResponse.ok) {
          console.log(`[BackendOrchestrator] All backends ready after ${attempt} attempts`)
          return
        }
      } catch (error) {
        // Services not ready yet
      }
      
      if (attempt === maxAttempts) {
        throw new Error(`Services failed to start after ${maxAttempts} attempts`)
      }
      
      console.log(`[BackendOrchestrator] Attempt ${attempt}/${maxAttempts} - waiting for services...`)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  /**
   * Get health status of all services
   */
  async getHealth(): Promise<{ alice: boolean, bob: boolean, network: boolean }> {
    const health = {
      alice: false,
      bob: false,
      network: false
    }
    
    try {
      const aliceResponse = await fetch(`http://localhost:${this.ports.alice}/api/health`)
      health.alice = aliceResponse.ok
    } catch (e) {
      // Alice not ready
    }
    
    try {
      const bobResponse = await fetch(`http://localhost:${this.ports.bob}/api/health`)
      health.bob = bobResponse.ok
    } catch (e) {
      // Bob not ready  
    }
    
    try {
      const networkResponse = await fetch(`http://localhost:${this.ports.networkHttp}/api/health`)
      health.network = networkResponse.ok
    } catch (e) {
      // Network service not ready
    }
    
    return health
  }
  
  /**
   * Send a test message to verify the system is working
   */
  async sendTestMessage(from: 'alice' | 'bob', content: string): Promise<any> {
    const port = from === 'alice' ? this.ports.alice : this.ports.bob
    
    const response = await fetch(`http://localhost:${port}/api/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    })
    
    if (!response.ok) {
      throw new Error(`Failed to send test message: ${response.statusText}`)
    }
    
    return response.json()
  }
  
  /**
   * Get messages from a device
   */
  async getMessages(from: 'alice' | 'bob'): Promise<any> {
    const port = from === 'alice' ? this.ports.alice : this.ports.bob
    
    const response = await fetch(`http://localhost:${port}/api/messages`)
    
    if (!response.ok) {
      throw new Error(`Failed to get messages: ${response.statusText}`)
    }
    
    return response.json()
  }
}