import express from 'express'
import cors from 'cors'
import { createMessageRoutes } from './routes/messages'
import { RemoteNetworkSimulator } from './network/RemoteNetworkSimulator'
import { UDPNetworkClient } from './network/UDPNetworkClient'
import { SyncManager } from './sync/SyncManager'
import { InMemoryStore } from './storage/InMemoryStore'
import { MessageGenerator } from './crypto/MessageGenerator'
import type { NetworkSimulator } from './network/NetworkSimulator'

const app = express()
const deviceId = process.env.DEVICE_ID || 'alice'
const port = process.env.PORT || (deviceId === 'alice' ? 3001 : 3002)
const networkMode = process.env.NETWORK_MODE || 'websocket'
const syncInterval = parseInt(process.env.SYNC_INTERVAL || '5000')

// Create appropriate network client
let networkClient: NetworkSimulator

if (networkMode === 'udp') {
  // UDP mode for direct P2P
  const udpPort = parseInt(process.env.NETWORK_UDP_PORT || '8000')
  const localUdpPort = parseInt(process.env.LOCAL_UDP_PORT || '0') // 0 = random
  
  console.log(`[Server] Starting in UDP mode - network port: ${udpPort}, local port: ${localUdpPort}`)
  networkClient = new UDPNetworkClient(deviceId, 'localhost', udpPort, localUdpPort)
} else {
  // WebSocket mode for simulator
  console.log('[Server] Starting in WebSocket mode')
  networkClient = new RemoteNetworkSimulator(deviceId)
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
  
  // Connect network client if UDP
  if (networkMode === 'udp' && networkClient instanceof UDPNetworkClient) {
    await networkClient.connect()
    console.log(`[Server] UDP client connected for ${deviceId}`)
  }
  
  // Create sync manager with configurable interval
  syncManager = new SyncManager(
    { deviceId, syncInterval },
    store,
    networkClient,
    messageGenerator
  )
  
  // If we have peer addresses (for direct P2P), add them
  if (process.env.PEER_ADDRESSES) {
    const peers = process.env.PEER_ADDRESSES.split(',')
    for (const peer of peers) {
      const [peerId, host, port] = peer.split(':')
      console.log(`[Server] Adding peer ${peerId} at ${host}:${port}`)
      // In direct mode, devices know about each other
      networkClient.addDevice(peerId)
    }
  }
  
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
    networkMode
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
    networkMode
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
  
  // Also notify network client
  networkClient.setOnline(online)
  
  res.json({ 
    success: true, 
    deviceId,
    online,
    timestamp: Date.now()
  })
})

// Get network stats from NetworkSimulatorService
app.get('/api/network-stats', async (req, res) => {
  try {
    // In UDP mode, stats are minimal
    if (networkMode === 'udp') {
      res.json({
        mode: 'udp',
        stats: networkClient.getNetworkStats()
      })
    } else {
      // WebSocket mode - fetch from service
      const networkHttpPort = process.env.NETWORK_HTTP_PORT || '3004'
      const response = await fetch(`http://localhost:${networkHttpPort}/api/stats`)
      const stats = await response.json()
      res.json(stats)
    }
  } catch (error) {
    res.status(503).json({ error: 'Could not fetch network stats' })
  }
})

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log(`[Server] ${deviceId} received SIGTERM, shutting down...`)
  
  if (syncManager) {
    syncManager.stop()
  }
  
  if (networkClient instanceof UDPNetworkClient) {
    await networkClient.disconnect()
  }
  
  process.exit(0)
})

app.listen(port, async () => {
  console.log(`${deviceId} backend running on http://localhost:${port}`)
  console.log(`Network mode: ${networkMode}`)
  
  // Initialize sync after a short delay to ensure everything is ready
  setTimeout(() => {
    initializeSync().catch(console.error)
  }, 1000)
})

// Export for testing
export { store, messageGenerator, syncManager }