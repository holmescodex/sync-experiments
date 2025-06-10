import { useState, useEffect, useRef } from 'react'
import { SimulationEngine, type DeviceFrequency, type SimulationEvent } from './simulation/engine'
import { ChatInterface, type ChatInterfaceRef } from './components/ChatInterface'
import { EventLogWithControls } from './components/EventLogWithControls'
import { NetworkEventLog } from './components/NetworkEventLog'
import { HowItWorksArticle } from './components/HowItWorksArticle'
import { DevConsoleMonitor } from './components/DevConsoleMonitor'
import type { NetworkEvent } from './network/simulator'
import { createChatAPI, type ChatAPI } from './api/ChatAPI'
import { BackendAdapter } from './api/BackendAdapter'
import { simulationEngineAPI } from './api/SimulationEngineAPI'
import { BackendNetworkAPI } from './api/BackendNetworkAPI'
import { BackendStatsAPI } from './api/BackendStatsAPI'
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
  const [chatAPIs, setChatAPIs] = useState<Map<string, ChatAPI>>(new Map())
  const [backendAdapters, setBackendAdapters] = useState<Map<string, BackendAdapter>>(new Map())
  const [databaseStats, setDatabaseStats] = useState<Map<string, { eventCount: number, syncPercentage: number }>>(new Map())
  const [showIndicator, setShowIndicator] = useState(true)
  const [backendNetworkAPI] = useState(() => new BackendNetworkAPI())
  const [backendStatsAPIs] = useState(() => new Map<string, BackendStatsAPI>([
    ['alice', new BackendStatsAPI('http://localhost:3001')],
    ['bob', new BackendStatsAPI('http://localhost:3002')]
  ]))
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
    // Initialize backend adapters
    const initBackendAdapters = async () => {
      const adapters = new Map<string, BackendAdapter>()
      
      // Wait for chatAPIs to be initialized
      if (chatAPIs.size === 0) return
      
      // Try to connect to backend servers
      try {
        // Check if alice backend is available
        const aliceBackendUrl = 'http://localhost:3001'
        const aliceResponse = await fetch(`${aliceBackendUrl}/api/health`).catch(() => null)
        if (aliceResponse?.ok) {
          console.log('[App] Alice backend detected at', aliceBackendUrl)
          adapters.set('alice', new BackendAdapter('alice', aliceBackendUrl))
        } else {
          // Fallback to local ChatAPI
          const aliceAPI = chatAPIs.get('alice')
          if (aliceAPI) {
            console.log('[App] Using local ChatAPI for alice')
            adapters.set('alice', new BackendAdapter('alice', undefined, aliceAPI))
          }
        }
        
        // Check if bob backend is available
        const bobBackendUrl = 'http://localhost:3002'
        const bobResponse = await fetch(`${bobBackendUrl}/api/health`).catch(() => null)
        if (bobResponse?.ok) {
          console.log('[App] Bob backend detected at', bobBackendUrl)
          adapters.set('bob', new BackendAdapter('bob', bobBackendUrl))
        } else {
          // Fallback to local ChatAPI
          const bobAPI = chatAPIs.get('bob')
          if (bobAPI) {
            console.log('[App] Using local ChatAPI for bob')
            adapters.set('bob', new BackendAdapter('bob', undefined, bobAPI))
          }
        }
      } catch (error) {
        console.warn('[App] Error initializing backend adapters:', error)
      }
      
      setBackendAdapters(adapters)
      console.log('[App] Backend adapters initialized:', Array.from(adapters.entries()).map(([id, adapter]) => `${id}: ${adapter.getBackendType()}`))
    }
    
    initBackendAdapters()
  }, [chatAPIs])

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
      
      // Create ChatAPI instances for each device
      const apis = new Map<string, ChatAPI>()
      for (const freq of updatedFrequencies) {
        const api = createChatAPI(freq.deviceId, engine)
        if (api) {
          apis.set(freq.deviceId, api)
        }
      }
      setChatAPIs(apis)
      
      // Set up event execution callback
      engine.onEventExecute((event: SimulationEvent) => {
        setExecutedEvents(prev => [...prev, event])
        
        // Route event to appropriate device (only for self-generated events)
        if (event.type === 'message') {
          if (event.deviceId === 'alice' && aliceRef.current) {
            aliceRef.current.handleSimulationMessage(event.data.content, event.data.attachments)
          } else if (event.deviceId === 'bob' && bobRef.current) {
            bobRef.current.handleSimulationMessage(event.data.content, event.data.attachments)
          }
        }
      })
      
      // Set up network message callback for cross-device messaging
      engine.onNetworkMessage((deviceId: string, content: string, fromDevice: string) => {
        if (deviceId === 'alice' && aliceRef.current) {
          aliceRef.current.handleSimulationMessage(content)
        } else if (deviceId === 'bob' && bobRef.current) {
          bobRef.current.handleSimulationMessage(content)
        }
      })
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
      
      // Debug logging every 5 seconds
      if (Math.floor(engine.currentSimTime() / 5000) > Math.floor((engine.currentSimTime() - 100) / 5000)) {
        const aliceDb = engine.getDeviceDatabase('alice')
        const bobDb = engine.getDeviceDatabase('bob')
        if (aliceDb && bobDb) {
          const aliceEvents = await aliceDb.getAllEvents()
          const bobEvents = await bobDb.getAllEvents()
          console.log(`[APP DEBUG] Time: ${engine.currentSimTime()}ms - Alice: ${aliceEvents.length} events, Bob: ${bobEvents.length} events`)
        }
      }
    }, 100) // 100ms real-time ticks

    return () => {
      clearInterval(intervalId)
      // Clean up ChatAPIs
      chatAPIs.forEach(api => api.destroy())
    }
  }, [engine, frequencies, globalMessagesPerHour])

  // Handle scroll to hide/show indicator
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY
      setShowIndicator(scrollPosition < 100)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handlePause = () => {
    engine.pause()
    setIsRunning(false)
  }

  const handleResume = () => {
    engine.resume()
    setIsRunning(true)
  }

  const handleSetSpeed = (speed: number) => {
    engine.setSpeed(speed)
    setSpeedMultiplier(speed)
  }

  const handleReset = async () => {
    // Clear backend databases if connected
    for (const [deviceId, adapter] of backendAdapters) {
      if (adapter.getBackendType() === 'api') {
        try {
          // Clear backend database
          const backendUrl = deviceId === 'alice' ? 'http://localhost:3001' : 'http://localhost:3002'
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
    // Frequencies will be recalculated in useEffect based on global rate
  }

  const handleGlobalMessagesPerHourUpdate = (rate: number) => {
    setGlobalMessagesPerHour(rate)
  }

  const handleImagePercentageUpdate = (percentage: number) => {
    setImageAttachmentPercentage(percentage)
    engine.setImageAttachmentPercentage(percentage)
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
                  chatAPI={chatAPIs.get('alice')}
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
                  chatAPI={chatAPIs.get('bob')}
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
