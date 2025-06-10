import { createSocket, Socket } from 'dgram'
import { EventEmitter } from 'events'
import { TimeController } from '../simulation/TimeController'

/**
 * UDP Packet Format:
 * [sourceDevice]:[targetDevice]:[messageType]:[payload]
 * 
 * Example: "alice:bob:message:{"event_id":"123","encrypted":[...]}"
 */

interface PendingPacket {
  data: Buffer
  sourceAddress: string
  sourcePort: number
  targetDevice: string
  deliveryTime: number
}

interface NetworkConfig {
  packetLossRate: number  // 0.0 - 1.0
  minLatency: number      // ms
  maxLatency: number      // ms
  jitter: number          // ms variance
}

interface DeviceInfo {
  deviceId: string
  address: string
  port: number
  isOnline: boolean
  lastSeen: number
}

export class UDPNetworkSimulator extends EventEmitter {
  private socket: Socket
  private port: number
  private devices: Map<string, DeviceInfo> = new Map()
  private pendingPackets: PendingPacket[] = []
  private config: NetworkConfig
  private timeController?: TimeController
  private stats = {
    packetsReceived: 0,
    packetsDelivered: 0,
    packetsDropped: 0
  }

  constructor(port: number = 8000, config?: Partial<NetworkConfig>) {
    super()
    this.port = port
    this.config = {
      packetLossRate: 0,
      minLatency: 10,
      maxLatency: 100,
      jitter: 20,
      ...config
    }
    this.socket = createSocket('udp4')
    this.setupSocket()
  }

  /**
   * Set time controller for time-aware packet delivery
   */
  setTimeController(timeController: TimeController) {
    this.timeController = timeController
    
    // Register for time ticks
    timeController.addListener({
      onTimeTick: (event) => {
        this.processPacketQueue(event.simulationTime)
      }
    })
  }

  /**
   * Start the UDP server
   */
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket.bind(this.port, () => {
        console.log(`[UDPNetworkSimulator] Listening on UDP port ${this.port}`)
        resolve()
      })
      
      this.socket.on('error', reject)
    })
  }

  /**
   * Stop the UDP server
   */
  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.socket.close(() => {
        console.log('[UDPNetworkSimulator] Stopped')
        resolve()
      })
    })
  }

  /**
   * Update network configuration
   */
  updateConfig(config: Partial<NetworkConfig>) {
    this.config = { ...this.config, ...config }
  }

  /**
   * Get network statistics
   */
  getStats() {
    const deliveryRate = this.stats.packetsReceived > 0 
      ? this.stats.packetsDelivered / this.stats.packetsReceived 
      : 0

    return {
      ...this.stats,
      deliveryRate,
      devices: Array.from(this.devices.values()),
      pendingPackets: this.pendingPackets.length,
      config: this.config
    }
  }

  private setupSocket() {
    this.socket.on('message', (msg, rinfo) => {
      this.handlePacket(msg, rinfo.address, rinfo.port)
    })

    this.socket.on('error', (err) => {
      console.error('[UDPNetworkSimulator] Socket error:', err)
    })
  }

  private handlePacket(data: Buffer, address: string, port: number) {
    this.stats.packetsReceived++
    
    try {
      // Parse packet format: source:target:type:payload
      const message = data.toString()
      const firstColon = message.indexOf(':')
      const secondColon = message.indexOf(':', firstColon + 1)
      const thirdColon = message.indexOf(':', secondColon + 1)
      
      if (firstColon === -1 || secondColon === -1 || thirdColon === -1) {
        console.error('[UDPNetworkSimulator] Invalid packet format')
        return
      }
      
      const sourceDevice = message.substring(0, firstColon)
      const targetDevice = message.substring(firstColon + 1, secondColon)
      const messageType = message.substring(secondColon + 1, thirdColon)
      const payload = message.substring(thirdColon + 1)
      
      // Register/update device info
      this.registerDevice(sourceDevice, address, port)
      
      // Handle registration messages
      if (messageType === 'register') {
        console.log(`[UDPNetworkSimulator] Device ${sourceDevice} registered from ${address}:${port}`)
        // Send acknowledgment
        const ack = Buffer.from(`network:${sourceDevice}:registered:{}`)
        this.socket.send(ack, port, address)
        return
      }
      
      // Handle broadcast
      if (targetDevice === 'broadcast') {
        // Send to all other devices
        for (const [deviceId, info] of this.devices) {
          if (deviceId !== sourceDevice && info.isOnline) {
            // Create new packet with correct source:target for each recipient
            const newPacket = Buffer.from(`${sourceDevice}:${deviceId}:${messageType}:${payload}`)
            this.queuePacket(newPacket, address, port, deviceId)
          }
        }
      } else {
        // Send to specific device
        this.queuePacket(data, address, port, targetDevice)
      }
      
    } catch (error) {
      console.error('[UDPNetworkSimulator] Error handling packet:', error)
    }
  }

  private registerDevice(deviceId: string, address: string, port: number) {
    const existing = this.devices.get(deviceId)
    if (existing) {
      existing.address = address
      existing.port = port
      existing.lastSeen = Date.now()
    } else {
      this.devices.set(deviceId, {
        deviceId,
        address,
        port,
        isOnline: true,
        lastSeen: Date.now()
      })
    }
  }

  private queuePacket(data: Buffer, sourceAddress: string, sourcePort: number, targetDevice: string) {
    // Check if should drop packet
    if (Math.random() < this.config.packetLossRate) {
      this.stats.packetsDropped++
      console.log(`[UDPNetworkSimulator] Dropped packet to ${targetDevice} (simulated loss)`)
      return
    }
    
    // Calculate delivery time
    const baseLatency = this.config.minLatency + 
      Math.random() * (this.config.maxLatency - this.config.minLatency)
    const jitter = (Math.random() - 0.5) * 2 * this.config.jitter
    const totalLatency = Math.max(0, baseLatency + jitter)
    
    const currentTime = this.timeController?.getCurrentTime() || Date.now()
    const deliveryTime = currentTime + totalLatency
    
    // Queue packet for delivery
    this.pendingPackets.push({
      data,
      sourceAddress,
      sourcePort,
      targetDevice,
      deliveryTime
    })
    
    // Sort by delivery time
    this.pendingPackets.sort((a, b) => a.deliveryTime - b.deliveryTime)
    
    // If no time controller, deliver immediately after delay
    if (!this.timeController) {
      setTimeout(() => {
        this.processPacketQueue(Date.now())
      }, totalLatency)
    }
  }

  private processPacketQueue(currentTime: number) {
    // Deliver all packets whose time has come
    while (this.pendingPackets.length > 0 && 
           this.pendingPackets[0].deliveryTime <= currentTime) {
      
      const packet = this.pendingPackets.shift()!
      this.deliverPacket(packet)
    }
  }

  private deliverPacket(packet: PendingPacket) {
    const targetInfo = this.devices.get(packet.targetDevice)
    
    if (!targetInfo || !targetInfo.isOnline) {
      console.log(`[UDPNetworkSimulator] Device ${packet.targetDevice} not available`)
      this.stats.packetsDropped++
      return
    }
    
    // Send packet to target device
    this.socket.send(packet.data, targetInfo.port, targetInfo.address, (err) => {
      if (err) {
        console.error(`[UDPNetworkSimulator] Error sending to ${packet.targetDevice}:`, err)
        this.stats.packetsDropped++
      } else {
        this.stats.packetsDelivered++
      }
    })
  }

  /**
   * Set device online/offline status
   */
  setDeviceOnline(deviceId: string, online: boolean) {
    const device = this.devices.get(deviceId)
    if (device) {
      device.isOnline = online
      console.log(`[UDPNetworkSimulator] Device ${deviceId} is now ${online ? 'online' : 'offline'}`)
    }
  }
}