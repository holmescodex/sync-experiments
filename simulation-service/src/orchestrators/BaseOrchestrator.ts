import * as ed from '@noble/ed25519'
import { sha512 } from '@noble/hashes/sha512'
import { PortRegistry } from '../utils/port-finder'

// Initialize sha512 for ed25519
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m))

export interface OrchestratorPorts {
  alice: number
  bob: number
  networkSimulator: number
  networkHttp: number
  frontend?: number
}

export interface DeviceConfig {
  deviceId: string
  port: number
  publicKey: string
  privateKey: string
}

/**
 * Base orchestrator with key generation and environment setup
 */
export abstract class BaseOrchestrator {
  protected ports: OrchestratorPorts
  protected deviceConfigs: Map<string, DeviceConfig> = new Map()
  protected instanceId: string
  
  constructor(ports: OrchestratorPorts, instanceId?: string) {
    this.ports = ports
    this.instanceId = instanceId || `orchestrator-${Date.now()}`
  }
  
  /**
   * Start the orchestrator
   */
  async start(): Promise<void> {
    console.log(`[${this.constructor.name}] Starting orchestrator ${this.instanceId}...`)
    
    // Generate device keys and configurations
    await this.generateDeviceKeys()
    
    // Set up environment variables
    this.setEnvironmentVariables()
    
    // Call subclass-specific start logic
    await this.startServices()
    
    console.log(`[${this.constructor.name}] Orchestrator ${this.instanceId} started successfully!`)
  }
  
  /**
   * Stop the orchestrator and clean up resources
   */
  async stop(): Promise<void> {
    console.log(`[${this.constructor.name}] Stopping orchestrator ${this.instanceId}...`)
    
    // Call subclass-specific stop logic
    await this.stopServices()
    
    // Release ports
    PortRegistry.releasePorts(this.instanceId)
    
    console.log(`[${this.constructor.name}] Orchestrator ${this.instanceId} stopped.`)
  }
  
  /**
   * Generate Ed25519 keys for all devices
   */
  private async generateDeviceKeys(): Promise<void> {
    console.log(`[${this.constructor.name}] Generating device keys...`)
    
    const devices = ['alice', 'bob']
    
    for (const deviceId of devices) {
      const privateKey = ed.utils.randomPrivateKey()
      const publicKey = await ed.getPublicKeyAsync(privateKey)
      
      const config: DeviceConfig = {
        deviceId,
        port: deviceId === 'alice' ? this.ports.alice : this.ports.bob,
        privateKey: Buffer.from(privateKey).toString('base64'),
        publicKey: Buffer.from(publicKey).toString('base64')
      }
      
      this.deviceConfigs.set(deviceId, config)
      console.log(`[${this.constructor.name}] Generated keys for ${deviceId}`)
    }
  }
  
  /**
   * Set up environment variables for orchestrated testing
   */
  private setEnvironmentVariables(): void {
    console.log(`[${this.constructor.name}] Setting up environment variables...`)
    
    // Port configuration
    process.env.ALICE_PORT = this.ports.alice.toString()
    process.env.BOB_PORT = this.ports.bob.toString()
    process.env.ALICE_BACKEND_URL = `http://localhost:${this.ports.alice}`
    process.env.BOB_BACKEND_URL = `http://localhost:${this.ports.bob}`
    
    if (this.ports.networkSimulator) {
      process.env.NETWORK_SIMULATOR_PORT = this.ports.networkSimulator.toString()
      process.env.NETWORK_HTTP_PORT = this.ports.networkHttp.toString()
      process.env.NETWORK_HTTP_URL = `http://localhost:${this.ports.networkHttp}`
    }
    
    if (this.ports.frontend) {
      process.env.FRONTEND_PORT = this.ports.frontend.toString()
      process.env.VITE_PORT = this.ports.frontend.toString()
      process.env.VITE_ALICE_BACKEND_URL = `http://localhost:${this.ports.alice}`
      process.env.VITE_BOB_BACKEND_URL = `http://localhost:${this.ports.bob}`
    }
    
    // Test mode
    process.env.TEST_MODE = 'orchestrated'
    process.env.INSTANCE_ID = this.instanceId
    
    // Crypto keys - generate peer keys JSON
    const peerKeys: Record<string, string> = {}
    for (const [deviceId, config] of this.deviceConfigs) {
      peerKeys[deviceId] = config.publicKey
    }
    
    process.env.PEER_KEYS = JSON.stringify(peerKeys)
    process.env.TRUSTED_PEERS = Array.from(this.deviceConfigs.keys()).join(',')
    
    console.log(`[${this.constructor.name}] Environment configured for orchestrated testing`)
  }
  
  /**
   * Get environment variables for a specific device
   */
  protected getDeviceEnvironment(deviceId: string): Record<string, string> {
    const config = this.deviceConfigs.get(deviceId)
    if (!config) {
      throw new Error(`Device config not found for ${deviceId}`)
    }
    
    return {
      ...process.env,
      DEVICE_ID: deviceId,
      PORT: config.port.toString(),
      PRIVATE_KEY: config.privateKey,
      PUBLIC_KEY: config.publicKey,
      PEER_KEYS: process.env.PEER_KEYS!,
      TRUSTED_PEERS: process.env.TRUSTED_PEERS!,
      NETWORK_SIMULATOR_PORT: this.ports.networkSimulator?.toString() || '',
      NETWORK_HTTP_PORT: this.ports.networkHttp?.toString() || '',
      TEST_MODE: 'orchestrated',
      INSTANCE_ID: this.instanceId
    } as Record<string, string>
  }
  
  /**
   * Abstract method for subclasses to implement service startup
   */
  protected abstract startServices(): Promise<void>
  
  /**
   * Abstract method for subclasses to implement service shutdown
   */
  protected abstract stopServices(): Promise<void>
  
  /**
   * Get orchestrator info for debugging
   */
  getInfo(): { instanceId: string, ports: OrchestratorPorts, devices: string[] } {
    return {
      instanceId: this.instanceId,
      ports: this.ports,
      devices: Array.from(this.deviceConfigs.keys())
    }
  }
}