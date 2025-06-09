export interface SimulationEvent {
  simTime: number
  type: 'message' | 'file' | 'device_join' | 'device_leave'
  deviceId: string
  data: any
  executed?: boolean
}

export interface EventTimeline {
  events: SimulationEvent[]
  duration: number
}

export interface DeviceFrequency {
  deviceId: string
  messagesPerHour: number
  enabled: boolean
}

export class SimulationEngine {
  private currentTime = 0
  private isRunning = true // Start running by default for tests
  private speedMultiplier = 1
  private tickInterval = 100 // 100ms real-time per tick
  private eventTimeline: SimulationEvent[] = []
  private eventExecuteCallback?: (event: SimulationEvent) => void
  private deviceFrequencies: DeviceFrequency[] = []
  private nextEventId = 1

  currentSimTime(): number {
    return this.currentTime
  }

  setSpeed(multiplier: number) {
    this.speedMultiplier = multiplier
  }

  pause() {
    this.isRunning = false
  }

  resume() {
    this.isRunning = true
  }

  tick() {
    if (!this.isRunning) return

    // Advance simulation time by tick * speed
    this.currentTime += this.tickInterval * this.speedMultiplier

    // Execute all events that should have happened by now
    this.executeEventsUpToTime(this.currentTime)
  }

  createMessageEvent(deviceId: string, content: string, simTime?: number) {
    const event: SimulationEvent = {
      simTime: simTime ?? this.currentTime,
      type: 'message',
      deviceId,
      data: { content }
    }
    this.eventTimeline.push(event)

    // If event is for "now", execute immediately
    if (event.simTime <= this.currentTime) {
      this.executeEvent(event)
    }
  }

  loadEventTimeline(events: SimulationEvent[]) {
    this.eventTimeline = events.sort((a, b) => a.simTime - b.simTime)
  }

  exportEventTimeline(): EventTimeline {
    return {
      events: [...this.eventTimeline],
      duration: Math.max(0, ...this.eventTimeline.map(e => e.simTime))
    }
  }

  onEventExecute(callback: (event: SimulationEvent) => void) {
    this.eventExecuteCallback = callback
  }

  setDeviceFrequencies(frequencies: DeviceFrequency[]) {
    this.deviceFrequencies = [...frequencies]
    this.generateUpcomingEvents()
  }

  getDeviceFrequencies(): DeviceFrequency[] {
    return [...this.deviceFrequencies]
  }

  getUpcomingEvents(count: number = 10): SimulationEvent[] {
    return this.eventTimeline
      .filter(e => !e.executed && e.simTime >= this.currentTime)
      .sort((a, b) => a.simTime - b.simTime)
      .slice(0, count)
  }

  private generateUpcomingEvents() {
    // Clear future events
    this.eventTimeline = this.eventTimeline.filter(e => e.executed || e.simTime <= this.currentTime)
    
    // Generate events for next hour of simulation time
    const generationWindow = 3600000 // 1 hour in milliseconds
    const endTime = this.currentTime + generationWindow
    
    this.deviceFrequencies.forEach(freq => {
      if (!freq.enabled || freq.messagesPerHour <= 0) return
      
      // Calculate average interval between messages
      const avgInterval = 3600000 / freq.messagesPerHour // ms between messages
      
      let nextEventTime = this.currentTime + this.randomInterval(avgInterval)
      
      while (nextEventTime < endTime) {
        this.eventTimeline.push({
          simTime: nextEventTime,
          type: 'message',
          deviceId: freq.deviceId,
          data: { 
            content: this.generateRandomMessage(),
            simulation_event_id: this.nextEventId++
          }
        })
        
        // Schedule next event with some randomness
        nextEventTime += this.randomInterval(avgInterval)
      }
    })
    
    // Sort timeline by time
    this.eventTimeline.sort((a, b) => a.simTime - b.simTime)
  }

  private randomInterval(avgInterval: number): number {
    // Exponential distribution for realistic spacing
    // Most messages come at avgInterval, but some much sooner/later
    return Math.max(1000, -Math.log(Math.random()) * avgInterval)
  }

  private generateRandomMessage(): string {
    const messages = [
      "Hey, how's it going?",
      "Just finished the presentation",
      "Running a bit late",
      "Can we reschedule?",
      "Great job on the project!",
      "Coffee break?",
      "The weather is nice today",
      "Did you see the news?",
      "Almost done with the feature",
      "Need help with debugging",
      "Meeting in 10 minutes",
      "Thanks for the feedback",
      "Working from home today",
      "System is running smoothly",
      "Found an interesting article",
      "Lunch plans?",
      "Code review completed",
      "Performance looks good",
      "New requirements came in",
      "Fixed the bug we discussed"
    ]
    return messages[Math.floor(Math.random() * messages.length)]
  }

  private executeEventsUpToTime(targetTime: number) {
    const eventsToExecute = this.eventTimeline.filter(e => 
      e.simTime <= targetTime && !e.executed
    )
    eventsToExecute.forEach(e => this.executeEvent(e))
    
    // Only regenerate events if we have device frequencies configured
    if (this.deviceFrequencies.length > 0) {
      const upcomingEvents = this.eventTimeline.filter(e => !e.executed && e.simTime > targetTime)
      if (upcomingEvents.length < 5) {
        this.generateUpcomingEvents()
      }
    }
  }

  private executeEvent(event: SimulationEvent) {
    event.executed = true
    if (this.eventExecuteCallback) {
      this.eventExecuteCallback(event)
    }
    // Future: Actually create the message/file in device database
  }
}