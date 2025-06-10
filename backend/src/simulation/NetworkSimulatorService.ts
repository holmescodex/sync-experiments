import { WebSocketServer, WebSocket } from 'ws'
import { NetworkSimulator, NetworkEvent } from '../network/NetworkSimulator'
import { TimeController } from './TimeController'
import express from 'express'
import cors from 'cors'
import http from 'http'

interface ClientConnection {
  deviceId: string
  ws: WebSocket
}

/**
 * NetworkSimulatorService provides a centralized network simulator
 * that backend instances connect to via WebSocket
 */
export class NetworkSimulatorService {
  private wss: WebSocketServer
  private networkSimulator: NetworkSimulator
  private timeController: TimeController
  private clients: Map<string, ClientConnection> = new Map()
  private port: number
  private httpPort: number
  private recentEvents: NetworkEvent[] = []
  private maxEvents: number = 1000
  private app: express.Application
  private httpServer: http.Server | null = null
  
  constructor(port: number = 3003, httpPort: number = 3004) {
    this.port = port
    this.httpPort = httpPort
    this.networkSimulator = new NetworkSimulator()
    this.timeController = new TimeController()
    
    // Create WebSocket server
    this.wss = new WebSocketServer({ port })
    
    // Create HTTP server for REST API
    this.app = express()
    this.app.use(cors())
    this.setupHttpEndpoints()
    
    console.log(`[NetworkSimulatorService] Starting WebSocket on port ${port}, HTTP on port ${httpPort}`)
    
    // Handle connections
    this.wss.on('connection', (ws) => {
      console.log('[NetworkSimulatorService] New connection')
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(ws, message)
        } catch (error) {
          console.error('[NetworkSimulatorService] Invalid message:', error)
        }
      })
      
      ws.on('close', () => {
        // Remove client on disconnect
        for (const [deviceId, client] of this.clients) {
          if (client.ws === ws) {
            console.log(`[NetworkSimulatorService] Device ${deviceId} disconnected`)
            this.clients.delete(deviceId)
            break
          }
        }
      })
    })
    
    // Set up network event forwarding
    this.networkSimulator.onNetworkEvent((event) => {
      if (event.status === 'delivered') {
        this.forwardEventToDevice(event)
      }
    })
    
    // Start time controller
    this.timeController.start()
    
    // Tick the network simulator periodically
    setInterval(() => {
      const currentTime = Date.now() // Use real time for now
      this.networkSimulator.tick(currentTime)
    }, 100)
    
    // Start HTTP server
    this.httpServer = this.app.listen(this.httpPort)
  }
  
  private setupHttpEndpoints() {
    // Get recent network events
    this.app.get('/api/network-events', (req, res) => {
      const limit = parseInt(req.query.limit as string) || 100
      res.json({
        events: this.getRecentEvents(limit),
        total: this.recentEvents.length
      })
    })
    
    // Get network stats
    this.app.get('/api/stats', (req, res) => {
      res.json(this.getStats())
    })
    
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'NetworkSimulatorService' })
    })
  }
  
  private handleMessage(ws: WebSocket, message: any) {
    switch (message.type) {
      case 'register':
        this.handleRegister(ws, message)
        break
      case 'send':
        this.handleSend(message)
        break
      case 'broadcast':
        this.handleBroadcast(message)
        break
      case 'set_online':
        this.handleSetOnline(message)
        break
      case 'update_config':
        this.handleUpdateConfig(message)
        break
      default:
        console.warn('[NetworkSimulatorService] Unknown message type:', message.type)
    }
  }
  
  private handleRegister(ws: WebSocket, message: any) {
    const { deviceId, publicKey } = message
    
    // Store client connection
    this.clients.set(deviceId, { deviceId, ws })
    
    // Add device to network simulator
    this.networkSimulator.addDevice(deviceId)
    
    console.log(`[NetworkSimulatorService] Registered device: ${deviceId}`)
    
    // Collect all other devices' public keys
    const otherDevices: { deviceId: string; publicKey: string }[] = []
    for (const [otherDeviceId, client] of this.clients) {
      if (otherDeviceId !== deviceId) {
        // In a real implementation, we'd store public keys
        // For now, we'll send a placeholder
        otherDevices.push({ 
          deviceId: otherDeviceId, 
          publicKey: 'placeholder-will-be-sent-separately' 
        })
      }
    }
    
    // Send confirmation with peer information
    ws.send(JSON.stringify({
      type: 'registered',
      deviceId,
      timestamp: Date.now(),
      peers: otherDevices
    }))
    
    // If we have a public key, broadcast it to all other devices
    if (publicKey) {
      for (const [otherDeviceId, client] of this.clients) {
        if (otherDeviceId !== deviceId && client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(JSON.stringify({
            type: 'peer_key',
            deviceId: deviceId,
            publicKey: publicKey
          }))
        }
      }
    }
  }
  
  private handleSend(message: any) {
    const { from, to, eventType, payload } = message
    
    // Send through network simulator
    const event = this.networkSimulator.sendEvent(from, to, eventType, payload)
    
    // Store the event
    this.storeEvent(event)
    
    console.log(`[NetworkSimulatorService] Sending ${eventType} from ${from} to ${to}`)
  }
  
  private handleBroadcast(message: any) {
    const { from, eventType, payload } = message
    
    // Broadcast through network simulator
    const events = this.networkSimulator.broadcastEvent(from, eventType, payload)
    
    // Store all generated events
    events.forEach(event => this.storeEvent(event))
    
    console.log(`[NetworkSimulatorService] Broadcasting ${eventType} from ${from} to ${events.length} devices`)
  }
  
  private handleSetOnline(message: any) {
    const { deviceId, online } = message
    
    this.networkSimulator.setDeviceOnline(deviceId, online)
    
    console.log(`[NetworkSimulatorService] Device ${deviceId} is now ${online ? 'online' : 'offline'}`)
  }
  
  private handleUpdateConfig(message: any) {
    const { config } = message
    
    if (config) {
      this.networkSimulator.updateConfig(config)
      console.log(`[NetworkSimulatorService] Updated network config:`, config)
    }
  }
  
  private forwardEventToDevice(event: NetworkEvent) {
    const client = this.clients.get(event.targetDevice)
    
    if (client && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify({
        type: 'network_event',
        event
      }))
    }
  }
  
  private storeEvent(event: NetworkEvent) {
    this.recentEvents.push(event)
    
    // Keep only the most recent events
    if (this.recentEvents.length > this.maxEvents) {
      this.recentEvents.shift()
    }
  }
  
  getRecentEvents(limit: number = 100): NetworkEvent[] {
    return this.recentEvents.slice(-limit)
  }
  
  getStats() {
    return {
      clients: Array.from(this.clients.keys()),
      networkStats: this.networkSimulator.getNetworkStats(),
      timeState: this.timeController.getState(),
      recentEventsCount: this.recentEvents.length
    }
  }
  
  close() {
    this.wss.close()
    this.timeController.stop()
    if (this.httpServer) {
      this.httpServer.close()
    }
  }
}

// Start the service if run directly
if (require.main === module) {
  const service = new NetworkSimulatorService()
  
  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n[NetworkSimulatorService] Shutting down...')
    service.close()
    process.exit(0)
  })
}