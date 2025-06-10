import { SimulationOrchestrator } from './src/simulation/SimulationOrchestrator'
import { NetworkSimulatorService } from './src/simulation/NetworkSimulatorService'

interface DeviceConfig {
  deviceId: string
  port: number
  publicKey?: string
  privateKey?: string
}

class TestOrchestrator {
  private orchestrator: SimulationOrchestrator
  private alicePort: number
  private bobPort: number
  private networkPort: number
  private networkHttpPort: number
  
  constructor() {
    this.alicePort = parseInt(process.env.ALICE_PORT || '3011')
    this.bobPort = parseInt(process.env.BOB_PORT || '3012')
    this.networkPort = parseInt(process.env.NETWORK_SIMULATOR_PORT || '3013')
    this.networkHttpPort = parseInt(process.env.NETWORK_HTTP_PORT || '3014')
    
    this.orchestrator = new SimulationOrchestrator()
    
    // Access the private deviceConfigs through reflection
    const configs = (this.orchestrator as any).deviceConfigs as Map<string, DeviceConfig>
    configs.clear()
    configs.set('alice', { deviceId: 'alice', port: this.alicePort })
    configs.set('bob', { deviceId: 'bob', port: this.bobPort })
    
    console.log(`[TestOrchestrator] Configured for Alice:${this.alicePort}, Bob:${this.bobPort}, Network:${this.networkPort}, HTTP:${this.networkHttpPort}`)
  }
  
  async start() {
    // Override the network service start method
    const originalStartNetworkService = (this.orchestrator as any).startNetworkService.bind(this.orchestrator)
    ;(this.orchestrator as any).startNetworkService = async () => {
      console.log('[TestOrchestrator] Starting network simulator service on custom ports...')
      ;(this.orchestrator as any).networkService = new NetworkSimulatorService(this.networkPort, this.networkHttpPort)
      await new Promise(resolve => setTimeout(resolve, 2000))
    }
    
    await this.orchestrator.start()
  }
  
  async stop() {
    if ((this.orchestrator as any).stop) {
      await (this.orchestrator as any).stop()
    }
  }
}

const testOrchestrator = new TestOrchestrator()

process.on('SIGINT', async () => {
  console.log('\n[TestOrchestrator] Shutting down...')
  await testOrchestrator.stop()
  process.exit(0)
})

process.on('SIGTERM', async () => {
  console.log('\n[TestOrchestrator] Shutting down...')
  await testOrchestrator.stop()
  process.exit(0)
})

testOrchestrator.start().catch(console.error)
