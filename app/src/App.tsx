import { useState, useEffect, useRef } from 'react'
import { SimulationEngine, type DeviceFrequency, type SimulationEvent } from './simulation/engine'
import { DevicePanel, type DevicePanelRef } from './components/DevicePanel'
import { SimulationControls } from './components/SimulationControls'
import { EventFrequencyControls } from './components/EventFrequencyControls'
import { SimulationEventLog } from './components/SimulationEventLog'
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
  
  const aliceRef = useRef<DevicePanelRef>(null)
  const bobRef = useRef<DevicePanelRef>(null)

  useEffect(() => {
    // Initialize engine with frequencies
    engine.setDeviceFrequencies(frequencies)
    
    // Set up event execution callback
    engine.onEventExecute((event: SimulationEvent) => {
      setExecutedEvents(prev => [...prev, event])
      
      // Route event to appropriate device
      if (event.type === 'message') {
        if (event.deviceId === 'alice' && aliceRef.current) {
          aliceRef.current.handleSimulationMessage(event.data.content)
        } else if (event.deviceId === 'bob' && bobRef.current) {
          bobRef.current.handleSimulationMessage(event.data.content)
        }
      }
    })
    
    // Set up simulation tick interval
    const intervalId = setInterval(() => {
      engine.tick()
      setCurrentTime(engine.currentSimTime())
      setUpcomingEvents(engine.getUpcomingEvents(10))
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

  return (
    <div className="app" data-testid="simulation-app">
      <header>
        <h1>P2P Event Store Simulation</h1>
        <p>Phase 1: Two-device message creation and storage</p>
      </header>
      
      <main>
        <div className="simulation-section">
          <SimulationControls
            currentTime={currentTime}
            isRunning={isRunning}
            speedMultiplier={speedMultiplier}
            onPause={handlePause}
            onResume={handleResume}
            onSetSpeed={handleSetSpeed}
            onReset={handleReset}
          />
        </div>
        
        <div className="frequency-section">
          <EventFrequencyControls
            frequencies={frequencies}
            onUpdateFrequencies={handleFrequencyUpdate}
          />
        </div>
        
        <div className="timeline-section">
          <SimulationEventLog
            currentTime={currentTime}
            upcomingEvents={upcomingEvents}
            executedEvents={executedEvents}
          />
        </div>
        
        <div className="devices-section">
          <div className="devices-grid">
            <DevicePanel 
              ref={aliceRef}
              deviceId="alice" 
              currentSimTime={currentTime} 
              onManualMessage={handleManualMessage}
            />
            <DevicePanel 
              ref={bobRef}
              deviceId="bob" 
              currentSimTime={currentTime} 
              onManualMessage={handleManualMessage}
            />
          </div>
        </div>
      </main>
    </div>
  )
}

export default App
