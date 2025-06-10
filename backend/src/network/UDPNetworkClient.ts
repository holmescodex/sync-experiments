import { createSocket, Socket } from 'dgram'
import { EventEmitter } from 'events'
import type { NetworkSimulator, NetworkEvent, NetworkConfig } from './NetworkSimulator'

/**
 * UDP-based network client for backends
 * Implements the NetworkSimulator interface but uses real UDP
 */
export class UDPNetworkClient extends EventEmitter implements NetworkSimulator {
  private socket: Socket
  private deviceId: string
  private networkAddress: string
  private networkPort: number
  private localPort: number
  private isConnected: boolean = false
  private eventCallbacks: Array<(event: NetworkEvent) => void> = []
  private messageQueue: Array<{ target: string; type: string; payload: any }> = []

  constructor(
    deviceId: string, 
    networkAddress: string = 'localhost',
    networkPort: number = 8000,
    localPort?: number
  ) {
    super()
    this.deviceId = deviceId
    this.networkAddress = networkAddress
    this.networkPort = networkPort
    this.localPort = localPort || (8001 + Math.floor(Math.random() * 1000))
    this.socket = createSocket('udp4')
    this.setupSocket()
  }

  /**
   * Connect to the network simulator
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.bind(this.localPort, () => {
        console.log(`[UDPNetworkClient] ${this.deviceId} listening on UDP port ${this.localPort}`)
        
        // Register with network simulator
        this.sendPacket('network', 'register', {})
        
        // Wait for registration confirmation
        const timeout = setTimeout(() => {
          reject(new Error('Registration timeout'))
        }, 5000)
        
        this.once('registered', () => {
          clearTimeout(timeout)
          this.isConnected = true
          console.log(`[UDPNetworkClient] ${this.deviceId} connected to network`)
          
          // Process any queued messages
          this.processMessageQueue()
          resolve()
        })
      })
      
      this.socket.on('error', reject)
    })
  }

  /**
   * Disconnect from network
   */
  disconnect(): Promise<void> {
    return new Promise((resolve) => {
      this.isConnected = false
      this.socket.close(() => {
        console.log(`[UDPNetworkClient] ${this.deviceId} disconnected`)
        resolve()
      })
    })
  }

  // NetworkSimulator interface implementation

  addDevice(deviceId: string): void {
    // Not needed for client
  }

  removeDevice(deviceId: string): void {
    // Not needed for client
  }

  sendEvent(sourceDevice: string, targetDevice: string, type: NetworkEvent['type'], payload: any): NetworkEvent {
    if (!this.isConnected) {
      this.messageQueue.push({ target: targetDevice, type, payload })
    } else {
      this.sendPacket(targetDevice, type, payload)
    }
    
    // Return a placeholder event
    return {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      sourceDevice,
      targetDevice,
      type,
      payload,
      status: 'sent'
    }
  }

  broadcastEvent(sourceDevice: string, type: NetworkEvent['type'], payload: any): NetworkEvent[] {
    if (!this.isConnected) {
      this.messageQueue.push({ target: 'broadcast', type, payload })
    } else {
      this.sendPacket('broadcast', type, payload)
    }
    
    // Return empty array - actual events will come through callbacks
    return []
  }

  tick(currentTime: number): void {
    // Not needed for client - network simulator handles timing
  }

  onNetworkEvent(callback: (event: NetworkEvent) => void): void {
    this.eventCallbacks.push(callback)
  }

  setDeviceOnline(deviceId: string, online: boolean): void {
    this.sendPacket('network', 'set_online', { deviceId, online })
  }

  setOnline(online: boolean): void {
    this.setDeviceOnline(this.deviceId, online)
  }

  trackOwnEvent(deviceId: string): void {
    // Tracking happens on the server
  }

  updateTotalEventCount(count: number): void {
    // Tracking happens on the server
  }

  getConfig(): NetworkConfig {
    // Default config - actual config is on server
    return {
      packetLossRate: 0,
      minLatency: 10,
      maxLatency: 100,
      jitter: 20
    }
  }

  updateConfig(config: Partial<NetworkConfig>): void {
    this.sendPacket('network', 'update_config', config)
  }

  getNetworkStats(): any {
    // Stats are on the server
    return {
      totalPackets: 0,
      deliveredPackets: 0,
      droppedPackets: 0
    }
  }

  getDeviceStats(deviceId: string): any {
    return {
      isOnline: true,
      messagesSent: 0,
      messagesReceived: 0
    }
  }

  getAllNetworkEvents(): NetworkEvent[] {
    return []
  }

  private setupSocket() {
    this.socket.on('message', (msg, rinfo) => {
      this.handlePacket(msg.toString())
    })

    this.socket.on('error', (err) => {
      console.error(`[UDPNetworkClient] ${this.deviceId} socket error:`, err)
    })
  }

  private handlePacket(message: string) {
    try {
      // Parse packet format: source:target:type:payload
      const firstColon = message.indexOf(':')
      const secondColon = message.indexOf(':', firstColon + 1)
      const thirdColon = message.indexOf(':', secondColon + 1)
      
      if (firstColon === -1 || secondColon === -1 || thirdColon === -1) {
        console.error(`[UDPNetworkClient] ${this.deviceId} invalid packet format`)
        return
      }
      
      const sourceDevice = message.substring(0, firstColon)
      const targetDevice = message.substring(firstColon + 1, secondColon)
      const messageType = message.substring(secondColon + 1, thirdColon)
      const payloadStr = message.substring(thirdColon + 1)
      
      // Only process messages for this device
      if (targetDevice !== this.deviceId) {
        return
      }
      
      // Handle registration confirmation
      if (sourceDevice === 'network' && messageType === 'registered') {
        this.emit('registered')
        return
      }
      
      // Parse payload
      let payload: any
      try {
        payload = JSON.parse(payloadStr)
      } catch {
        payload = payloadStr
      }
      
      // Create network event
      const event: NetworkEvent = {
        id: `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        sourceDevice,
        targetDevice: this.deviceId,
        type: messageType as NetworkEvent['type'],
        payload,
        status: 'delivered'
      }
      
      // Notify callbacks
      this.eventCallbacks.forEach(callback => callback(event))
      
    } catch (error) {
      console.error(`[UDPNetworkClient] ${this.deviceId} error handling packet:`, error)
    }
  }

  private sendPacket(targetDevice: string, messageType: string, payload: any) {
    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload)
    const packet = `${this.deviceId}:${targetDevice}:${messageType}:${payloadStr}`
    const buffer = Buffer.from(packet)
    
    this.socket.send(buffer, this.networkPort, this.networkAddress, (err) => {
      if (err) {
        console.error(`[UDPNetworkClient] ${this.deviceId} error sending packet:`, err)
      }
    })
  }

  private processMessageQueue() {
    while (this.messageQueue.length > 0) {
      const msg = this.messageQueue.shift()!
      this.sendPacket(msg.target, msg.type, msg.payload)
    }
  }
}