import { BaseOrchestrator, OrchestratorPorts } from './BaseOrchestrator'

/**
 * Minimal orchestrator for unit tests
 * Only sets up environment variables and keys, no processes
 */
export class MinimalOrchestrator extends BaseOrchestrator {
  constructor(ports: OrchestratorPorts, instanceId?: string) {
    super(ports, instanceId)
  }
  
  /**
   * Minimal orchestrator doesn't start any services, just sets up environment
   */
  protected async startServices(): Promise<void> {
    console.log(`[MinimalOrchestrator] Environment setup complete - no services to start`)
    console.log(`[MinimalOrchestrator] Alice: ${this.ports.alice}, Bob: ${this.ports.bob}`)
    console.log(`[MinimalOrchestrator] Ready for unit tests with orchestrated environment`)
  }
  
  /**
   * No services to stop
   */
  protected async stopServices(): Promise<void> {
    console.log(`[MinimalOrchestrator] No services to stop`)
  }
  
  /**
   * Verify the environment is set up correctly
   */
  verifyEnvironment(): boolean {
    const requiredEnvVars = [
      'ALICE_PORT',
      'BOB_PORT', 
      'ALICE_BACKEND_URL',
      'BOB_BACKEND_URL',
      'PEER_KEYS',
      'TRUSTED_PEERS',
      'TEST_MODE'
    ]
    
    for (const envVar of requiredEnvVars) {
      if (!process.env[envVar]) {
        console.error(`[MinimalOrchestrator] Missing environment variable: ${envVar}`)
        return false
      }
    }
    
    console.log(`[MinimalOrchestrator] Environment verification passed`)
    return true
  }
  
  /**
   * Get the crypto setup for tests to verify
   */
  getCryptoSetup(): { peerKeys: Record<string, string>, trustedPeers: string[] } {
    return {
      peerKeys: JSON.parse(process.env.PEER_KEYS || '{}'),
      trustedPeers: (process.env.TRUSTED_PEERS || '').split(',').filter(p => p)
    }
  }
}