import express from 'express'
import cors from 'cors'
import dgram from 'dgram'
import { createMessageRoutes } from './routes/messages'
import { SyncManager } from './sync/SyncManager'
import { InMemoryStore } from './storage/InMemoryStore'
import { MessageGenerator } from './crypto/MessageGenerator'
import type { NetworkSimulator, NetworkEvent } from './network/NetworkSimulator'

/**
 * Direct P2P UDP Backend
 * 
 * This backend implements true peer-to-peer communication without any
 * intermediary network simulator service. Each backend:
 * 
 * 1. Binds to its own UDP port
 * 2. Knows the UDP endpoints of its peers (via PEER_ENDPOINTS env var)
 * 3. Sends UDP packets directly to peers
 * 4. Receives UDP packets directly from peers
 * 
 * This is how a real P2P application would work - direct communication
 * between devices over the network.
 */

interface PeerEndpoint {
  deviceId: string
  host: string
  port: number
}

class DirectUDPNetwork implements NetworkSimulator {
  private socket: dgram.Socket
  private deviceId: string
  private peers: Map<string, PeerEndpoint> = new Map()
  private eventHandlers: Array<(event: NetworkEvent) => void> = []
  private isOnline: boolean = true
  private stats = {
    packetsSent: 0,
    packetsReceived: 0,
    packetsDropped: 0
  }

  constructor(deviceId: string, udpPort: number) {
    this.deviceId = deviceId
    this.socket = dgram.createSocket('udp4')
    
    // Handle incoming packets
    this.socket.on('message', (msg, rinfo) => {
      if (!this.isOnline) {
        this.stats.packetsDropped++
        return
      }
      
      this.stats.packetsReceived++
      
      try {
        // Parse packet: source:target:type:payload
        const packet = msg.toString()
        const [source, target, type, ...payloadParts] = packet.split(':')
        const payload = JSON.parse(payloadParts.join(':'))
        
        console.log(`[DirectUDP] ${this.deviceId} received ${type} from ${source} (target: ${target})`)
        
        // Only process if we're the target or it's a broadcast
        if (target === this.deviceId || target === '*') {
          const event: NetworkEvent = {
            id: `${Date.now()}-${Math.random()}`,
            sourceDevice: source,
            targetDevice: target,
            type,
            payload,
            timestamp: Date.now(),
            status: 'delivered'
          }
          
          console.log(`[DirectUDP] ${this.deviceId} delivering event to ${this.eventHandlers.length} handlers`)
          
          // Notify all handlers
          this.eventHandlers.forEach(handler => handler(event))
        }
      } catch (err) {
        console.error(`[DirectUDP] Error parsing packet from ${rinfo.address}:${rinfo.port}:`, err)
        console.error(`[DirectUDP] Raw packet: ${msg.toString()}`)
      }
    })
    
    this.socket.on('error', (err) => {
      console.error(`[DirectUDP] Socket error:`, err)
    })
    
    // Bind to specified port
    this.socket.bind(udpPort, () => {
      console.log(`[DirectUDP] ${deviceId} listening on UDP port ${udpPort}`)
    })
  }

  addPeer(deviceId: string, host: string, port: number) {
    this.peers.set(deviceId, { deviceId, host, port })
    console.log(`[DirectUDP] Added peer ${deviceId} at ${host}:${port}`)
  }

  sendEvent(sourceDevice: string, targetDevice: string, type: string, payload: any): string {
    if (!this.isOnline) {
      this.stats.packetsDropped++
      return `dropped-${Date.now()}`
    }
    
    const peer = this.peers.get(targetDevice)
    if (!peer) {
      console.warn(`[DirectUDP] No peer found for ${targetDevice}`)
      return `no-peer-${Date.now()}`
    }
    
    const packet = `${sourceDevice}:${targetDevice}:${type}:${JSON.stringify(payload)}`
    const buffer = Buffer.from(packet)
    
    this.socket.send(buffer, peer.port, peer.host, (err) => {
      if (err) {
        console.error(`[DirectUDP] Error sending to ${targetDevice}:`, err)
        this.stats.packetsDropped++
      } else {
        this.stats.packetsSent++
      }
    })
    
    return `${Date.now()}-${Math.random()}`
  }

  broadcastEvent(sourceDevice: string, type: string, payload: any): string {
    if (!this.isOnline) {
      this.stats.packetsDropped += this.peers.size
      return `dropped-${Date.now()}`
    }
    
    const packet = `${sourceDevice}:*:${type}:${JSON.stringify(payload)}`
    const buffer = Buffer.from(packet)
    
    // Send to all peers
    this.peers.forEach(peer => {
      this.socket.send(buffer, peer.port, peer.host, (err) => {
        if (err) {
          console.error(`[DirectUDP] Error broadcasting to ${peer.deviceId}:`, err)
          this.stats.packetsDropped++
        } else {
          this.stats.packetsSent++
        }
      })
    })
    
    return `broadcast-${Date.now()}`
  }

  onNetworkEvent(handler: (event: NetworkEvent) => void): void {
    this.eventHandlers.push(handler)
  }

  getDevices(): string[] {
    return [this.deviceId, ...Array.from(this.peers.keys())]
  }

  addDevice(deviceId: string): void {
    // In direct mode, devices must be added with addPeer()
    console.log(`[DirectUDP] addDevice called for ${deviceId} - use addPeer() instead`)
  }

  removeDevice(deviceId: string): void {
    this.peers.delete(deviceId)
  }

  setOnline(online: boolean): void {
    this.isOnline = online
    console.log(`[DirectUDP] ${this.deviceId} is now ${online ? 'online' : 'offline'}`)
  }

  getConfig(): any {
    return {
      mode: 'direct-udp',
      deviceId: this.deviceId,
      peers: Array.from(this.peers.values()),
      isOnline: this.isOnline
    }
  }

  updateConfig(updates: any): void {
    if ('online' in updates) {
      this.setOnline(updates.online)
    }
  }

  getNetworkStats(): any {
    return this.stats
  }

  trackOwnEvent(deviceId: string): void {
    // Not needed for P2P - we're not tracking global event counts
  }

  updateTotalEventCount(count: number): void {
    // Not needed for P2P - we're not tracking global event counts
  }

  disconnect() {
    return new Promise<void>((resolve) => {
      this.socket.close(() => {
        console.log(`[DirectUDP] ${this.deviceId} socket closed`)
        resolve()
      })
    })
  }
}

// Server setup
const app = express()
const deviceId = process.env.DEVICE_ID || 'alice'
const port = parseInt(process.env.PORT || '3001')
const udpPort = parseInt(process.env.UDP_PORT || '8000')
const syncInterval = parseInt(process.env.SYNC_INTERVAL || '5000')

// Create direct UDP network
const networkClient = new DirectUDPNetwork(deviceId, udpPort)

// Parse peer endpoints from environment
if (process.env.PEER_ENDPOINTS) {
  const endpoints = process.env.PEER_ENDPOINTS.split(',')
  for (const endpoint of endpoints) {
    const [peerId, host, peerPort] = endpoint.split(':')
    networkClient.addPeer(peerId, host, parseInt(peerPort))
  }
}

// Initialize components
let syncManager: SyncManager | null = null
let messageGenerator: MessageGenerator | null = null
let store: InMemoryStore | null = null

async function initializeSync() {
  // Create store and generator
  store = new InMemoryStore(deviceId)
  messageGenerator = new MessageGenerator(deviceId)
  await messageGenerator.initialize()
  
  // Create message routes
  const routes = createMessageRoutes(store, messageGenerator)
  app.use('/api/messages', routes)
  app.use('/messages', routes)
  
  // Create sync manager
  syncManager = new SyncManager(
    { deviceId, syncInterval },
    store,
    networkClient,
    messageGenerator
  )
  
  // Start sync
  await syncManager.start()
  console.log(`[Server] Sync manager started for ${deviceId} with ${syncInterval}ms interval`)
}

// Middleware
app.use(cors())
app.use(express.json())

// Add device ID to all requests
app.use((req, res, next) => {
  (req as any).deviceId = deviceId
  next()
})

// Add sync manager to requests
app.use((req, res, next) => {
  if (syncManager !== null) {
    (req as any).syncManager = syncManager
  }
  (req as any).networkSimulator = networkClient
  next()
})

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    device: deviceId,
    timestamp: Date.now(),
    syncActive: syncManager !== null,
    networkMode: 'direct-udp',
    udpPort
  })
})

// Status endpoint
app.get('/status', async (req, res) => {
  if (!messageGenerator) {
    return res.status(503).json({ error: 'Service not ready' })
  }
  
  const keyManager = (messageGenerator as any).keyManager
  const trustedPeers = Array.from(keyManager.getTrustedPeers().keys())
  
  res.json({
    device: deviceId,
    trustedPeers,
    syncActive: syncManager !== null,
    publicKey: keyManager.exportPublicKeyBase64(),
    networkMode: 'direct-udp',
    udpPort
  })
})

// Database stats endpoint
app.get('/api/stats', async (req, res) => {
  if (!store) {
    return res.status(503).json({ error: 'Service not ready' })
  }
  
  const events = await store.getAllEvents()
  const messages = events.filter(e => e.type === 'message')
  const syncPercentage = syncManager ? syncManager.getSyncPercentage() : 0
  
  res.json({
    deviceId,
    eventCount: events.length,
    messageCount: messages.length,
    syncPercentage,
    isOnline: syncManager ? syncManager.isOnline() : false,
    timestamp: Date.now(),
    networkStats: networkClient.getNetworkStats()
  })
})

// Network configuration endpoint
app.get('/api/network-config', (req, res) => {
  const config = networkClient.getConfig()
  res.json(config)
})

// Update network configuration
app.post('/api/network-config', (req, res) => {
  const updates = req.body
  networkClient.updateConfig(updates)
  res.json({ success: true, config: networkClient.getConfig() })
})

// Set device online/offline
app.post('/api/device-status', (req, res) => {
  const { online } = req.body
  
  if (syncManager) {
    syncManager.setOnline(online)
  }
  
  // Also update network client
  networkClient.setOnline(online)
  
  res.json({ 
    success: true, 
    deviceId,
    online,
    timestamp: Date.now()
  })
})

// Clear messages endpoint
app.delete('/api/messages/clear', async (req, res) => {
  if (!store) {
    return res.status(503).json({ error: 'Service not ready' })
  }
  
  await store.clear()
  res.json({ success: true, cleared: true })
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log(`[Server] ${deviceId} received SIGTERM, shutting down...`)
  
  if (syncManager) {
    syncManager.stop()
  }
  
  await networkClient.disconnect()
  
  process.exit(0)
})

app.listen(port, async () => {
  console.log(`${deviceId} backend running on http://localhost:${port}`)
  console.log(`Direct UDP mode on port ${udpPort}`)
  console.log(`Peers: ${Array.from(networkClient.peers.keys()).join(', ')}`)
  
  // Initialize sync after a short delay
  setTimeout(() => {
    initializeSync().catch(console.error)
  }, 1000)
})

export { store, messageGenerator, syncManager }