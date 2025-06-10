import { NetworkSimulator, NetworkEvent, NetworkConfig, DeviceNetworkState } from './NetworkSimulator'
import { TimeListener, TimeEvent } from '../simulation/TimeController'

/**
 * TimeAwareNetworkSimulator extends NetworkSimulator to work with TimeController
 * for deterministic simulation time management
 */
export class TimeAwareNetworkSimulator extends NetworkSimulator implements TimeListener {
  private simulationTime: number = 0

  constructor(config?: NetworkConfig) {
    super(config)
  }

  /**
   * Handle time tick from TimeController
   */
  onTimeTick(event: TimeEvent): void {
    this.simulationTime = event.simulationTime
    // Process network events up to this simulation time
    super.tick(this.simulationTime)
  }

  /**
   * Override tick to use simulation time
   */
  tick(currentTime?: number) {
    // If called with explicit time, use it; otherwise use internal simulation time
    const timeToUse = currentTime !== undefined ? currentTime : this.simulationTime
    super.tick(timeToUse)
  }

  /**
   * Override sendEvent to use simulation time for timestamps
   */
  sendEvent(sourceDevice: string, targetDevice: string, type: NetworkEvent['type'], payload: any): NetworkEvent {
    // Temporarily set currentTime to simulation time for timestamp generation
    const originalTime = this.getCurrentTime()
    this['currentTime'] = this.simulationTime
    
    const event = super.sendEvent(sourceDevice, targetDevice, type, payload)
    
    // Restore original time
    this['currentTime'] = originalTime
    
    return event
  }

  /**
   * Get current simulation time
   */
  getSimulationTime(): number {
    return this.simulationTime
  }

  /**
   * Reset including simulation time
   */
  reset() {
    super.reset()
    this.simulationTime = 0
  }
}