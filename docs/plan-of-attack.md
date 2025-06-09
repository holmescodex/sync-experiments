# Plan of Attack: P2P Sync Simulation Environment

## Goal

Build a comfortable space for iterating that lets me add complexity, starting with a simple proof that two nodes can sync, and building up to a full-fledged simulation of dozens of devices with realistic API and network transports that allows for deterministic testing against many different kinds of reality, with meaningful readable metrics for evaluating the success of different sync approaches.

## Detailed Plan

### 0. Architecture Overview

The simulation environment will have three main components:
- **Simulation Engine**: Manages time, network conditions, and device lifecycle
- **React Dashboard**: Interactive UI for controlling and observing simulations
- **Device Instances**: Isolated SQLite databases representing individual devices/users

### 1. Dashboard Layout & Design

```
+-----------------------------------------------------------------------------------+
|                              P2P Sync Simulation Dashboard                         |
+-----------------------------------------------------------------------------------+
| [▶ Play] [⏸ Pause] [⏹ Stop] [⏩ Speed: 10x]  Sim Time: 00:15:32  Real: 00:01:32 |
+-----------------------------------------------------------------------------------+
|                    |                              |                                |
| Real World Events  |     Network Topology         |        Metrics                 |
|                    |                              |                                |
| [+ New Message]    |     Device A -------- B     | Total Events: 1,234            |
| [+ File Upload]    |         |  \      /  |      | Synced: 1,230 (99.7%)          |
| [+ Device Join]    |         |   \    /   |      | Avg Sync Time: 230ms           |
| [+ Device Leave]   |         C --- D --- E       | Network Usage: 45.2 MB         |
|                    |                              |                                |
| Event Log:         |     [Sync Status Legend]     | Device Status:                 |
| 00:15:30 A→msg     |     ● Synced                 | A: ● 100% (1234/1234)          |
| 00:15:28 B→file    |     ● Syncing                | B: ● 100% (1234/1234)          |
| 00:15:25 C→join    |     ● Out of Sync            | C: ● 85% (1048/1234)           |
| 00:15:20 A→msg     |                              | D: ● 92% (1134/1234)           |
| ...                |                              | E: ● 78% (961/1234)            |
+-----------------------------------------------------------------------------------+
| Event Generation Parameters        | Network Conditions                            |
| Messages/sec: [====5====] 0-20    | Latency (ms): [===50===] 0-500              |
| Message size: 100±50 chars         | Packet Loss: [==5%==] 0-50%                 |
| Files/hour: [==2==] 0-10          | Bandwidth: [=100Mbps=]                       |
| File size: 5±3 MB                 | UDP MTU: 1400 bytes                          |
| Join/Leave rate: [=0.5/hr=]       | [✓] Simulate NAT traversal issues            |
+-----------------------------------------------------------------------------------+
```

### 2. React App Structure

```
src/
├── App.tsx                    # Main dashboard container
├── components/
│   ├── SimulationControls.tsx # Play/pause/speed controls
│   ├── EventGenerator.tsx     # Real-world event controls
│   ├── EventLog.tsx          # Scrollable event history
│   ├── NetworkTopology.tsx   # Visual network graph (D3.js)
│   ├── DeviceStatus.tsx      # Per-device sync status
│   ├── MetricsPanel.tsx      # Aggregate statistics
│   └── DeviceInspector.tsx   # Deep dive into device state
├── simulation/
│   ├── Engine.ts             # Core simulation loop
│   ├── Device.ts             # Device instance management
│   ├── Network.ts            # Network simulation layer
│   ├── EventGenerator.ts     # Real-world event creation
│   └── SyncProtocol.ts       # Bloom filter sync implementation
└── storage/
    ├── SimulationDB.ts       # Simulation state persistence
    └── DeviceDB.ts           # Per-device SQLite wrapper
```

### 3. Simulation Engine Details

#### Time Management
- **Simulation time**: Internal clock that can run faster than real time
- **Time multiplier**: 1x to 1000x speed (logarithmic slider)
- **Tick rate**: Fixed 100ms simulation ticks for consistent behavior
- **Event scheduling**: Priority queue for future events

#### Network Simulation
- **Latency modeling**: Normal distribution with configurable mean/variance
- **Packet loss**: Random drops based on configured percentage
- **Bandwidth limits**: Token bucket algorithm for rate limiting
- **NAT simulation**: Connection state tracking, UDP hole punching delays
- **Network partitions**: Ability to isolate device groups

### 4. Real-World Event Generation

#### Event Types
1. **Message Send**
   - Author device
   - Message content (generated from templates)
   - Optional @mentions // no need to worry about this
   - Timestamp

2. **File Upload**
   - Author device
   - File metadata (name, size, mime type)
   - Chunking into multiple events
   - Progress tracking

3. **Device Lifecycle**
   - Join: New device enters network with empty DB and invite link material (for now: one non-NATed peer "address", PSK)
   - Leave: Device goes offline (graceful or abrupt)
   - Reconnect: Device comes back online after period

4. **Invite Events**
   - New PSK generation
   - Invite link creation
   - Device authorization // I think anyone with a PSK is authorized, for now 

#### Event Generation Parameters
- **Frequency distributions**: Poisson for natural clustering
- **Content generation**: Lorem ipsum with configurable length // longer messages can be modeled as file attachments
- **User behavior profiles**: Active, lurker, mobile patterns // good idea, let's flesh this out more to make sure it feels realistic and meaningful. mobile patterns should include iOS devices that can do very time-limited background sync or sync when app is open. (we can consider push notification service later)
- **Correlation**: Reply chains, file responses to requests // good idea. there will be flurries of messages so modeling reply chains is good. "likelihood of reply / avg speed of reply" might be good parameters.  

### 5. Device Inspector Features

When clicking on a device in the topology view:
- **Message view**: Full chat UI showing synced messages
- **File browser**: List of available files with download status // should look more like a download list with progress bars than a file browser. also file progress should display in the files themselves. also files should be images first, compressed, 200kb range. we will consider larger files in a subsequent iteration. we should have some realistic test images. 
- **Database stats**: Event count, DB size, index performance 
- **Sync details**: Bloom filter size, peer connections, bandwidth usage // bloom filters sent over the wire should be small and UDB sized e.g. <500 bytes with overhead but they should accumulate in accuracy on client sides as updates continue, perhaps up to some reasonable limit where we aren't worried about too many false positives even for very large (2-3GB) message / file archives  
- **SQL console**: Direct queries against device's SQLite DB // perhaps we should use the SQLlite http API-- let's spend more time exploring how a typical RN mobile or electron app would be built. Use telegram's API as a model. We should make something as conventional as possble. 

### 6. Metrics & Monitoring

#### Key Metrics
- **Sync completeness**: % of events each device has
- **Sync latency**: Time from event creation to sync on all devices
- **Bandwidth efficiency**: Bytes transferred vs. useful data // one aspect of inefficiency is duplicates received so we should track this
- **Bloom filter performance**: False positive rate, filter size
- **Query performance**: Message retrieval, search speed // we should track incoming writes relative to some realistic maximum write rate for iOS and Android devices to make sure we're under the ceiling.  

#### Visualization Options // let's leave all this for future iterations. 
- **Time series graphs**: Metrics over simulation time
- **Heatmaps**: Device-to-device sync times
- **Network flow**: Animated packet visualization
- **Progress bars**: Per-device sync status

### 7. Scenario Management

#### Saving/Loading Simulations
```typescript
interface SimulationScenario {
  name: string
  description: string
  realWorldEvents: RealWorldEvent[]
  networkConditions: NetworkConfig
  deviceProfiles: DeviceProfile[]
  duration: number // simulation seconds
}
```

#### Built-in Scenarios
1. **Happy Path**: 2 devices, good network, basic messaging
2. **Coffee Shop**: 5-10 devices, variable connections, mixed activity
3. **Conference**: 50+ devices, high message rate, large files
4. **Mobile Stress**: Frequent disconnects, poor network, patience test
5. **New User Experience**: Join established community with history

### 8. Time Acceleration Strategy

For speeding up simulations:
- **Event timestamps**: Use simulation time, not wall clock
- **Network delays**: Scale inversely with speed multiplier
- **UI updates**: Throttle to 60fps regardless of sim speed
- **Storage writes**: Batch operations at high speeds
- **Progress indication**: Show both sim time and real time

Example: At 100x speed, 1 hour of community activity runs in 36 seconds

### 9. Comprehensive User Stories

#### Protocol Designer (You)
1. **Performance Analysis**
   - Toggle between different network conditions
   - See write latency histograms per database
   - Identify sync bottlenecks with SQL query profiler
   - Export performance traces for analysis

2. **Protocol Debugging**
   - Step through Bloom filter exchanges frame by frame
   - Inspect encrypted event payloads
   - Manually trigger specific network conditions
   - Force specific sync failures to test recovery

3. **NAT Testing**
   - Configure specific NAT types per device
   - See connection success/failure reasons
   - Test UDP hole punching timing
   - Simulate mobile network transitions

#### LLM Tester (Claude)

1. **Complete State Visibility**
   - Export full simulation state as structured JSON via `/api/simulation/state`
   - Query any device's SQLite via HTTP API: `/api/device/{id}/sql`
   - Stream real-time state changes via WebSocket: `/api/simulation/stream`
   - Compare device states with diff tools: `/api/compare/{deviceA}/{deviceB}`
   - Access network topology and connection matrix: `/api/network/status`
   - View all metrics without UI interaction: `/api/metrics/snapshot`

2. **State Inspection Commands**
   ```
   /state - Full simulation state as JSON
   /device A - Device A's complete state
   /sql A "SELECT * FROM events" - Run SQL on device
   /compare A B - Diff events between devices
   /network - Current connection matrix
   /metrics - Performance metrics snapshot
   ```

3. **Automated Verification**
   ```typescript
   // Test assertions via API
   POST /api/test/assert
   {
     "type": "sync_complete",
     "devices": ["A", "B"],
     "timeout": 5000
   }
   ```
   - Assert sync completeness: "All devices have event X"
   - Verify ordering: "Events appear in correct sequence"
   - Check performance: "Sync completed within 500ms"
   - Validate Bloom filters: "False positive rate < 1%"
   - Monitor bandwidth: "No duplicate transmissions"
   - Test edge cases programmatically

4. **Interactive Debugging**
   - Step through sync protocol message by message
   - Inject specific network conditions mid-simulation
   - Pause simulation at exact moments
   - Modify device state during simulation
   - Replay specific scenarios deterministically
   - Export/import device databases for analysis

5. **Test Report Generation**
   - Structured test results with pass/fail metrics
   - Performance regression detection
   - Anomaly highlighting with root cause analysis
   - Suggested optimizations based on patterns
   - CSV/JSON export of all metrics
   - Reproducible test scenario definitions

6. **Visual Testing Support**
   - Cypress integration for screenshot capture
   - data-testid attributes on all key UI elements
   - State overlays showing internal values
   - Programmatic UI interaction capabilities

#### End Users (Simulated)

1. **Basic Sync Scenarios**
   - Alice and Bob: Simple two-device messaging
   - Charlie joins active community with 10k messages
   - Mobile user on train with intermittent connectivity
   - Image file distribution to 20 users (200KB compressed images)
   - Concurrent messaging from 5 active users

2. **Real Usage Patterns**
   - **Mobile User (iOS/Android)**:
     - Background sync every 15-30 min (iOS background refresh)
     - Foreground usage bursts of 1-5 minutes
     - NAT type changes when switching WiFi ↔ Cellular
     - Battery optimization affecting sync frequency
     - Push notification triggers for immediate sync
   - **Desktop User**: 
     - Always online during work hours
     - Public IP or stable NAT
     - High bandwidth, low latency
     - Multiple large file transfers
   - **Power User**: 
     - Many messages per minute
     - Multiple image uploads
     - Quick reply patterns
     - Multiple devices per account
   - **Lurker**: 
     - 95% reading, 5% posting
     - Long scroll-back sessions
     - Selective file downloads
     - Notification-driven app opens

3. **Interactive Features**
   - Send messages with realistic typing delays
   - Scroll through message history (test lazy loading)
   - Search messages (test index performance)
   - Upload/download images with progress tracking
   - Resume interrupted file transfers
   - Reply chains with configurable response times

### 10. Implementation Phases

#### Phase 1: Core Infrastructure (Week 1-2) - Detailed TDD Implementation

**Philosophy**: Build tests first, then implement to pass the tests. Each component must have comprehensive test coverage before moving to the next step.

**Minimal Scope**: Two devices can create, store, and display message events with basic time simulation. No sync yet - just isolated event creation and storage.

##### Step 1.1: Project Setup & Testing Infrastructure (Day 1)
**Goal**: Establish development environment with testing foundation

**Implementation Steps**:
1. `npm create vite@latest sync-experiments -- --template react-ts`
2. Install testing dependencies: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`
3. Install database: `sql.js`, `@types/sql.js`
4. Configure Vitest in `vite.config.ts`
5. Setup test utilities in `src/test-utils.ts`

**Required Tests** (write these first):
```typescript
// tests/setup.test.ts
describe('Development Environment', () => {
  test('Vite dev server starts', () => {
    // Verify dev server can start without errors
  })
  
  test('TypeScript compilation works', () => {
    // Verify TS types compile correctly
  })
  
  test('Testing framework initialized', () => {
    // Basic test runner verification
  })
})
```

**Validation Criteria**:
- [ ] `npm run dev` starts React app on localhost
- [ ] `npm run test` runs without errors
- [ ] TypeScript compilation passes
- [ ] Hot reload works for basic component changes

##### Step 1.2: Simulation Time Engine (Day 2)
**Goal**: Core time management that can run faster than real time

**Required Tests** (write first):
```typescript
// tests/simulation/time.test.ts
describe('SimulationTime', () => {
  test('starts at time 0', () => {
    const time = new SimulationTime()
    expect(time.now()).toBe(0)
  })
  
  test('advances by tick interval', () => {
    const time = new SimulationTime()
    time.tick()
    expect(time.now()).toBe(100) // 100ms default tick
  })
  
  test('respects speed multiplier', () => {
    const time = new SimulationTime(10) // 10x speed // I'm not sure you're thinking about simulation time correctly. Do some elaboration and narration of how this will work. Desired goal: for a given message frequency (e.g. 1 messages per second) I can use the speed multiplier to advance 10 or 100 times as fast, i.e. getting weeks or years of events and syncing process in a few minutes. Is your multiplier right? I suppose it will increase the number of events per seconds past since last event. But we want to simulate those events happening in actual time one by one, not always in batches. Can you think this through more?  
    time.tick()
    expect(time.now()).toBe(1000) // 100ms * 10
  })
  
  test('can pause and resume', () => {
    const time = new SimulationTime()
    time.pause()
    time.tick()
    expect(time.now()).toBe(0) // No advancement when paused
    
    time.resume()
    time.tick()
    expect(time.now()).toBe(100)
  })
  
  test('can schedule future events', () => {
    const time = new SimulationTime()
    const events: Event[] = []
    
    time.scheduleAt(500, () => events.push({type: 'test'}))
    
    // Advance to just before event
    while(time.now() < 500) time.tick()
    expect(events).toHaveLength(0)
    
    // Advance past event time
    time.tick()
    expect(events).toHaveLength(1)
  })
})
```

**Implementation**:
```typescript
// src/simulation/time.ts
export class SimulationTime {
  private currentTime = 0
  private isRunning = false
  private speedMultiplier = 1
  private tickInterval = 100 // 100ms
  private scheduledEvents: Array<{time: number, callback: () => void}> = []
  
  // Implementation to pass above tests
}
```

**Validation Criteria**:
- [ ] All time tests pass
- [ ] Can schedule events in the future // what does it mean to schedule events in the future? what is the use case here? what does "future" mean? The event log is just a list of events and times, right? we could do it in realtime or play back an existing log and it's the same thing, right? (this is the desired goal)
- [ ] Speed multiplier works correctly
- [ ] Pause/resume functionality works // let's add being able to save and play back an event log here. this will be useful for debugging i think.

##### Step 1.3: SQLite Device Database (Day 3)
**Goal**: Each device has isolated SQLite database for events

**Required Tests** (write first):
```typescript
// tests/storage/device-db.test.ts
describe('DeviceDB', () => {
  test('creates database with events table', async () => {
    const db = new DeviceDB('alice') // Using alice/bob for Phase 1
    // TODO: Future - Human-readable names from device IDs using library like 'human-id'
    // Generate names from public key hashes: device_id "0x1234..." → "brave-salmon"
    await db.initialize()
    
    const tables = await db.query("SELECT name FROM sqlite_master WHERE type='table'")
    expect(tables.some(row => row.name === 'events')).toBe(true)
  })
  
  test('stores and retrieves events', async () => {
    const db = new DeviceDB('alice')
    await db.initialize()
    
    const event = {
      device_id: 'alice',
      created_at: 1000, // Device's wall-clock time when created (starts as sim-time)
      received_at: 1000, // This device's wall-clock time when received
      simulation_event_id: 42, // For debugging - which sim event caused this
      encrypted: new Uint8Array([1, 2, 3])
    }
    
    const eventId = await db.insertEvent(event) // Returns computed hash
    const retrieved = await db.getEvent(eventId)
    
    expect(retrieved).toEqual(event)
  })
  
  test('returns events in chronological order', async () => {
    const db = new DeviceDB('alice')
    await db.initialize()
    
    const id1 = await db.insertEvent({...baseEvent, created_at: 2000})
    const id2 = await db.insertEvent({...baseEvent, created_at: 1000})
    const id3 = await db.insertEvent({...baseEvent, created_at: 3000})
    
    const events = await db.getAllEvents()
    // Verify ordering by created_at, not event_id
    expect(events[0].created_at).toBe(1000)
    expect(events[1].created_at).toBe(2000)
    expect(events[2].created_at).toBe(3000)
  })
  
  test('handles database isolation between devices', async () => {
    const dbAlice = new DeviceDB('alice')
    const dbBob = new DeviceDB('bob')
    await dbAlice.initialize()
    await dbBob.initialize()
    
    await dbAlice.insertEvent({...baseEvent, device_id: 'alice'})
    await dbBob.insertEvent({...baseEvent, device_id: 'bob'})
    
    const eventsAlice = await dbAlice.getAllEvents()
    const eventsBob = await dbBob.getAllEvents()
    
    expect(eventsAlice).toHaveLength(1)
    expect(eventsBob).toHaveLength(1)
    expect(eventsAlice[0].device_id).toBe('alice')
    expect(eventsBob[0].device_id).toBe('bob')
  })
})
```

**Implementation**:
```typescript
// src/storage/device-db.ts
export interface Event {
  device_id: string          // Device that created this event
  created_at: number         // Device's wall-clock time when created
  received_at: number        // This device's wall-clock time when received
  simulation_event_id?: number // For debugging - which sim event caused this
  encrypted: Uint8Array      // AEAD encrypted payload
  // Note: event_id is computed as hash(encrypted) and stored separately in DB
}

export class DeviceDB {
  private db: Database | null = null
  
  constructor(private deviceId: string) {}
  
  async initialize() {
    // sql.js initialization
    // CREATE TABLE events (
    //   event_id TEXT PRIMARY KEY,  -- hash(encrypted)
    //   device_id TEXT,
    //   created_at INTEGER,
    //   received_at INTEGER,
    //   simulation_event_id INTEGER,
    //   encrypted BLOB
    // )
  }
  
  async insertEvent(event: Event): Promise<string> {
    const eventId = this.computeEventId(event.encrypted)
    // Insert with computed event_id as primary key
    // Returns the computed event_id
    return eventId
  }
  
  async getEvent(eventId: string): Promise<Event | null> {
    // Query by event_id (computed hash)
  }
  
  async getAllEvents(): Promise<Event[]> {
    // Order by created_at (when original device created it)
    // Implementation: ORDER BY created_at ASC
  }
  
  private computeEventId(encrypted: Uint8Array): string {
    const hashBytes = hash(encrypted)
    return Array.from(hashBytes.slice(0, 8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  
  // For UI updates - get events as they arrive, even if out of order
  onNewEvent(callback: (event: Event) => void): void {
    // Subscribe to new events by received_at order
  }
}
```

**Validation Criteria**:
- [ ] All database tests pass
- [ ] Events stored with correct schema
- [ ] Device isolation verified
- [ ] Chronological ordering works

##### Step 1.4: Message Event Creation (Day 4)
**Goal**: Generate simple text message events with timestamps

**Required Tests** (write first):
```typescript
// tests/simulation/message-generator.test.ts
describe('MessageGenerator', () => {
  test('creates message event with required fields', () => {
    const generator = new MessageGenerator('alice')
    const engine = new SimulationEngine()
    
    const event = generator.createMessage('Hello world', engine.currentSimTime())
    
    expect(event.device_id).toBe('alice')
    expect(event.created_at).toBe(0)
    expect(event.received_at).toBe(0)
    expect(event.encrypted).toBeInstanceOf(Uint8Array)
    expect(event.encrypted.length).toBeGreaterThan(24) // nonce + ciphertext
  })
  
  test('generates unique encrypted content', () => {
    const generator = new MessageGenerator('alice')
    
    const event1 = generator.createMessage('Message 1', 1000)
    const event2 = generator.createMessage('Message 2', 2000)
    
    // Different messages should have different encrypted content
    expect(event1.encrypted).not.toEqual(event2.encrypted)
  })
  
  test('encrypts message content with AEAD', () => {
    const generator = new MessageGenerator('alice')
    
    const event = generator.createMessage('Secret message', 1000)
    
    // Encrypted content should not contain plaintext
    const encryptedStr = new TextDecoder().decode(event.encrypted)
    expect(encryptedStr).not.toContain('Secret message')
    expect(event.encrypted.length).toBeGreaterThan(24) // nonce + ciphertext
  })
  
  test('can decrypt own message with PSK', () => {
    const generator = new MessageGenerator('alice')
    
    const originalText = 'Test message'
    const event = generator.createMessage(originalText, 1000)
    const decrypted = generator.decryptMessage(event)
    
    expect(decrypted.content).toBe(originalText)
    expect(decrypted.type).toBe('message')
  })
  
  test('decryption fails with wrong PSK', () => {
    const generator1 = new MessageGenerator('alice')
    const generator2 = new MessageGenerator('bob')
    // Different devices, different PSKs for this test
    
    const event = generator1.createMessage('Secret', 1000)
    
    expect(() => generator2.decryptMessage(event)).toThrow('Decryption failed')
  })
})
```

**Implementation**:
```typescript
// src/simulation/message-generator.ts
import { secretbox, randomBytes, hash } from 'tweetnacl'

interface MessagePayload {
  type: 'message'
  content: string
  timestamp: number
}

export class MessageGenerator {
  private psk: Uint8Array // 32-byte shared key
  
  constructor(private deviceId: string) {
    // Initialize with fixed PSK for Phase 1 (all devices share same key)
    this.psk = new Uint8Array(32)
    this.psk.fill(42) // Simple fixed key for testing
    // TODO: Phase 2 - proper PSK distribution via invite links
  }
  
  createMessage(content: string, deviceWallClockTime: number): Event {
    const payload: MessagePayload = {
      type: 'message',
      content,
      timestamp: deviceWallClockTime
    }
    
    const encrypted = this.encrypt(JSON.stringify(payload))
    
    return {
      device_id: this.deviceId,
      created_at: deviceWallClockTime,
      received_at: deviceWallClockTime, // Same for creator
      encrypted
    }
  }
  
  decryptMessage(event: Event): MessagePayload {
    const decrypted = this.decrypt(event.encrypted)
    return JSON.parse(decrypted)
  }
  
  private encrypt(plaintext: string): Uint8Array {
    const nonce = randomBytes(24)
    const message = new TextEncoder().encode(plaintext)
    const ciphertext = secretbox(message, nonce, this.psk)
    
    // Return nonce + ciphertext (as per design doc)
    const result = new Uint8Array(24 + ciphertext.length)
    result.set(nonce)
    result.set(ciphertext, 24)
    return result
  }
  
  private decrypt(encrypted: Uint8Array): string {
    const nonce = encrypted.slice(0, 24)
    const ciphertext = encrypted.slice(24)
    const decrypted = secretbox.open(ciphertext, nonce, this.psk)
    
    if (!decrypted) {
      throw new Error('Decryption failed - invalid PSK or corrupted data')
    }
    
    return new TextDecoder().decode(decrypted)
  }
  
}
```

**Validation Criteria**:
- [ ] All message generation tests pass
- [ ] Event IDs are unique and deterministic
- [ ] Basic encryption/decryption works
- [ ] Message content properly structured

##### Step 1.5: Basic React UI (Day 5-6)
**Goal**: Minimal dashboard showing two devices and their messages

**Required Tests** (write first):
```typescript
// tests/components/device-panel.test.tsx
describe('DevicePanel', () => {
  test('displays device ID', () => {
    render(<DevicePanel deviceId="alice" />)
    expect(screen.getByText('Alice')).toBeInTheDocument()
  })
  
  test('shows message count', async () => {
    const mockDB = createMockDB([
      {event_id: 'msg1', content: 'Hello'},
      {event_id: 'msg2', content: 'World'}
    ])
    
    render(<DevicePanel deviceId="alice" database={mockDB} />)
    
    await waitFor(() => {
      expect(screen.getByText('2 messages')).toBeInTheDocument()
    })
  })
  
  test('displays messages in chronological order', async () => {
    const mockDB = createMockDB([
      {event_id: 'msg1', content: 'First', created_at: 1000},
      {event_id: 'msg2', content: 'Second', created_at: 2000}
    ])
    
    render(<DevicePanel deviceId="alice" database={mockDB} />)
    
    const messages = await screen.findAllByTestId('message-item')
    expect(messages[0]).toHaveTextContent('First')
    expect(messages[1]).toHaveTextContent('Second')
  })
})

// tests/components/simulation-controls.test.tsx
describe('SimulationControls', () => {
  test('displays current simulation time', () => {
    const engine = new SimulationEngine()
    engine.tick() // Advance to 100ms
    
    render(<SimulationControls engine={engine} />)
    expect(screen.getByText('00:00:00.1')).toBeInTheDocument()
  })
  
  test('play button starts simulation', () => {
    const mockEngine = createMockEngine()
    render(<SimulationControls engine={mockEngine} />)
    
    fireEvent.click(screen.getByLabelText('Play'))
    expect(mockEngine.resume).toHaveBeenCalled()
  })
  
  test('pause button stops simulation', () => {
    const mockEngine = createMockEngine()
    render(<SimulationControls engine={mockEngine} />)
    
    fireEvent.click(screen.getByLabelText('Pause'))
    expect(mockEngine.pause).toHaveBeenCalled()
  })
})
```

**Implementation**:
```typescript
// src/components/DevicePanel.tsx
interface DevicePanelProps {
  deviceId: string
  database: DeviceDB
}

export function DevicePanel({ deviceId, database }: DevicePanelProps) {
  const [messages, setMessages] = useState<DecryptedMessage[]>([])
  
  useEffect(() => {
    // Load and decrypt messages from database
    const loadMessages = async () => {
      const events = await database.getAllEvents()
      const generator = new MessageGenerator(deviceId)
      const decrypted = events.map(event => generator.decryptMessage(event))
      setMessages(decrypted)
    }
    loadMessages()
  }, [database, deviceId])
  
  return (
    <div data-testid={`device-${deviceId}`}>
      <h3>{deviceId.charAt(0).toUpperCase() + deviceId.slice(1)}</h3>
      <div>{messages.length} messages</div>
      <div>
        {messages.map((msg, index) => (
          <div key={`${msg.timestamp}-${index}`} data-testid="message-item">
            {msg.content}
          </div>
        ))}
      </div>
    </div>
  )
}

// src/components/SimulationControls.tsx
interface SimulationControlsProps {
  engine: SimulationEngine
}

export function SimulationControls({ engine }: SimulationControlsProps) {
  const [currentTime, setCurrentTime] = useState(0)
  
  useEffect(() => {
    // Subscribe to simulation time updates
    const interval = setInterval(() => {
      setCurrentTime(engine.currentSimTime())
    }, 100)
    
    return () => clearInterval(interval)
  }, [engine])
  
  return (
    <div>
      <span>{formatTime(currentTime)}</span>
      <button 
        aria-label="Play"
        onClick={() => engine.resume()}
      >
        ▶
      </button>
      <button 
        aria-label="Pause"
        onClick={() => engine.pause()}
      >
        ⏸
      </button>
    </div>
  )
}
```

**Validation Criteria**:
- [ ] All UI component tests pass
- [ ] Device panels display correctly
- [ ] Simulation controls functional
- [ ] Messages display in correct order
- [ ] Time formatting works correctly

##### Step 1.6: Integration & Manual Testing (Day 7)
**Goal**: Wire everything together for end-to-end functionality

**Required Integration Tests**:
```typescript
// tests/integration/phase1.test.ts
describe('Phase 1 Integration', () => {
  test('complete two-device message flow', async () => {
    // Setup
    const engine = new SimulationEngine()
    const dbAlice = new DeviceDB('alice')
    const dbBob = new DeviceDB('bob') 
    const generatorAlice = new MessageGenerator('alice')  
    const generatorBob = new MessageGenerator('bob')
    
    await dbAlice.initialize()
    await dbBob.initialize()
    
    // Alice creates message
    const messageAlice = generatorAlice.createMessage('Hello from Alice', engine.currentSimTime()) 
    const aliceEventId = await dbAlice.insertEvent(messageAlice)
    
    engine.tick()
    
    // Bob creates message
    const messageBob = generatorBob.createMessage('Hello from Bob', engine.currentSimTime())
    const bobEventId = await dbBob.insertEvent(messageBob)
    
    // Verify isolation
    const eventsAlice = await dbAlice.getAllEvents()
    const eventsBob = await dbBob.getAllEvents()
    
    expect(eventsAlice).toHaveLength(1)
    expect(eventsBob).toHaveLength(1)
    expect(eventsAlice[0].device_id).toBe('alice')
    expect(eventsBob[0].device_id).toBe('bob')
    
    // Verify encryption/decryption works
    const decryptedAlice = generatorAlice.decryptMessage(eventsAlice[0])
    expect(decryptedAlice.content).toBe('Hello from Alice')
  })
  
  test('simulation engine event timeline works', async () => {
    const engine = new SimulationEngine()
    
    // Create pre-defined timeline
    engine.createMessageEvent('alice', 'First message', 1000)
    engine.createMessageEvent('bob', 'Reply', 2000)
    engine.createMessageEvent('alice', 'Thanks!', 3000)
    
    const timeline = engine.exportEventTimeline()
    expect(timeline.events).toHaveLength(3)
    expect(timeline.duration).toBe(3000)
    
    // Load into new engine for replay
    const engine2 = new SimulationEngine()
    engine2.loadEventTimeline(timeline.events)
    
    // Should be identical
    const timeline2 = engine2.exportEventTimeline()
    expect(timeline2).toEqual(timeline)
  })
  
  test('UI displays both devices correctly', async () => {
    // Full React app render test
    render(<App />)
    
    await waitFor(() => {
      expect(screen.getByText('Alice')).toBeInTheDocument()
      expect(screen.getByText('Bob')).toBeInTheDocument()
      expect(screen.getByLabelText('Play')).toBeInTheDocument()
    })
  })
})
```

**Manual Testing Checklist**:
- [ ] App loads without console errors
- [ ] Can see both Alice and Bob device panels
- [ ] Simulation time displays and updates
- [ ] Play/pause buttons work
- [ ] Can manually trigger message creation (button or automatic)
- [ ] Messages appear in correct device panels
- [ ] Messages stay isolated between devices
- [ ] Time advances when simulation running
- [ ] Event timeline save/load works for debugging

**Final Validation Criteria for Phase 1**:
- [ ] All unit tests pass (>95% coverage)
- [ ] All integration tests pass
- [ ] Manual testing checklist complete
- [ ] No console errors in browser
- [ ] Hot reload works for all components
- [ ] Two devices can independently create and store messages
- [ ] Simulation time management functional
- [ ] Basic UI displays all information correctly

**Deliverables**:
1. Working React app with hot reload
2. Simulation time engine with play/pause
3. Two isolated SQLite databases
4. Message event creation and storage
5. Basic UI showing device states
6. Comprehensive test suite (>95% coverage)
7. Manual testing validation

**What's explicitly NOT in Phase 1**:
- No network communication between devices
- No Bloom filters or sync protocol
- No file events (only text messages)
- No advanced UI controls or visualization
- No performance metrics collection
- No state export APIs

#### Phase 2: Sync Protocol (Week 3-4)
- Bloom filter implementation
- UDP transport layer
- Basic sync between 2 devices
- Sync status visualization

#### Phase 3: Rich Dashboard (Week 5-6)
- Full UI with all controls
- Network topology view
- Metrics collection
- Event generation sliders

#### Phase 4: Advanced Features (Week 7-8)
- Multi-device support (5+)
- File transfer simulation
- Network condition modeling
- Scenario save/load

#### Phase 5: Production Features (Week 9-10)
- Device inspector UI
- Client API simulation
- Performance profiling
- Comprehensive test suite

### 11. Database Architecture

Each device will have its own separate SQLite database file. This provides:
- **Clear isolation**: No cross-contamination between device states
- **Realistic performance**: Each database handles its own writes without artificial contention
- **Easy debugging**: Can inspect each device's database independently
- **Simple reset**: Can clear individual device states without affecting others

#### Event Structure
```typescript
interface Event {
  event_id: string          // hash(event_bytes)
  account_id: string        // Which account this belongs to
  device_id: string         // Which device created this
  simulation_ts: number     // When in simulation time
  wall_clock_ts: number     // When actually written (for perf analysis)
  encrypted: Blob           // Encrypted event payload
}
```

### 12. State Export System for Testing

To enable comprehensive testing by both humans and LLMs, the simulation provides multiple ways to inspect state:

#### HTTP API Endpoints
```typescript
// Full simulation state
GET /api/simulation/state
Response: {
  timestamp: number,
  devices: Map<deviceId, DeviceState>,
  network: NetworkState,
  metrics: MetricsSnapshot,
  recentEvents: Event[]
}

// Device-specific queries
GET /api/device/{id}/state
GET /api/device/{id}/sql?query=SELECT * FROM events
GET /api/device/{id}/export  // Full DB export

// Comparison tools
GET /api/compare/{deviceA}/{deviceB}
GET /api/network/status
GET /api/metrics/snapshot

// Test assertions
POST /api/test/assert
Body: {
  type: "sync_complete" | "event_order" | "performance",
  params: {...}
}
```

#### WebSocket Streaming
```typescript
// Real-time state changes
WS /api/simulation/stream
Messages: {
  type: "device_update" | "network_change" | "metric_update",
  data: {...}
}
```

This architecture ensures both visual dashboard users and programmatic testers have full visibility into the simulation state.

### 13. Technology Stack

- **Frontend**: React + TypeScript + Vite
- **UI Components**: Ant Design or Material-UI
- **Graphing**: D3.js for network topology, Recharts for metrics
- **State Management**: Zustand or Redux Toolkit
- **Database**: sql.js (SQLite in browser) - separate instance per device
- **Backend API**: Express.js for state export endpoints
- **Testing**: Vitest + React Testing Library + Cypress
- **Styling**: Tailwind CSS or styled-components 