import { useState, useEffect, useRef } from 'react'
import { SimulationEngine, type DeviceFrequency, type SimulationEvent } from './simulation/engine'
import { ChatInterface, type ChatInterfaceRef } from './components/ChatInterface'
import { EventLogWithControls } from './components/EventLogWithControls'
import { NetworkEventLog } from './components/NetworkEventLog'
import type { NetworkEvent } from './network/simulator'
import './App.css'

function App() {
  const [engine] = useState(() => new SimulationEngine())
  const [currentTime, setCurrentTime] = useState(0)
  const [isRunning, setIsRunning] = useState(true)
  const [speedMultiplier, setSpeedMultiplier] = useState(1)
  const [frequencies, setFrequencies] = useState<DeviceFrequency[]>([
    { deviceId: 'alice', messagesPerHour: 30, enabled: true },
    { deviceId: 'bob', messagesPerHour: 20, enabled: true }
  ])
  const [upcomingEvents, setUpcomingEvents] = useState<SimulationEvent[]>([])
  const [executedEvents, setExecutedEvents] = useState<SimulationEvent[]>([])
  const [networkEvents, setNetworkEvents] = useState<NetworkEvent[]>([])
  const [syncStatus, setSyncStatus] = useState<Map<string, { isSynced: boolean, syncPercentage: number }>>(new Map())
  
  const aliceRef = useRef<ChatInterfaceRef>(null)
  const bobRef = useRef<ChatInterfaceRef>(null)

  useEffect(() => {
    // Initialize engine with frequencies
    engine.setDeviceFrequencies(frequencies)
    
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
    
    // Set up simulation tick interval
    const intervalId = setInterval(() => {
      engine.tick()
      setCurrentTime(engine.currentSimTime())
      setUpcomingEvents(engine.getUpcomingEvents(10))
      setNetworkEvents(engine.getNetworkEvents(50))
      setSyncStatus(engine.getDeviceSyncStatus())
    }, 100) // 100ms real-time ticks

    return () => clearInterval(intervalId)
  }, [engine, frequencies])

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

  const handleFrequencyUpdate = (newFrequencies: DeviceFrequency[]) => {
    setFrequencies(newFrequencies)
    engine.setDeviceFrequencies(newFrequencies)
  }

  const handleManualMessage = (deviceId: string, content: string) => {
    // Add manual message to simulation timeline
    engine.createMessageEvent(deviceId, content)
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
                onManualMessage={handleManualMessage}
              />
              <ChatInterface 
                ref={bobRef}
                deviceId="bob" 
                currentSimTime={currentTime}
                syncStatus={syncStatus.get('bob')}
                onManualMessage={handleManualMessage}
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
