import { spawn, ChildProcess } from 'child_process'
import { NetworkSimulatorService } from './NetworkSimulatorService'
import { AutoMessageGenerator } from './AutoMessageGenerator'
import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { randomBytes } from 'crypto'

// Initialize sha512 for ed25519
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

interface DeviceConfig {
  deviceId: string
  port: number
  publicKey?: string
  privateKey?: string
}

/**
 * SimulationOrchestrator manages the entire simulation environment:
 * - Starts the network simulator service
 * - Generates keys for devices
 * - Starts backend processes with proper configuration
 * - Establishes trust relationships automatically
 */
export class SimulationOrchestrator {
  private networkService: NetworkSimulatorService | null = null
  private backends: Map<string, ChildProcess> = new Map()
  private messageGenerators: Map<string, AutoMessageGenerator> = new Map()
  private deviceConfigs: Map<string, DeviceConfig> = new Map()
  
  constructor() {
    // Use environment variables for ports with defaults
    const alicePort = parseInt(process.env.ALICE_PORT || '3001')
    const bobPort = parseInt(process.env.BOB_PORT || '3002')
    
    // Default device configurations
    this.deviceConfigs.set('alice', { deviceId: 'alice', port: alicePort })
    this.deviceConfigs.set('bob', { deviceId: 'bob', port: bobPort })
  }
  
  /**
   * Start the complete simulation environment
   */
  async start() {
    console.log('[SimulationOrchestrator] Starting simulation environment...')
    
    // 1. Generate keys for all devices
    await this.generateDeviceKeys()
    
    // 2. Start network simulator service
    await this.startNetworkService()
    
    // 3. Start backend processes
    await this.startBackends()
    
    // 4. Wait for backends to connect
    await this.waitForBackends()
    
    // 5. Distribute keys and establish trust
    await this.distributeKeysAndTrust()
    
    console.log('[SimulationOrchestrator] Simulation environment ready!')
    
    // 6. Start automatic message generation
    await this.startMessageGenerators()
  }
  
  /**
   * Generate Ed25519 keys for all devices
   */
  private async generateDeviceKeys() {
    console.log('[SimulationOrchestrator] Generating device keys...')
    
    for (const [deviceId, config] of this.deviceConfigs) {
      const privateKey = ed.utils.randomPrivateKey()
      const publicKey = await ed.getPublicKeyAsync(privateKey)
      
      config.privateKey = Buffer.from(privateKey).toString('base64')
      config.publicKey = Buffer.from(publicKey).toString('base64')
      
      console.log(`[SimulationOrchestrator] Generated keys for ${deviceId}`)
    }
  }
  
  /**
   * Start the network simulator service
   */
  private async startNetworkService() {
    console.log('[SimulationOrchestrator] Starting network simulator service...')
    
    const wsPort = parseInt(process.env.NETWORK_SIMULATOR_PORT || '3003')
    const httpPort = parseInt(process.env.NETWORK_HTTP_PORT || '3004')
    
    this.networkService = new NetworkSimulatorService(wsPort, httpPort)
    
    // Wait a bit for the service to start
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  
  /**
   * Start backend processes with injected keys
   */
  private async startBackends() {
    console.log('[SimulationOrchestrator] Starting backend processes...')
    
    for (const [deviceId, config] of this.deviceConfigs) {
      const env = {
        ...process.env,
        DEVICE_ID: deviceId,
        PORT: config.port.toString(),
        PRIVATE_KEY: config.privateKey!,
        PUBLIC_KEY: config.publicKey!,
        // Provide peer keys and trust list
        PEER_KEYS: this.getPeerKeysJson(deviceId),
        TRUSTED_PEERS: this.getTrustedPeersList(deviceId),
        // Pass network service ports for proper configuration
        NETWORK_SIMULATOR_PORT: process.env.NETWORK_SIMULATOR_PORT || '3003',
        NETWORK_HTTP_PORT: process.env.NETWORK_HTTP_PORT || '3004'
      }
      
      const backend = spawn('npx', ['tsx', 'src/server.ts'], {
        env,
        cwd: process.cwd(),
        stdio: ['ignore', 'pipe', 'pipe']
      })
      
      // Log output
      backend.stdout?.on('data', (data) => {
        console.log(`[${deviceId}] ${data.toString().trim()}`)
      })
      
      backend.stderr?.on('data', (data) => {
        console.error(`[${deviceId}] ERROR: ${data.toString().trim()}`)
      })
      
      backend.on('exit', (code) => {
        console.log(`[${deviceId}] Backend exited with code ${code}`)
        this.backends.delete(deviceId)
      })
      
      this.backends.set(deviceId, backend)
      console.log(`[SimulationOrchestrator] Started backend for ${deviceId} on port ${config.port}`)
    }
  }
  
  /**
   * Get peer keys as JSON for a device (excluding itself)
   */
  private getPeerKeysJson(deviceId: string): string {
    const peerKeys: Record<string, string> = {}
    
    for (const [peerId, config] of this.deviceConfigs) {
      if (peerId !== deviceId && config.publicKey) {
        peerKeys[peerId] = config.publicKey
      }
    }
    
    return JSON.stringify(peerKeys)
  }
  
  /**
   * Get list of trusted peers for a device (all other devices in simulation)
   */
  private getTrustedPeersList(deviceId: string): string {
    const trustedPeers: string[] = []
    
    for (const [peerId] of this.deviceConfigs) {
      if (peerId !== deviceId) {
        trustedPeers.push(peerId)
      }
    }
    
    return trustedPeers.join(',')
  }
  
  /**
   * Wait for backends to be ready
   */
  private async waitForBackends() {
    console.log('[SimulationOrchestrator] Waiting for backends to start...')
    
    const maxRetries = 30
    const retryDelay = 1000
    
    for (const [deviceId, config] of this.deviceConfigs) {
      let ready = false
      
      for (let i = 0; i < maxRetries; i++) {
        try {
          const response = await fetch(`http://localhost:${config.port}/api/health`)
          if (response.ok) {
            ready = true
            console.log(`[SimulationOrchestrator] ${deviceId} backend is ready`)
            break
          }
        } catch (error) {
          // Backend not ready yet
        }
        
        await new Promise(resolve => setTimeout(resolve, retryDelay))
      }
      
      if (!ready) {
        throw new Error(`${deviceId} backend failed to start`)
      }
    }
  }
  
  /**
   * Distribute keys and establish trust relationships
   */
  private async distributeKeysAndTrust() {
    console.log('[SimulationOrchestrator] Establishing trust relationships...')
    
    // In this implementation, trust is established via environment variables
    // when backends start. This method is a placeholder for future enhancements
    // like dynamic trust management.
    
    console.log('[SimulationOrchestrator] Trust relationships established')
  }
  
  /**
   * Start automatic message generators for each device
   */
  private async startMessageGenerators() {
    console.log('[SimulationOrchestrator] Starting message generators...')
    
    // Wait longer for backends to fully initialize and sync managers to start
    console.log('[SimulationOrchestrator] Waiting 5 seconds for backends to fully initialize...')
    await new Promise(resolve => setTimeout(resolve, 5000))
    
    // Start message generators with default rates
    for (const [deviceId, config] of this.deviceConfigs) {
      const messagesPerHour = deviceId === 'alice' ? 30 : 20 // Alice sends more
      const generator = new AutoMessageGenerator(deviceId, messagesPerHour, 30)
      generator.start()
      this.messageGenerators.set(deviceId, generator)
      console.log(`[SimulationOrchestrator] Started message generator for ${deviceId} at ${messagesPerHour} messages/hour`)
    }
  }
  
  /**
   * Stop the simulation environment
   */
  async stop() {
    console.log('[SimulationOrchestrator] Stopping simulation environment...')
    
    // Stop message generators
    for (const [deviceId, generator] of this.messageGenerators) {
      console.log(`[SimulationOrchestrator] Stopping message generator for ${deviceId}...`)
      generator.stop()
    }
    
    // Stop backends
    for (const [deviceId, backend] of this.backends) {
      console.log(`[SimulationOrchestrator] Stopping ${deviceId} backend...`)
      backend.kill('SIGTERM')
    }
    
    // Stop network service
    if (this.networkService) {
      this.networkService.close()
    }
    
    console.log('[SimulationOrchestrator] Simulation environment stopped')
  }
}

// If run directly, start the orchestrator
if (require.main === module) {
  const orchestrator = new SimulationOrchestrator()
  
  orchestrator.start().catch(error => {
    console.error('[SimulationOrchestrator] Failed to start:', error)
    process.exit(1)
  })
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[SimulationOrchestrator] Received SIGINT, shutting down...')
    await orchestrator.stop()
    process.exit(0)
  })
}