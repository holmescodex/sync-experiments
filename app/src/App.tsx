import { useState, useEffect, useRef } from 'react'
import { SimulationEngine, type DeviceFrequency, type SimulationEvent } from './simulation/engine'
import { ChatInterface, type ChatInterfaceRef } from './components/ChatInterface'
import { EventLogWithControls } from './components/EventLogWithControls'
import { NetworkEventLog } from './components/NetworkEventLog'
import type { NetworkEvent } from './network/simulator'
import { createChatAPI, type ChatAPI } from './api/ChatAPI'
import './App.css'

function App() {
  const [engine] = useState(() => new SimulationEngine())
  const [currentTime, setCurrentTime] = useState(0)
  const [isRunning, setIsRunning] = useState(true)
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const [globalMessagesPerHour, setGlobalMessagesPerHour] = useState(50)
  const [imageAttachmentPercentage, setImageAttachmentPercentage] = useState(30)
  const [frequencies, setFrequencies] = useState<DeviceFrequency[]>([
    { deviceId: 'alice', messagesPerHour: 30, enabled: true },
    { deviceId: 'bob', messagesPerHour: 20, enabled: true }
  ])
  const [upcomingEvents, setUpcomingEvents] = useState<SimulationEvent[]>([])
  const [executedEvents, setExecutedEvents] = useState<SimulationEvent[]>([])
  const [networkEvents, setNetworkEvents] = useState<NetworkEvent[]>([])
  const [syncStatus, setSyncStatus] = useState<Map<string, { isSynced: boolean, syncPercentage: number }>>(new Map())
  const [databasesInitialized, setDatabasesInitialized] = useState(false)
  const [chatAPIs, setChatAPIs] = useState<Map<string, ChatAPI>>(new Map())
  const [databaseStats, setDatabaseStats] = useState<Map<string, { eventCount: number, syncPercentage: number }>>(new Map())
  
  const aliceRef = useRef<ChatInterfaceRef>(null)
  const bobRef = useRef<ChatInterfaceRef>(null)

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
            aliceRef.current.handleSimulationMessage(event.data.content)
          } else if (event.deviceId === 'bob' && bobRef.current) {
            bobRef.current.handleSimulationMessage(event.data.content)
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
      await engine.tick()
      setCurrentTime(engine.currentSimTime())
      setUpcomingEvents(engine.getUpcomingEvents(10))
      setNetworkEvents(engine.getNetworkEvents(50))
      const deviceSyncStatus = engine.getDeviceSyncStatus()
      setSyncStatus(deviceSyncStatus)
      
      // Update database stats
      const dbStats = new Map<string, { eventCount: number, syncPercentage: number }>()
      for (const deviceId of ['alice', 'bob']) {
        const db = engine.getDeviceDatabase(deviceId)
        if (db) {
          const events = await db.getAllEvents()
          const syncData = deviceSyncStatus.get(deviceId)
          dbStats.set(deviceId, {
            eventCount: events.length,
            syncPercentage: syncData?.syncPercentage || 0
          })
        }
      }
      setDatabaseStats(dbStats)
      
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

  const handleReset = () => {
    // For Phase 1, we'll just reload the page
    // In Phase 2+, we'll properly reset the simulation state
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
  }

  const handleManualMessage = async (deviceId: string, content: string, attachments?: any[]) => {
    // Add manual message to simulation timeline
    // For now, combine content and attachment info into the message content
    // In future phases, this will properly handle file chunks and content IDs
    let messageContent = content
    if (attachments && attachments.length > 0) {
      const fileInfo = attachments.map(att => `[${att.name}]`).join(' ')
      messageContent = content ? `${content} ${fileInfo}` : fileInfo
    }
    
    console.log(`[App] Manual message from ${deviceId}: "${messageContent}"`)
    await engine.createMessageEvent(deviceId, messageContent)
    
    // Debug: Check database immediately after
    const db = engine.getDeviceDatabase(deviceId)
    if (db) {
      const events = await db.getAllEvents()
      console.log(`[App] ${deviceId}'s database now has ${events.length} events`)
    }
  }

  const handleNetworkConfigUpdate = (config: any) => {
    engine.updateNetworkConfig(config)
  }

  return (
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
            networkConfig={engine.getNetworkConfig()}
            networkStats={engine.getNetworkStats()}
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
                databaseStats={databaseStats.get('alice')}
              />
              <ChatInterface 
                ref={bobRef}
                deviceId="bob" 
                currentSimTime={currentTime}
                syncStatus={syncStatus.get('bob')}
                imageAttachmentPercentage={imageAttachmentPercentage}
                onManualMessage={handleManualMessage}
                chatAPI={chatAPIs.get('bob')}
                databaseStats={databaseStats.get('bob')}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
