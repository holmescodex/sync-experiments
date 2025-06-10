import { useState, useEffect, useRef } from 'react'
import { SimulationEngine, type DeviceFrequency, type SimulationEvent } from './simulation/engine'
import { ChatInterface, type ChatInterfaceRef } from './components/ChatInterface'
import { EventLogWithControls } from './components/EventLogWithControls'
import { NetworkEventLog } from './components/NetworkEventLog'
import { HowItWorksArticle } from './components/HowItWorksArticle'
import { DevConsoleMonitor } from './components/DevConsoleMonitor'
import type { NetworkEvent, NetworkConfig } from './network/simulator'
import { BackendAdapter } from './api/BackendAdapter'
import { simulationEngineAPI } from './api/SimulationEngineAPI'
import { BackendNetworkAPI } from './api/BackendNetworkAPI'
import { BackendStatsAPI } from './api/BackendStatsAPI'
import { SimulationControlAPI } from './api/SimulationControlAPI'
import './App.css'

function App() {
  const [engine] = useState(() => new SimulationEngine())
  const [currentTime, setCurrentTime] = useState(0)
  const [isRunning, setIsRunning] = useState(true)
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const [globalMessagesPerHour, setGlobalMessagesPerHour] = useState(50)
  const [imageAttachmentPercentage, setImageAttachmentPercentage] = useState(30)
  const [frequencies, setFrequencies] = useState<DeviceFrequency[]>([
    { deviceId: 'alice', messagesPerHour: 30, enabled: true, isOnline: true },
    { deviceId: 'bob', messagesPerHour: 20, enabled: true, isOnline: true }
  ])
  const [upcomingEvents, setUpcomingEvents] = useState<SimulationEvent[]>([])
  const [executedEvents, setExecutedEvents] = useState<SimulationEvent[]>([])
  const [networkEvents, setNetworkEvents] = useState<NetworkEvent[]>([])
  const [syncStatus, setSyncStatus] = useState<Map<string, { isSynced: boolean, syncPercentage: number }>>(new Map())
  const [databasesInitialized, setDatabasesInitialized] = useState(false)
  const [backendAdapters, setBackendAdapters] = useState<Map<string, BackendAdapter>>(new Map())
  const [databaseStats, setDatabaseStats] = useState<Map<string, { eventCount: number, syncPercentage: number }>>(new Map())
  const [showIndicator, setShowIndicator] = useState(true)
  const [backendNetworkAPI] = useState(() => new BackendNetworkAPI())
  const [backendStatsAPIs] = useState(() => new Map<string, BackendStatsAPI>([
    ['alice', new BackendStatsAPI(import.meta.env.VITE_ALICE_BACKEND_URL || 'http://localhost:3001')],
    ['bob', new BackendStatsAPI(import.meta.env.VITE_BOB_BACKEND_URL || 'http://localhost:3002')]
  ]))
  const [simulationControlAPI] = useState(() => new SimulationControlAPI(import.meta.env.VITE_SIMULATION_CONTROL_URL || 'http://localhost:3005'))
  const [backendNetworkConfig, setBackendNetworkConfig] = useState<NetworkConfig>({ 
    packetLossRate: 0, 
    minLatency: 10, 
    maxLatency: 100, 
    jitter: 20 
  })
  const [backendNetworkStats, setBackendNetworkStats] = useState({ 
    total: 0, 
    delivered: 0, 
    dropped: 0, 
    deliveryRate: 0, 
    dropRate: 0 
  })
  
  const aliceRef = useRef<ChatInterfaceRef>(null)
  const bobRef = useRef<ChatInterfaceRef>(null)

  useEffect(() => {
    // Initialize backend adapters and simulation control
    const initBackendAdapters = async () => {
      const adapters = new Map<string, BackendAdapter>()
      
      // Try to connect to backend servers
      try {
        // Check if alice backend is available
        const aliceBackendUrl = import.meta.env.VITE_ALICE_BACKEND_URL || 'http://localhost:3001'
        const aliceResponse = await fetch(`${aliceBackendUrl}/api/health`).catch(() => null)
        if (aliceResponse?.ok) {
          console.log('[App] Alice backend detected at', aliceBackendUrl)
          adapters.set('alice', new BackendAdapter('alice', aliceBackendUrl))
        } else {
          console.log('[App] Alice backend not available at', aliceBackendUrl)
        }
        
        // Check if bob backend is available
        const bobBackendUrl = import.meta.env.VITE_BOB_BACKEND_URL || 'http://localhost:3002'
        const bobResponse = await fetch(`${bobBackendUrl}/api/health`).catch(() => null)
        if (bobResponse?.ok) {
          console.log('[App] Bob backend detected at', bobBackendUrl)
          adapters.set('bob', new BackendAdapter('bob', bobBackendUrl))
        } else {
          console.log('[App] Bob backend not available at', bobBackendUrl)
        }
      } catch (error) {
        // Better error handling with meaningful messages
        if (error instanceof Error) {
          console.warn('[App] Error initializing backend adapters:', error.message)
        } else {
          console.warn('[App] Error initializing backend adapters:', String(error))
        }
      }
      
      setBackendAdapters(adapters)
      console.log('[App] Backend adapters initialized:', Array.from(adapters.entries()).map(([id, adapter]) => `${id}: ${adapter.getBackendType()}`))
      
      // Initialize simulation control if available
      try {
        const simHealthy = await simulationControlAPI.health()
        if (simHealthy) {
          console.log('[App] Simulation control backend detected')
          
          // Load current configuration
          const config = await simulationControlAPI.getConfig()
          setGlobalMessagesPerHour(config.globalMessagesPerHour)
          setImageAttachmentPercentage(config.imageAttachmentPercentage)
          setSpeedMultiplier(config.simulationSpeed)
          setIsRunning(config.isRunning)
          
          // Update device states
          const updatedFrequencies = frequencies.map(freq => ({
            ...freq,
            enabled: config.enabledDevices.includes(freq.deviceId)
          }))
          setFrequencies(updatedFrequencies)
          
          console.log('[App] Loaded simulation config from backend:', config)
        } else {
          console.log('[App] Simulation control backend not available')
        }
      } catch (error) {
        console.warn('[App] Could not connect to simulation control backend:', error)
      }
    }
    
    // Initialize after a short delay to ensure backends are ready
    setTimeout(initBackendAdapters, 1000)
  }, [])

  useEffect(() => {
    // Initialize engine with global rate distributed across enabled devices
    const initializeEngine = async () => {
      const enabledDevices = frequencies.filter(f => f.enabled)
      const ratePerDevice = enabledDevices.length > 0 ? globalMessagesPerHour / enabledDevices.length : 0
      
      const updatedFrequencies = frequencies.map(freq => ({
        ...freq,
        messagesPerHour: freq.enabled ? ratePerDevice : 0
      }))
      
      await engine.setDeviceFrequencies(updatedFrequencies)
      engine.setImageAttachmentPercentage(imageAttachmentPercentage)
      setDatabasesInitialized(true)
    }
    
    initializeEngine()
    
    // Set up simulation tick interval
    const intervalId = setInterval(async () => {
      // Don't tick the engine - simulation runs in backend
      setCurrentTime(Date.now())
      setUpcomingEvents([]) // No upcoming events in frontend
      
      // Always fetch network events from backend
      const backendEvents = await backendNetworkAPI.getNetworkEvents(1000)
      setNetworkEvents(backendEvents)
      
      // Fetch messages from backends and convert to SimulationEvents
      const allEvents: SimulationEvent[] = []
      for (const [deviceId, adapter] of backendAdapters) {
        try {
          const messages = await adapter.getMessages()
          // Convert messages to SimulationEvents for the timeline
          messages.forEach(msg => {
            allEvents.push({
              type: 'message',
              deviceId: msg.author,
              simTime: msg.timestamp,
              executeTime: msg.timestamp,
              data: {
                content: msg.content,
                attachments: msg.attachments
              }
            })
          })
        } catch (err) {
          if (err instanceof Error) {
            console.error(`Failed to fetch messages for ${deviceId}:`, err.message)
          } else {
            console.error(`Failed to fetch messages for ${deviceId}:`, String(err))
          }
        }
      }
      
      // Sort by timestamp
      allEvents.sort((a, b) => a.simTime - b.simTime)
      setExecutedEvents(allEvents)
      
      // Fetch device stats from backends
      const syncStatusMap = new Map<string, { isSynced: boolean, syncPercentage: number }>()
      const dbStats = new Map<string, { eventCount: number, syncPercentage: number }>()
      
      for (const [deviceId, statsAPI] of backendStatsAPIs) {
        const stats = await statsAPI.getStats()
        if (stats) {
          syncStatusMap.set(deviceId, {
            isSynced: stats.syncPercentage === 100,
            syncPercentage: stats.syncPercentage
          })
          dbStats.set(deviceId, {
            eventCount: stats.eventCount,
            syncPercentage: stats.syncPercentage
          })
          
          // Update frequencies with actual backend online status
          setFrequencies(prev => prev.map(freq => 
            freq.deviceId === deviceId 
              ? { ...freq, isOnline: stats.isOnline }
              : freq
          ))
        }
      }
      
      setSyncStatus(syncStatusMap)
      setDatabaseStats(dbStats)
      
      // Fetch network config and stats from first backend
      const firstStatsAPI = backendStatsAPIs.get('alice')
      if (firstStatsAPI) {
        const config = await firstStatsAPI.getNetworkConfig()
        if (config) {
          setBackendNetworkConfig(config)
        }
        
        const networkStats = await firstStatsAPI.getNetworkStats()
        if (networkStats && networkStats.networkStats) {
          setBackendNetworkStats(networkStats.networkStats)
        }
      }
      
    }, 100) // 100ms real-time ticks

    return () => {
      clearInterval(intervalId)
    }
  }, [engine, frequencies, globalMessagesPerHour, backendAdapters])

  // Handle scroll to hide/show indicator
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY
      setShowIndicator(scrollPosition < 100)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handlePause = async () => {
    engine.pause()
    setIsRunning(false)
    
    // Pause simulation in backend
    try {
      await simulationControlAPI.pause()
      console.log('[App] Paused simulation control backend')
    } catch (error) {
      console.error('[App] Failed to pause simulation:', error)
    }
  }

  const handleResume = async () => {
    engine.resume()
    setIsRunning(true)
    
    // Resume simulation in backend
    try {
      await simulationControlAPI.start()
      console.log('[App] Started simulation control backend')
    } catch (error) {
      console.error('[App] Failed to start simulation:', error)
    }
  }

  const handleSetSpeed = async (speed: number) => {
    engine.setSpeed(speed)
    setSpeedMultiplier(speed)
    
    // Update speed in backend
    try {
      await simulationControlAPI.setSpeed(speed)
      console.log(`[App] Updated simulation speed to ${speed}x`)
    } catch (error) {
      console.error('[App] Failed to update simulation speed:', error)
    }
  }

  const handleReset = async () => {
    // Clear backend databases if connected
    for (const [deviceId, adapter] of backendAdapters) {
      if (adapter.getBackendType() === 'api') {
        try {
          // Clear backend database
          const backendUrl = deviceId === 'alice' 
            ? (import.meta.env.VITE_ALICE_BACKEND_URL || 'http://localhost:3001')
            : (import.meta.env.VITE_BOB_BACKEND_URL || 'http://localhost:3002')
          await fetch(`${backendUrl}/api/messages/clear`, { method: 'DELETE' })
          console.log(`[App] Cleared backend database for ${deviceId}`)
        } catch (error) {
          console.warn(`[App] Failed to clear backend for ${deviceId}:`, error)
        }
      }
    }
    
    // Reset the simulation engine
    engine.reset()
    
    // Clear local state
    setCurrentTime(0)
    setUpcomingEvents([])
    setExecutedEvents([])
    setNetworkEvents([])
    setSyncStatus(new Map())
    setDatabaseStats(new Map())
    
    // Reload to reinitialize everything cleanly
    window.location.reload()
  }

  const handleFrequencyUpdate = async (newFrequencies: DeviceFrequency[]) => {
    setFrequencies(newFrequencies)
    
    // Update device enable/disable states in simulation control backend
    for (const freq of newFrequencies) {
      try {
        await simulationControlAPI.setDeviceEnabled(freq.deviceId, freq.enabled)
        console.log(`[App] Updated ${freq.deviceId} enabled state to ${freq.enabled}`)
      } catch (error) {
        console.error(`[App] Failed to update ${freq.deviceId} enabled state:`, error)
      }
    }
  }

  const handleGlobalMessagesPerHourUpdate = async (rate: number) => {
    setGlobalMessagesPerHour(rate)
    
    // Update global rate in simulation control backend
    try {
      await simulationControlAPI.setGlobalMessageRate(rate)
      console.log(`[App] Updated global message rate to ${rate} msg/hr`)
    } catch (error) {
      console.error('[App] Failed to update global message rate:', error)
      // Show error to user
      if (error instanceof Error && error.message.includes('Maximum 1000 messages/hour')) {
        // Could show a toast or alert here
        setGlobalMessagesPerHour(1000) // Cap at maximum
      }
    }
  }

  const handleImagePercentageUpdate = async (percentage: number) => {
    setImageAttachmentPercentage(percentage)
    engine.setImageAttachmentPercentage(percentage) // Keep local engine in sync
    
    // Update attachment rate in simulation control backend
    try {
      await simulationControlAPI.setGlobalAttachmentRate(percentage)
      console.log(`[App] Updated global attachment rate to ${percentage}%`)
    } catch (error) {
      console.error('[App] Failed to update attachment rate:', error)
    }
  }

  const handleManualMessage = async (deviceId: string, content: string, attachments?: any[]) => {
    // Add manual message to simulation timeline with proper file attachments
    console.log(`[App] Manual message from ${deviceId}: "${content}"${attachments ? ` with ${attachments.length} attachments` : ''}`)
    
    // Convert UI attachments to the format expected by createMessageEvent
    let engineAttachments: any[] | undefined
    if (attachments && attachments.length > 0) {
      engineAttachments = attachments.map(att => ({
        fileId: att.id || `manual-${Date.now()}`,
        fileName: att.name,
        mimeType: att.mimeType,
        size: att.size,
        chunkCount: Math.ceil(att.size / 500) // Estimate chunk count
      }))
    }
    
    await engine.createMessageEvent(deviceId, content, undefined, engineAttachments)
    
    // Debug: Check database immediately after
    const db = engine.getDeviceDatabase(deviceId)
    if (db) {
      const events = await db.getAllEvents()
      console.log(`[App] ${deviceId}'s database now has ${events.length} events`)
    }
  }

  const handleNetworkConfigUpdate = async (config: any) => {
    // Update all backend network configs
    const promises = Array.from(backendStatsAPIs.values()).map(statsAPI => 
      statsAPI.updateNetworkConfig(config)
    )
    
    const results = await Promise.all(promises)
    if (results.some(r => !r)) {
      console.error('[App] Failed to update some backend network configs')
    }
  }

  const handleScrollToArticle = () => {
    const articleElement = document.getElementById('how-it-works')
    if (articleElement) {
      articleElement.scrollIntoView({ behavior: 'smooth' })
    }
  }

  const handleToggleOnline = async (deviceId: string, isOnline: boolean) => {
    console.log(`[App] Setting ${deviceId} to ${isOnline ? 'online' : 'offline'}`)
    
    // Update backend device status
    const statsAPI = backendStatsAPIs.get(deviceId)
    if (statsAPI) {
      const success = await statsAPI.setDeviceStatus(isOnline)
      if (!success) {
        console.error(`[App] Failed to set ${deviceId} online status`)
        return
      }
    }
    
    // Record to simulation engine
    simulationEngineAPI.recordEvent({
      type: 'device_status',
      device: deviceId,
      online: isOnline
    }).catch(err => {
      console.log('[App] Failed to record device status to simulation engine:', err)
    })
    
    // Update frequencies state
    setFrequencies(prev => prev.map(freq => 
      freq.deviceId === deviceId 
        ? { ...freq, isOnline }
        : freq
    ))
  }

  return (
    <>
      <div className="app" data-testid="simulation-app">
        <main className="app-layout-networked">
          {/* Left Column 1: Event Timeline & Controls */}
          <section className="timeline-section">
            <EventLogWithControls
              currentTime={currentTime}
              upcomingEvents={upcomingEvents}
              executedEvents={executedEvents}
              frequencies={frequencies}
              onUpdateFrequencies={handleFrequencyUpdate}
              isRunning={isRunning}
              speedMultiplier={speedMultiplier}
              globalMessagesPerHour={globalMessagesPerHour}
              onUpdateGlobalMessagesPerHour={handleGlobalMessagesPerHourUpdate}
              imageAttachmentPercentage={imageAttachmentPercentage}
              onUpdateImagePercentage={handleImagePercentageUpdate}
              onPause={handlePause}
              onResume={handleResume}
              onSetSpeed={handleSetSpeed}
              onReset={handleReset}
            />
          </section>
          
          {/* Left Column 2: Network Activity */}
          <section className="network-section">
            <NetworkEventLog
              networkEvents={networkEvents}
              networkConfig={backendNetworkConfig}
              networkStats={backendNetworkStats}
              onConfigUpdate={handleNetworkConfigUpdate}
            />
          </section>
          
          {/* Right: Chat */}
          <section className="simulation-section">
            <div className="chat-apps">
              <div className="section-header">
                <h3>Device Chat Interfaces</h3>
                <p className="section-description">
                  P2P messaging simulation. Messages from other devices appear via network delivery.
                </p>
              </div>
              <div className="chat-grid">
                <ChatInterface 
                  ref={aliceRef}
                  deviceId="alice" 
                  currentSimTime={currentTime}
                  syncStatus={syncStatus.get('alice')}
                  imageAttachmentPercentage={imageAttachmentPercentage}
                  onManualMessage={handleManualMessage}
                  backendAdapter={backendAdapters.get('alice')}
                  databaseStats={databaseStats.get('alice')}
                  isOnline={frequencies.find(f => f.deviceId === 'alice')?.isOnline ?? true}
                  onToggleOnline={handleToggleOnline}
                />
                <ChatInterface 
                  ref={bobRef}
                  deviceId="bob" 
                  currentSimTime={currentTime}
                  syncStatus={syncStatus.get('bob')}
                  imageAttachmentPercentage={imageAttachmentPercentage}
                  onManualMessage={handleManualMessage}
                  backendAdapter={backendAdapters.get('bob')}
                  databaseStats={databaseStats.get('bob')}
                  isOnline={frequencies.find(f => f.deviceId === 'bob')?.isOnline ?? true}
                  onToggleOnline={handleToggleOnline}
                />
              </div>
            </div>
          </section>
        </main>
        
        {/* Floating "How does this work?" indicator */}
        <button 
          className={`how-it-works-indicator ${!showIndicator ? 'hide' : ''}`}
          onClick={handleScrollToArticle}
        >
          <span>How does this work?</span>
          <span className="arrow-down">↓</span>
        </button>
      </div>
      
      {/* How It Works Article */}
      <div id="how-it-works">
        <HowItWorksArticle />
      </div>
      
      {/* Development Console Monitor */}
      <DevConsoleMonitor />
    </>
  )
}

export default App
