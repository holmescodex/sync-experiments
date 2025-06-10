import express from 'express'
import cors from 'cors'
import dgram from 'dgram'
import { createMessageRoutes } from './routes/messages'
import { SyncManager } from './sync/SyncManager'
import { InMemoryStore } from './storage/InMemoryStore'
import { MessageGenerator } from './crypto/MessageGenerator'
import type { NetworkSimulator, NetworkEvent } from './network/NetworkSimulator'

const app = express()
const deviceId = process.env.DEVICE_ID || 'alice'
const port = process.env.PORT || (deviceId === 'alice' ? 3001 : 3002)

// P2P configuration
interface PeerEndpoint {
  deviceId: string
  host: string
  port: number
}

/**
 * DirectP2PNetwork - Real UDP communication between backends
 * No intermediary service needed - backends talk directly to each other
 */
class DirectP2PNetwork implements NetworkSimulator {
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
        
        console.log(`[P2P] ${this.deviceId} received ${type} from ${source} (target: ${target})`)
        
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
          
          console.log(`[P2P] ${this.deviceId} delivering event to ${this.eventHandlers.length} handlers`)
          
          // Notify all handlers
          this.eventHandlers.forEach(handler => handler(event))
        }
      } catch (err) {
        console.error(`[P2P] Error parsing packet from ${rinfo.address}:${rinfo.port}:`, err)
        console.error(`[P2P] Raw packet: ${msg.toString()}`)
      }
    })
    
    this.socket.on('error', (err) => {
      console.error(`[P2P] Socket error:`, err)
    })
    
    // Bind to specified port
    this.socket.bind(udpPort, () => {
      console.log(`[P2P] ${deviceId} listening on UDP port ${udpPort}`)
    })
  }

  addPeer(deviceId: string, host: string, port: number) {
    this.peers.set(deviceId, { deviceId, host, port })
    console.log(`[P2P] Added peer ${deviceId} at ${host}:${port}`)
  }

  sendEvent(sourceDevice: string, targetDevice: string, type: string, payload: any): string {
    if (!this.isOnline) {
      this.stats.packetsDropped++
      return `dropped-${Date.now()}`
    }
    
    const peer = this.peers.get(targetDevice)
    if (!peer) {
      console.warn(`[P2P] No peer found for ${targetDevice}`)
      return `no-peer-${Date.now()}`
    }
    
    const packet = `${sourceDevice}:${targetDevice}:${type}:${JSON.stringify(payload)}`
    const buffer = Buffer.from(packet)
    
    console.log(`[P2P] ${sourceDevice} sending ${type} to ${peer.deviceId} at ${peer.host}:${peer.port}`)
    
    this.socket.send(buffer, peer.port, peer.host, (err) => {
      if (err) {
        console.error(`[P2P] Error sending to ${targetDevice}:`, err)
        this.stats.packetsDropped++
      } else {
        this.stats.packetsSent++
        console.log(`[P2P] Successfully sent ${type} to ${targetDevice}`)
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
          console.error(`[P2P] Error broadcasting to ${peer.deviceId}:`, err)
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
    // In P2P mode, devices must be added with addPeer()
    console.log(`[P2P] addDevice called for ${deviceId} - use addPeer() with host:port instead`)
  }

  removeDevice(deviceId: string): void {
    this.peers.delete(deviceId)
  }

  setOnline(online: boolean): void {
    this.isOnline = online
    console.log(`[P2P] ${this.deviceId} is now ${online ? 'online' : 'offline'}`)
  }

  getConfig(): any {
    return {
      mode: 'direct-p2p',
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
        console.log(`[P2P] ${this.deviceId} socket closed`)
        resolve()
      })
    })
  }
}

// Get UDP port from environment or use defaults
const udpPort = parseInt(process.env.UDP_PORT || (deviceId === 'alice' ? '8001' : '8002'))

// Create P2P network
const networkSimulator = new DirectP2PNetwork(deviceId, udpPort)

// Parse peer endpoints from environment
if (process.env.PEER_ENDPOINTS) {
  const endpoints = process.env.PEER_ENDPOINTS.split(',')
  for (const endpoint of endpoints) {
    const [peerId, host, peerPort] = endpoint.split(':')
    networkSimulator.addPeer(peerId, host, parseInt(peerPort))
  }
} else {
  // Default configuration for development
  if (deviceId === 'alice') {
    networkSimulator.addPeer('bob', 'localhost', 8002)
  } else if (deviceId === 'bob') {
    networkSimulator.addPeer('alice', 'localhost', 8001)
  }
}

// Initialize store and message generator
let syncManager: SyncManager | null = null
let messageGenerator: MessageGenerator | null = null
let store: InMemoryStore | null = null

// Initialize sync after server starts
async function initializeSync() {
  // Create store and generator
  store = new InMemoryStore(deviceId)
  messageGenerator = new MessageGenerator(deviceId)
  await messageGenerator.initialize()
  
  // Create message routes with initialized store and generator
  const routes = createMessageRoutes(store, messageGenerator)
  app.use('/api/messages', routes)
  app.use('/messages', routes)
  
  // Create sync manager
  const syncInterval = parseInt(process.env.SYNC_INTERVAL || '5000')
  syncManager = new SyncManager(
    { deviceId, syncInterval },
    store,
    networkSimulator,
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

// Add sync manager to requests (only if initialized)
app.use((req, res, next) => {
  if (syncManager !== null) {
    (req as any).syncManager = syncManager
  }
  (req as any).networkSimulator = networkSimulator
  next()
})

// Routes will be set up in initializeSync()

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    device: deviceId,
    timestamp: Date.now(),
    syncActive: syncManager !== null
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
    publicKey: keyManager.exportPublicKeyBase64()
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
    timestamp: Date.now()
  })
})

// Network configuration endpoint
app.get('/api/network-config', (req, res) => {
  const config = networkSimulator.getConfig()
  res.json(config)
})

// Update network configuration
app.post('/api/network-config', (req, res) => {
  const updates = req.body
  networkSimulator.updateConfig(updates)
  res.json({ success: true, config: networkSimulator.getConfig() })
})

// Set device online/offline
app.post('/api/device-status', (req, res) => {
  const { online } = req.body
  
  if (syncManager) {
    syncManager.setOnline(online)
  }
  
  // Also notify network simulator
  networkSimulator.setOnline(online)
  
  res.json({ 
    success: true, 
    deviceId,
    online,
    timestamp: Date.now()
  })
})

// Add peer for P2P communication
app.post('/api/add-peer', (req, res) => {
  const { deviceId: peerId, address, port } = req.body
  
  if (!peerId || !address || !port) {
    return res.status(400).json({ error: 'deviceId, address, and port are required' })
  }
  
  networkSimulator.addPeer(peerId, address, port)
  
  res.json({
    success: true,
    peer: {
      deviceId: peerId,
      address,
      port
    },
    timestamp: Date.now()
  })
})

// Enable/disable device message generation
app.post('/api/devices/:deviceId/enabled', (req, res) => {
  const { deviceId: targetDevice } = req.params
  const { enabled } = req.body
  
  // Verify this is the correct device
  if (targetDevice !== deviceId) {
    return res.status(404).json({ error: 'Device not found' })
  }
  
  // Store the enabled state (we'll use this for auto-generation later)
  app.locals.deviceEnabled = enabled
  
  res.json({ 
    success: true, 
    enabled,
    deviceId: targetDevice,
    timestamp: Date.now()
  })
})

// Get device status including enabled state
app.get('/api/devices/:deviceId/status', (req, res) => {
  const { deviceId: targetDevice } = req.params
  
  if (targetDevice !== deviceId) {
    return res.status(404).json({ error: 'Device not found' })
  }
  
  const enabled = app.locals.deviceEnabled !== false // Default to true
  const messagesPerHour = app.locals.messagesPerHour || 30 // Default rate
  
  res.json({
    deviceId: targetDevice,
    enabled,
    messagesPerHour,
    timestamp: Date.now()
  })
})

// Get network stats from NetworkSimulatorService
app.get('/api/network-stats', async (req, res) => {
  try {
    // Fetch from NetworkSimulatorService HTTP endpoint
    const networkHttpPort = process.env.NETWORK_HTTP_PORT || '3004'
    const response = await fetch(`http://localhost:${networkHttpPort}/api/stats`)
    const stats = await response.json()
    res.json(stats)
  } catch (error) {
    res.status(503).json({ error: 'Could not fetch network stats' })
  }
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
  
  await networkSimulator.disconnect()
  
  process.exit(0)
})

app.listen(port, async () => {
  console.log(`${deviceId} backend running on http://localhost:${port}`)
  console.log(`P2P UDP on port ${udpPort}`)
  console.log(`Peers: ${Array.from(networkSimulator.peers.keys()).join(', ')}`)
  
  // Initialize sync after a short delay to ensure everything is ready
  setTimeout(() => {
    initializeSync().catch(console.error)
  }, 1000)
})

// Export for testing
export { store, messageGenerator, syncManager }