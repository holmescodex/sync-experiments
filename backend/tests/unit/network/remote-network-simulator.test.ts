import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { RemoteNetworkSimulator } from '../../network/RemoteNetworkSimulator'
import { WebSocketServer } from 'ws'
import type { NetworkEvent } from '../../network/NetworkSimulator'

describe('RemoteNetworkSimulator WebSocket Communication', () => {
  let wsServer: WebSocketServer
  let simulator: RemoteNetworkSimulator
  let serverPort: number
  let connectedClients: any[] = []

  beforeEach(async () => {
    // Start a test WebSocket server
    serverPort = 9001 + Math.floor(Math.random() * 1000) // Random port to avoid conflicts
    wsServer = new WebSocketServer({ port: serverPort })
    
    // Track connected clients
    wsServer.on('connection', (ws) => {
      connectedClients.push(ws)
      
      // Echo back registration confirmation
      ws.on('message', (data) => {
        const message = JSON.parse(data.toString())
        if (message.type === 'register') {
          ws.send(JSON.stringify({ type: 'registered' }))
        }
      })
    })
    
    // Wait for server to be ready
    await new Promise(resolve => {
      wsServer.on('listening', resolve)
    })
    
    // Create simulator connected to test server
    simulator = new RemoteNetworkSimulator('alice', `ws://localhost:${serverPort}`)
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 100))
  })

  afterEach(async () => {
    // Clean up
    connectedClients = []
    await new Promise<void>(resolve => {
      wsServer.close(() => resolve())
    })
  })

  it('should connect and register device', async () => {
    expect(connectedClients).toHaveLength(1)
    expect((simulator as any).connected).toBe(true)
  })

  it('should broadcast messages when connected', async () => {
    // Set up message capture
    const receivedMessages: any[] = []
    connectedClients[0].on('message', (data: any) => {
      receivedMessages.push(JSON.parse(data.toString()))
    })
    
    // Broadcast a message
    simulator.broadcastEvent('alice', 'message', {
      event_id: 'test-123',
      content: 'Hello'
    })
    
    // Wait for message
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Should have received broadcast message
    const broadcast = receivedMessages.find(m => m.type === 'broadcast')
    expect(broadcast).toBeDefined()
    expect(broadcast.from).toBe('alice')
    expect(broadcast.eventType).toBe('message')
    expect(broadcast.payload.event_id).toBe('test-123')
  })

  it('should handle incoming network events', async () => {
    const eventCallback = vi.fn()
    simulator.onNetworkEvent(eventCallback)
    
    // Send a network event from server
    const networkEvent: NetworkEvent = {
      id: 'event-123',
      timestamp: Date.now(),
      sourceDevice: 'bob',
      targetDevice: 'alice',
      type: 'message',
      status: 'delivered',
      payload: { content: 'Test' }
    }
    
    connectedClients[0].send(JSON.stringify({
      type: 'network_event',
      event: networkEvent
    }))
    
    // Wait for processing
    await new Promise(resolve => setTimeout(resolve, 50))
    
    // Callback should be called
    expect(eventCallback).toHaveBeenCalledWith(networkEvent)
  })

  it('should handle disconnection and warn about dropped messages', async () => {
    const warnSpy = vi.spyOn(console, 'warn')
    
    // Close the connection
    connectedClients[0].close()
    
    // Wait for disconnection
    await new Promise(resolve => setTimeout(resolve, 100))
    
    // Try to send a message
    simulator.broadcastEvent('alice', 'message', { test: true })
    
    // Should warn about dropped message
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not connected, dropping message')
    )
    
    warnSpy.mockRestore()
  })

  it('should attempt reconnection after disconnect', async () => {
    // Close the connection
    connectedClients[0].close()
    connectedClients = []
    
    // Wait for reconnection attempt
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    // Should have reconnected
    expect(connectedClients).toHaveLength(1)
    expect((simulator as any).connected).toBe(true)
  })
})