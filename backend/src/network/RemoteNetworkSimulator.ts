import { WebSocket } from 'ws'
import { NetworkEvent, NetworkConfig } from './NetworkSimulator'
import { EventEmitter } from 'events'

/**
 * RemoteNetworkSimulator connects to a centralized NetworkSimulatorService
 * via WebSocket, providing the same interface as NetworkSimulator
 */
export class RemoteNetworkSimulator extends EventEmitter {
  private ws: WebSocket | null = null
  private deviceId: string
  private serviceUrl: string
  private connected: boolean = false
  private reconnectTimer?: NodeJS.Timeout
  private eventCallbacks: ((event: NetworkEvent) => void)[] = []
  private config: NetworkConfig = {
    packetLossRate: 0.0,
    minLatency: 10,
    maxLatency: 100,
    jitter: 20
  }
  private online: boolean = true
  
  constructor(deviceId: string, serviceUrl?: string) {
    super()
    this.deviceId = deviceId
    
    // Use environment variable or provided URL or default
    this.serviceUrl = serviceUrl || 
      (process.env.NETWORK_SIMULATOR_PORT ? `ws://localhost:${process.env.NETWORK_SIMULATOR_PORT}` : 'ws://localhost:3003')
    
    this.connect()
  }
  
  private connect() {
    console.log(`[RemoteNetworkSimulator] ${this.deviceId} connecting to ${this.serviceUrl}`)
    
    this.ws = new WebSocket(this.serviceUrl)
    
    this.ws.on('open', () => {
      console.log(`[RemoteNetworkSimulator] ${this.deviceId} connected`)
      this.connected = true
      
      // Register device
      this.send({
        type: 'register',
        deviceId: this.deviceId
      })
    })
    
    this.ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        this.handleMessage(message)
      } catch (error) {
        console.error(`[RemoteNetworkSimulator] ${this.deviceId} invalid message:`, error)
      }
    })
    
    this.ws.on('close', () => {
      console.log(`[RemoteNetworkSimulator] ${this.deviceId} disconnected`)
      this.connected = false
      
      // Attempt reconnection after 1 second
      this.reconnectTimer = setTimeout(() => {
        this.connect()
      }, 1000)
    })
    
    this.ws.on('error', (error) => {
      console.error(`[RemoteNetworkSimulator] ${this.deviceId} error:`, error)
    })
  }
  
  private handleMessage(message: any) {
    switch (message.type) {
      case 'registered':
        console.log(`[RemoteNetworkSimulator] ${this.deviceId} registration confirmed`)
        break
      case 'network_event':
        this.handleNetworkEvent(message.event)
        break
      default:
        console.warn(`[RemoteNetworkSimulator] ${this.deviceId} unknown message type:`, message.type)
    }
  }
  
  private handleNetworkEvent(event: NetworkEvent) {
    // Notify all callbacks
    this.eventCallbacks.forEach(callback => callback(event))
  }
  
  private send(message: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    } else {
      console.warn(`[RemoteNetworkSimulator] ${this.deviceId} not connected, dropping message`)
    }
  }
  
  // NetworkSimulator interface methods
  
  addDevice(deviceId: string) {
    // Device registration happens automatically on connect
  }
  
  sendEvent(sourceDevice: string, targetDevice: string, type: NetworkEvent['type'], payload: any): NetworkEvent {
    this.send({
      type: 'send',
      from: sourceDevice,
      to: targetDevice,
      eventType: type,
      payload
    })
    
    // Return a placeholder event
    return {
      id: `pending-${Date.now()}`,
      timestamp: Date.now(),
      sourceDevice,
      targetDevice,
      type,
      payload,
      status: 'sent'
    }
  }
  
  broadcastEvent(sourceDevice: string, type: NetworkEvent['type'], payload: any): NetworkEvent[] {
    this.send({
      type: 'broadcast',
      from: sourceDevice,
      eventType: type,
      payload
    })
    
    // Return empty array - actual events will come through callbacks
    return []
  }
  
  setDeviceOnline(deviceId: string, online: boolean) {
    this.send({
      type: 'set_online',
      deviceId,
      online
    })
  }
  
  setOnline(online: boolean) {
    this.online = online
    this.setDeviceOnline(this.deviceId, online)
  }
  
  onNetworkEvent(callback: (event: NetworkEvent) => void) {
    this.eventCallbacks.push(callback)
  }
  
  // These methods are stubs for compatibility
  tick(currentTime: number) {
    // Ticking happens on the server
  }
  
  trackOwnEvent(deviceId: string) {
    // Tracking happens on the server
  }
  
  updateTotalEventCount(count: number) {
    // Tracking happens on the server
  }
  
  getConfig(): NetworkConfig {
    return this.config
  }
  
  updateConfig(config: Partial<NetworkConfig>) {
    this.config = { ...this.config, ...config }
    // Send update to server
    this.send({
      type: 'update_config',
      config: this.config
    })
  }
  
  getNetworkEvents(limit?: number): NetworkEvent[] {
    // Would need to fetch from server
    return []
  }
  
  getNetworkStats() {
    // Would need to fetch from server
    return {
      total: 0,
      sent: 0,
      delivered: 0,
      dropped: 0,
      deliveryRate: 0,
      dropRate: 0
    }
  }
  
  getDeviceSyncStatus(deviceId: string) {
    return { isSynced: false, syncPercentage: 0 }
  }
  
  getAllDeviceSyncStatus() {
    return new Map()
  }
  
  reset() {
    // Would need to send to server
  }
  
  close() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    if (this.ws) {
      this.ws.close()
    }
  }
}