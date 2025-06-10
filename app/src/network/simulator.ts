export interface NetworkEvent {
  id: string
  timestamp: number
  sourceDevice: string
  targetDevice: string
  type: 'message' | 'bloom_filter' | 'file_chunk'
  payload: any
  status: 'sent' | 'delivered' | 'dropped'
  latency?: number
}

export interface NetworkConfig {
  packetLossRate: number // 0.0 to 1.0 (0% to 100%)
  minLatency: number // milliseconds
  maxLatency: number // milliseconds
  jitter: number // latency variation
}

export interface DeviceNetworkState {
  deviceId: string
  isOnline: boolean
  receivedEventIds: Set<string>
  knownEventCount: number
  totalEventCount: number
  ownEventCount: number
}

export class NetworkSimulator {
  private config: NetworkConfig
  private networkEvents: NetworkEvent[] = []
  private devices: Map<string, DeviceNetworkState> = new Map()
  private pendingDeliveries: Array<{event: NetworkEvent, deliveryTime: number}> = []
  private eventCallbacks: ((event: NetworkEvent) => void)[] = []
  private nextEventId = 1
  private currentTime = 0

  constructor(config: NetworkConfig = {
    packetLossRate: 0.0,
    minLatency: 10,
    maxLatency: 100,
    jitter: 20
  }) {
    this.config = config
  }

  updateConfig(config: Partial<NetworkConfig>) {
    this.config = { ...this.config, ...config }
  }

  getConfig(): NetworkConfig {
    return { ...this.config }
  }

  addDevice(deviceId: string) {
    this.devices.set(deviceId, {
      deviceId,
      isOnline: true,
      receivedEventIds: new Set(),
      knownEventCount: 0,
      totalEventCount: 0,
      ownEventCount: 0
    })
  }

  removeDevice(deviceId: string) {
    this.devices.delete(deviceId)
  }

  setDeviceOnline(deviceId: string, online: boolean) {
    const device = this.devices.get(deviceId)
    if (device) {
      device.isOnline = online
    }
  }

  sendEvent(sourceDevice: string, targetDevice: string, type: NetworkEvent['type'], payload: any): NetworkEvent {
    const networkEvent: NetworkEvent = {
      id: `net-${this.nextEventId++}`,
      timestamp: this.currentTime,
      sourceDevice,
      targetDevice,
      type,
      payload,
      status: 'sent'
    }

    this.networkEvents.push(networkEvent)
    this.notifyEventCallbacks(networkEvent)

    // Check if packet should be dropped
    if (Math.random() < this.config.packetLossRate) {
      const droppedEvent: NetworkEvent = {
        ...networkEvent,
        status: 'dropped'
      }
      this.networkEvents.push(droppedEvent)
      this.notifyEventCallbacks(droppedEvent)
      return droppedEvent
    }

    // Calculate delivery time with latency and jitter
    const baseLatency = this.config.minLatency + 
      Math.random() * (this.config.maxLatency - this.config.minLatency)
    const jitter = (Math.random() - 0.5) * this.config.jitter
    const totalLatency = Math.max(0, baseLatency + jitter)
    
    networkEvent.latency = totalLatency
    const deliveryTime = this.currentTime + totalLatency

    // Schedule delivery
    this.pendingDeliveries.push({
      event: networkEvent,
      deliveryTime
    })

    // Sort by delivery time for efficient processing
    this.pendingDeliveries.sort((a, b) => a.deliveryTime - b.deliveryTime)

    return networkEvent
  }

  // Broadcast to all other devices
  broadcastEvent(sourceDevice: string, type: NetworkEvent['type'], payload: any): NetworkEvent[] {
    const events: NetworkEvent[] = []
    
    for (const [deviceId] of this.devices) {
      if (deviceId !== sourceDevice) {
        events.push(this.sendEvent(sourceDevice, deviceId, type, payload))
      }
    }
    
    return events
  }

  tick(currentTime: number) {
    this.currentTime = currentTime
    
    // Process pending deliveries
    while (this.pendingDeliveries.length > 0 && 
           this.pendingDeliveries[0].deliveryTime <= currentTime) {
      
      const delivery = this.pendingDeliveries.shift()!
      const { event } = delivery
      
      // Check if target device is online
      const targetDevice = this.devices.get(event.targetDevice)
      if (!targetDevice || !targetDevice.isOnline) {
        const droppedEvent: NetworkEvent = {
          ...event,
          status: 'dropped'
        }
        this.networkEvents.push(droppedEvent)
        this.notifyEventCallbacks(droppedEvent)
        continue
      }

      // Create a separate delivered event to avoid mutating the sent event
      const deliveredEvent: NetworkEvent = {
        ...event,
        status: 'delivered'
      }
      this.networkEvents.push(deliveredEvent)
      this.deliverEventToDevice(deliveredEvent)
      this.notifyEventCallbacks(deliveredEvent)
    }
  }

  private deliverEventToDevice(networkEvent: NetworkEvent) {
    const device = this.devices.get(networkEvent.targetDevice)
    if (!device) return

    // Only track actual message events with eventIds for sync status
    if (networkEvent.type === 'message' && networkEvent.payload.eventId) {
      const eventKey = `${networkEvent.sourceDevice}-${networkEvent.payload.eventId}`
      device.receivedEventIds.add(eventKey)
      device.knownEventCount = device.receivedEventIds.size
    }
  }

  // Track when a device generates its own event
  trackOwnEvent(deviceId: string) {
    const device = this.devices.get(deviceId)
    if (device) {
      device.ownEventCount++
    }
  }

  // Update total event count for sync calculation
  updateTotalEventCount(count: number) {
    for (const device of this.devices.values()) {
      device.totalEventCount = count
    }
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  getTotalEventCount(): number {
    return this.devices.size > 0 ? 
      Math.max(...Array.from(this.devices.values()).map(d => d.totalEventCount)) : 0
  }

  getDeviceSyncStatus(deviceId: string): { isSynced: boolean, syncPercentage: number } {
    const device = this.devices.get(deviceId)
    if (!device || device.totalEventCount === 0) {
      return { isSynced: true, syncPercentage: 100 }
    }

    // Sync percentage = (own events + received events) / total events
    // This represents "what percentage of the total conversation does this device have?"
    const eventsThisDeviceHas = device.ownEventCount + device.knownEventCount
    const syncPercentage = Math.round((eventsThisDeviceHas / device.totalEventCount) * 100)
    
    // Debug logging to understand the calculation
    console.log(`[DEBUG] ${deviceId} sync:`, {
      ownEventCount: device.ownEventCount,
      knownEventCount: device.knownEventCount,
      totalEventCount: device.totalEventCount,
      eventsThisDeviceHas,
      syncPercentage
    })
    
    // Device is synced if it has all events (own + all others)
    const expectedReceivedEvents = device.totalEventCount - device.ownEventCount
    const isSynced = device.knownEventCount >= expectedReceivedEvents
    
    return { isSynced, syncPercentage }
  }

  getAllDeviceSyncStatus(): Map<string, { isSynced: boolean, syncPercentage: number }> {
    const status = new Map()
    for (const [deviceId] of this.devices) {
      status.set(deviceId, this.getDeviceSyncStatus(deviceId))
    }
    return status
  }

  getNetworkEvents(limit?: number): NetworkEvent[] {
    const events = [...this.networkEvents].reverse() // Most recent first
    return limit ? events.slice(0, limit) : events
  }

  getNetworkStats() {
    // Group events by ID to get unique events and their final status
    const eventsByID = new Map<string, NetworkEvent>()
    
    // Take the latest status for each event ID
    for (const event of this.networkEvents) {
      const existingEvent = eventsByID.get(event.id)
      if (!existingEvent || event.timestamp >= existingEvent.timestamp) {
        eventsByID.set(event.id, event)
      }
    }
    
    const uniqueEvents = Array.from(eventsByID.values())
    const total = uniqueEvents.length
    const sent = uniqueEvents.filter(e => e.status === 'sent').length
    const delivered = uniqueEvents.filter(e => e.status === 'delivered').length
    const dropped = uniqueEvents.filter(e => e.status === 'dropped').length
    
    return {
      total,
      sent,
      delivered,
      dropped,
      deliveryRate: total > 0 ? delivered / total : 0,
      dropRate: total > 0 ? dropped / total : 0
    }
  }

  onNetworkEvent(callback: (event: NetworkEvent) => void) {
    this.eventCallbacks.push(callback)
  }

  private notifyEventCallbacks(event: NetworkEvent) {
    this.eventCallbacks.forEach(callback => callback(event))
  }

  reset() {
    this.networkEvents = []
    this.pendingDeliveries = []
    this.devices.clear()
    this.nextEventId = 1
    this.currentTime = 0
  }
}