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

#### Packet Signing & Verification
- **Ed25519 keypairs**: Generated per device on initialization
- **Public key exchange**: Simulated out-of-band exchange (all devices know each other's keys)
- **Packet signing**: All UDP packets (Bloom filters, messages) signed before transmission
- **Signature verification**: Packets dropped if signature invalid or from unknown device
- **Replay protection**: Timestamp checking with configurable tolerance window
- **Performance impact**: Measure CPU overhead of signing/verification

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

#### Phase 2: Bloom Filter Sync Protocol (Week 3-4) - Detailed Implementation Plan

**Goal**: Implement the core P2P synchronization mechanism using Bloom filters over simulated UDP, building on Phase 1's networking foundation.

**Core Concept**: Bloom filters advertise what each device HAS, not what they need. When Device A receives Device B's Bloom filter, A checks which of its own events are NOT in B's filter, and sends those events to B.

##### Understanding Bloom Filter Sync

**Key Principles**:
1. Each device maintains a cumulative Bloom filter of ALL events it has ever seen
2. Devices periodically broadcast their Bloom filter to peers (~500 bytes every 10 seconds)
3. Recipients check their local events against the received filter
4. Any local events that appear missing from the peer (test negative in their filter) are sent
5. Over time, devices build increasingly accurate pictures of what each peer has

**Critical UDP-Safe Design**:
- **No send history tracking** - UDP delivery is unreliable, so we can't assume sent = received
- **No duplicate suppression based on "already sent"** - instead rely purely on Bloom accuracy
- **Prioritized scanning strategy** - scan recent events frequently, older events less often
- **Convergence through repetition** - missed events caught in subsequent rounds

**Why This Works**:
- No explicit requests needed - the Bloom filter IS the implicit request
- Privacy preserved - you can't enumerate what's in a Bloom filter
- Tolerates false positives - worst case is we don't send something the peer needs
- Self-healing - next round will catch anything missed
- UDP-safe - no assumptions about packet delivery

##### Bloom Filter Sync Protocol Flow

```
DEVICE A (has events 1,2,3)          DEVICE B (has events 3,4,5)
━━━━━━━━━━━━━━━━━━━━━━━━━━━         ━━━━━━━━━━━━━━━━━━━━━━━━━━━

State: Initial
├─ Local events: [1,2,3]             ├─ Local events: [3,4,5]
├─ Bloom(A): {1,2,3}                 ├─ Bloom(B): {3,4,5}
└─ Peer states: empty                └─ Peer states: empty

Round 1: A → B
├─ A sends Bloom(A) to B ──────────→ B receives Bloom(A)
│                                    ├─ B saves: PeerBloom[A] = {1,2,3}
│                                    ├─ B checks its events against Bloom(A)
│                                    ├─ Event 3: in Bloom(A) ✓ (skip)
│                                    ├─ Event 4: not in Bloom(A) ✗ (send)
│                                    └─ Event 5: not in Bloom(A) ✗ (send)
│                                    
└─ A waiting...          ←────────── B sends events [4,5] to A

State after Round 1:
├─ Local events: [1,2,3,4,5]         ├─ Local events: [3,4,5]
├─ Bloom(A): {1,2,3,4,5} (updated)   ├─ Bloom(B): {3,4,5}
└─ PeerBloom[B]: empty               └─ PeerBloom[A]: {1,2,3}

Round 2: B → A  
├─ B sends Bloom(B) to A ──────────→ A receives Bloom(B)
├─ A saves: PeerBloom[B] = {3,4,5}   │
├─ A checks its events:              │
├─ Event 1: not in Bloom(B) ✗ (send) │
├─ Event 2: not in Bloom(B) ✗ (send) │
├─ Event 3: in Bloom(B) ✓ (skip)     │
├─ Event 4: in Bloom(B) ✓ (skip)     │
└─ Event 5: in Bloom(B) ✓ (skip)     │
                                     │
B receives events [1,2] ←──────────  └─ A sends events [1,2] to B

Final State: Converged!
├─ Local events: [1,2,3,4,5]         ├─ Local events: [1,2,3,4,5]
├─ Bloom(A): {1,2,3,4,5}             ├─ Bloom(B): {1,2,3,4,5}
└─ PeerBloom[B]: {3,4,5}             └─ PeerBloom[A]: {1,2,3,4,5}
```

##### Accumulating Peer Knowledge Over Time

Each device maintains:
1. **MyBloom**: A single Bloom filter containing ALL events I have
2. **PeerBlooms[deviceId]**: Cumulative knowledge of what each peer has

```typescript
// Peer knowledge accumulation example
class PeerKnowledge {
  private peerFilters: Map<string, AccumulatingBloomFilter> = new Map()
  
  updatePeerKnowledge(peerId: string, receivedFilter: BloomFilter) {
    if (!this.peerFilters.has(peerId)) {
      this.peerFilters.set(peerId, new AccumulatingBloomFilter())
    }
    
    // Merge new filter with accumulated knowledge
    // Uses OR operation on bit arrays to accumulate
    this.peerFilters.get(peerId)!.merge(receivedFilter)
  }
  
  shouldSendEvent(peerId: string, eventId: string): boolean {
    const peerFilter = this.peerFilters.get(peerId)
    if (!peerFilter) return true // No knowledge = send everything
    
    // Only send if peer's filter says they DON'T have it
    return !peerFilter.test(eventId)
  }
}
```

##### Scaling to Large Data (3GB) - UDP-Safe Approach

**Challenge**: How to represent millions of events in ~500 byte Bloom filters?

**Reality Check**: A 500-byte filter simply cannot accurately represent 6M events (3GB ÷ 500B chunks) at once. But that's okay!

**UDP-Safe Solution**: Cumulative Peer Knowledge
```
Single Filter Per Peer:
├─ Size: ~500 bytes (fixed, UDP-friendly)
├─ Expected items: ~10K recent events  
├─ False positive rate: ~1% (for recent events)
└─ Sent every 10 seconds

Key Insight: Accuracy comes from COMPOSITION over time, not larger filters
```

**How 500 Bytes Scales to 3GB**:

1. **Each filter represents ~10K recent events accurately**
2. **Over 100 sync rounds (16 minutes), we exchange 100 filters**  
3. **Cumulative knowledge builds on receiver side**
4. **Recent events get highest priority in scanning**
5. **Older events covered via round-robin over many rounds**

**Mathematics**:
- 500 bytes = 4000 bits
- For 10K items at 1% FPR: optimal
- For 100K items: ~10% FPR (acceptable for older events)
- For 1M+ items: High FPR, but round-robin scanning compensates

**Trade-offs**:
- ✅ UDP-safe packet sizes
- ✅ Recent events (most important) get best accuracy
- ✅ All events eventually covered via round-robin
- ⚠️ Older events may take many rounds to sync
- ⚠️ Some duplicate transmission due to false positives

##### Multi-Round Bloom Filter Composition

The key insight is that each individual Bloom filter provides partial information, but they compose on the receiver side to build increasingly accurate peer knowledge:

```
Round 1: Initial State
ALICE                           BOB
Events: [1,2,3,4,5]            Events: [3,4,5,6,7]
Bloom(A): {1,2,3,4,5}          Bloom(B): {3,4,5,6,7}
Knowledge of B: ∅              Knowledge of A: ∅

Round 1: A → B
Alice sends Bloom(A) ──────────→ Bob receives Bloom(A)
                                Bob's PeerKnowledge[A] = {1,2,3,4,5}
                                Bob checks: 6∉Bloom(A), 7∉Bloom(A)
Bob sends [6,7] ←──────────────  Bob sends missing events

Round 2: State After Bob's Send
ALICE                           BOB  
Events: [1,2,3,4,5,6,7]        Events: [3,4,5,6,7]
Bloom(A): {1,2,3,4,5,6,7}      Bloom(B): {3,4,5,6,7}
Knowledge of B: ∅              Knowledge of A: {1,2,3,4,5} (saved!)

Round 2: B → A  
Bob sends Bloom(B) ──────────→  Alice receives Bloom(B)
                               Alice's PeerKnowledge[B] = {3,4,5,6,7}
                               Alice checks: 1∉Bloom(B), 2∉Bloom(B)
Alice sends [1,2] ←─────────── Alice sends missing events

Round 3: Convergence Check
ALICE                           BOB
Events: [1,2,3,4,5,6,7]        Events: [1,2,3,4,5,6,7]  
Bloom(A): {1,2,3,4,5,6,7}      Bloom(B): {1,2,3,4,5,6,7}
Knowledge of B: {3,4,5,6,7}    Knowledge of A: {1,2,3,4,5,6,7}

Round 3: A → B (Updated Knowledge)
Alice sends Bloom(A) ──────────→ Bob receives Bloom(A)
                                Bob merges: PeerKnowledge[A] |= {1,2,3,4,5,6,7}
                                Bob checks against updated knowledge
                                Bob finds: All events covered!
No events sent ←─────────────── Bob sends nothing (fully synced)

KEY INSIGHT: Bob's knowledge of Alice improved from {1,2,3,4,5} to {1,2,3,4,5,6,7}
through accumulation, even though each individual Bloom filter was partial.
```

**Why This Works for Large Datasets**:

1. **Compositional Accuracy**: Each round adds to peer knowledge
2. **Recent Events Prioritized**: Most important data syncs first  
3. **Round-Robin Coverage**: All events eventually scanned
4. **UDP-Safe**: Every packet stays small and deliverable
5. **Self-Healing**: Missed packets caught in subsequent rounds

**Example with 100K Events**:
- Round 1: Bloom covers events 90K-100K accurately (recent)
- Round 2: Bloom covers events 90K-100K + some others (accumulated)  
- Round 10: Peer knowledge covers 50K-100K with high accuracy
- Round 50: Most events covered, round-robin filling gaps
- Round 100: Near-complete knowledge, only edge cases missing

##### Phase 2.1: Bloom Filter Implementation (Days 1-2)

**Objective**: Create Bloom filters that scale from small to large datasets

**Required Tests** (write first):
```typescript
// tests/sync/bloom-filter.test.ts
describe('BloomFilter', () => {
  test('creates UDP-safe filter with fixed 500-byte target', () => {
    // Standard filter for ~10K recent events
    const filter = BloomFilter.createOptimal(10000, 0.01)
    expect(filter.sizeInBytes()).toBeLessThan(500)
    expect(filter.sizeInBytes()).toBeGreaterThan(400) // Not too small
  })
  
  test('maintains ALL events ever seen in cumulative filter', () => {
    const bloom = new CumulativeBloomFilter()
    
    // Add many events over time
    for (let i = 0; i < 50000; i++) {
      bloom.add(`event-${i}`)
    }
    
    // All should still be present (may have false positives, but no false negatives)
    for (let i = 0; i < 50000; i++) {
      expect(bloom.test(`event-${i}`)).toBe(true)
    }
  })
  
  test('composes peer knowledge over multiple rounds', () => {
    const knowledge = new PeerKnowledge()
    
    // Round 1: Peer sends partial filter
    const round1 = new BloomFilter(10000, 0.01)
    round1.add('event-1')
    round1.add('event-2')
    knowledge.updatePeer('alice', round1)
    
    expect(knowledge.shouldSendEvent('alice', 'event-1')).toBe(false)
    expect(knowledge.shouldSendEvent('alice', 'event-3')).toBe(true)
    
    // Round 2: Peer sends updated filter with more events
    const round2 = new BloomFilter(10000, 0.01)
    round2.add('event-1') // Still has old events
    round2.add('event-2') 
    round2.add('event-3') // Plus new events
    round2.add('event-4')
    knowledge.updatePeer('alice', round2)
    
    // Knowledge should be cumulative (union of both rounds)
    expect(knowledge.shouldSendEvent('alice', 'event-1')).toBe(false)
    expect(knowledge.shouldSendEvent('alice', 'event-2')).toBe(false)
    expect(knowledge.shouldSendEvent('alice', 'event-3')).toBe(false)
    expect(knowledge.shouldSendEvent('alice', 'event-4')).toBe(false)
    expect(knowledge.shouldSendEvent('alice', 'event-5')).toBe(true)
  })
  
  test('handles degraded accuracy for large datasets gracefully', () => {
    const filter = new BloomFilter(10000, 0.01) // Optimized for 10K
    
    // Add way more events than optimal (100K events)
    for (let i = 0; i < 100000; i++) {
      filter.add(`event-${i}`)
    }
    
    // Should still work, but with higher false positive rate
    let falsePositives = 0
    for (let i = 100000; i < 101000; i++) { // Test 1000 unknown events
      if (filter.test(`unknown-${i}`)) {
        falsePositives++
      }
    }
    
    const fpRate = falsePositives / 1000
    expect(fpRate).toBeLessThan(0.5) // Should be <50% even when overloaded
    expect(fpRate).toBeGreaterThan(0.05) // But higher than optimal 1%
  })
  
  test('prioritized scanning focuses on recent events', () => {
    const scanQueue = new EventScanQueue()
    const now = Date.now()
    
    const events = [
      { event_id: 'old-1', created_at: now - 300000 },    // 5 min ago
      { event_id: 'old-2', created_at: now - 120000 },    // 2 min ago  
      { event_id: 'recent-1', created_at: now - 30000 },  // 30 sec ago
      { event_id: 'recent-2', created_at: now - 10000 },  // 10 sec ago
    ]
    
    scanQueue.updateFromDatabase(events)
    
    // Mock peer filter that has old events but not recent ones
    const peerFilter = new BloomFilter(1000, 0.01)
    peerFilter.add('old-1')
    peerFilter.add('old-2')
    
    const toSend = await scanQueue.getEventsToSend('peer', peerFilter, {
      recentEventsBatch: 10,
      olderEventsBatch: 2,
      maxEventsPerRound: 5
    })
    
    // Should prioritize recent events
    expect(toSend.map(e => e.event_id)).toContain('recent-1')
    expect(toSend.map(e => e.event_id)).toContain('recent-2')
    expect(toSend.length).toBeLessThanOrEqual(5)
  })
})
```

**Implementation**:
```typescript
// src/sync/bloom-filter.ts
export class BloomFilter {
  private bits: Uint8Array
  private bitSize: number
  private hashCount: number
  
  constructor(expectedItems: number, falsePositiveRate: number) {
    // Calculate optimal parameters
    this.bitSize = Math.ceil(
      -expectedItems * Math.log(falsePositiveRate) / (Math.log(2) ** 2)
    )
    this.hashCount = Math.ceil(
      this.bitSize / expectedItems * Math.log(2)
    )
    this.bits = new Uint8Array(Math.ceil(this.bitSize / 8))
  }
  
  static createOptimal(expectedItems: number, targetFPR: number): BloomFilter {
    return new BloomFilter(expectedItems, targetFPR)
  }
  
  add(item: string): void {
    const hashes = this.getHashes(item)
    for (const hash of hashes) {
      const bitIndex = hash % this.bitSize
      const byteIndex = Math.floor(bitIndex / 8)
      const bitOffset = bitIndex % 8
      this.bits[byteIndex] |= (1 << bitOffset)
    }
  }
  
  test(item: string): boolean {
    const hashes = this.getHashes(item)
    return hashes.every(hash => {
      const bitIndex = hash % this.bitSize
      const byteIndex = Math.floor(bitIndex / 8)
      const bitOffset = bitIndex % 8
      return (this.bits[byteIndex] & (1 << bitOffset)) !== 0
    })
  }
  
  // Merge two filters with OR operation
  static merge(filter1: BloomFilter, filter2: BloomFilter): BloomFilter {
    if (filter1.bitSize !== filter2.bitSize) {
      throw new Error('Cannot merge filters of different sizes')
    }
    
    const merged = new BloomFilter(0, 0) // Create empty
    merged.bitSize = filter1.bitSize
    merged.hashCount = filter1.hashCount
    merged.bits = new Uint8Array(filter1.bits.length)
    
    // OR the bit arrays
    for (let i = 0; i < filter1.bits.length; i++) {
      merged.bits[i] = filter1.bits[i] | filter2.bits[i]
    }
    
    return merged
  }
  
  sizeInBytes(): number {
    return this.bits.length
  }
  
  serialize(): Uint8Array {
    // Format: [version:1][bitSize:4][hashCount:1][bits:variable]
    const result = new Uint8Array(6 + this.bits.length)
    result[0] = 1 // version
    new DataView(result.buffer).setUint32(1, this.bitSize, true)
    result[5] = this.hashCount
    result.set(this.bits, 6)
    return result
  }
  
  static deserialize(data: Uint8Array): BloomFilter {
    const version = data[0]
    if (version !== 1) throw new Error('Unsupported version')
    
    const bitSize = new DataView(data.buffer).getUint32(1, true)
    const hashCount = data[5]
    const bits = data.slice(6)
    
    const filter = new BloomFilter(0, 0) // Create empty
    filter.bitSize = bitSize
    filter.hashCount = hashCount
    filter.bits = new Uint8Array(bits)
    
    return filter
  }
  
  private getHashes(item: string): number[] {
    // Use double hashing with SHA-256
    const hash1 = this.hash(item + ':1')
    const hash2 = this.hash(item + ':2')
    
    const hashes: number[] = []
    for (let i = 0; i < this.hashCount; i++) {
      hashes.push((hash1 + i * hash2) >>> 0) // Ensure positive
    }
    return hashes
  }
  
  private hash(str: string): number {
    // Simple hash for demo - in production use crypto.subtle
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }
}

// Cumulative filter that never forgets
export class CumulativeBloomFilter {
  private filters: BloomFilter[] = []
  private currentFilter: BloomFilter
  private eventCount = 0
  
  constructor() {
    this.currentFilter = BloomFilter.createOptimal(10000, 0.01)
    this.filters.push(this.currentFilter)
  }
  
  add(eventId: string): void {
    this.currentFilter.add(eventId)
    this.eventCount++
    
    // Grow filter if getting full (estimated >80% capacity)
    if (this.eventCount > this.filters.length * 8000) {
      // Create new larger filter
      const newSize = this.filters.length * 10000 * 10
      this.currentFilter = BloomFilter.createOptimal(newSize, 0.01)
      this.filters.push(this.currentFilter)
    }
  }
  
  test(eventId: string): boolean {
    // Check all historical filters
    return this.filters.some(filter => filter.test(eventId))
  }
  
  // Get appropriate filter for wire transmission
  getFilterForTransmission(level: 'recent' | 'medium' | 'full'): BloomFilter {
    switch(level) {
      case 'recent':
        return this.filters[this.filters.length - 1] // Most recent
      case 'medium':
        // Merge last few filters
        if (this.filters.length <= 3) return this.getMergedFilter()
        return this.filters.slice(-3).reduce(BloomFilter.merge)
      case 'full':
        return this.getMergedFilter() // All filters merged
    }
  }
  
  private getMergedFilter(): BloomFilter {
    return this.filters.reduce(BloomFilter.merge)
  }
}

// Tracks what we know about each peer
export class PeerKnowledge {
  private peerFilters: Map<string, CumulativeBloomFilter> = new Map()
  
  updatePeer(peerId: string, receivedFilter: BloomFilter): void {
    if (!this.peerFilters.has(peerId)) {
      this.peerFilters.set(peerId, new CumulativeBloomFilter())
    }
    
    // Add all bits from received filter to our knowledge
    // In practice, we'd merge the bit arrays directly
    // This is simplified for clarity
  }
  
  shouldSendEvent(peerId: string, eventId: string): boolean {
    const peerFilter = this.peerFilters.get(peerId)
    if (!peerFilter) return true // No knowledge = send everything
    
    // Only send if peer's filter says they DON'T have it
    return !peerFilter.test(eventId)
  }
  
  getPeerSyncEstimate(peerId: string, totalEvents: number): number {
    // Estimate based on filter density
    // This is approximate but useful for UI
    return 0 // TODO: Implement density estimation
  }
}
```

##### Phase 2.2: Sync Protocol Engine (Days 3-4)

**Objective**: Implement the protocol that uses Bloom filters to achieve eventual consistency

**Required Tests**:
```typescript
// tests/sync/protocol.test.ts
describe('SyncProtocol', () => {
  test('sends bloom filter to peers', async () => {
    const deviceA = new SyncProtocol('alice', networkSimulator, dbAlice)
    
    // Add some events to A
    await dbAlice.insertEvent(createTestEvent('event-1'))
    await dbAlice.insertEvent(createTestEvent('event-2'))
    deviceA.updateLocalBloom()
    
    // Send bloom filter
    await deviceA.sendBloomFilter('bob')
    
    const networkEvents = networkSimulator.getNetworkEvents()
    const bloomEvent = networkEvents.find(e => 
      e.type === 'bloom_filter' && e.sourceDevice === 'alice'
    )
    
    expect(bloomEvent).toBeDefined()
    expect(bloomEvent.payload.filterType).toBe('recent')
    expect(bloomEvent.payload.eventCount).toBe(2)
  })
  
  test('responds to bloom filter by sending missing events', async () => {
    const deviceA = new SyncProtocol('alice', networkSimulator, dbAlice)
    const deviceB = new SyncProtocol('bob', networkSimulator, dbBob)
    
    // A has events 1,2,3
    await dbAlice.insertEvent(createTestEvent('event-1'))
    await dbAlice.insertEvent(createTestEvent('event-2'))
    await dbAlice.insertEvent(createTestEvent('event-3'))
    deviceA.updateLocalBloom()
    
    // B has events 2,3,4
    await dbBob.insertEvent(createTestEvent('event-2'))
    await dbBob.insertEvent(createTestEvent('event-3'))
    await dbBob.insertEvent(createTestEvent('event-4'))
    deviceB.updateLocalBloom()
    
    // A sends bloom to B
    await deviceA.sendBloomFilter('bob')
    await networkSimulator.tick(100)
    
    // B should send event-4 to A (not in A's bloom)
    const eventTransfers = networkSimulator.getNetworkEvents()
      .filter(e => e.type === 'message' && e.sourceDevice === 'bob')
    
    expect(eventTransfers.length).toBe(1)
    expect(eventTransfers[0].payload.eventId).toBe('event-4')
  })
  
  test('accumulates peer knowledge over multiple rounds', async () => {
    const deviceA = new SyncProtocol('alice', networkSimulator, dbAlice)
    const deviceB = new SyncProtocol('bob', networkSimulator, dbBob)
    
    // Round 1: B has event-1
    await dbBob.insertEvent(createTestEvent('event-1'))
    deviceB.updateLocalBloom()
    await deviceB.sendBloomFilter('alice')
    await networkSimulator.tick(100)
    
    // A should know B has event-1
    expect(deviceA.peerHasEvent('bob', 'event-1')).toBe(true)
    
    // Round 2: B gets event-2
    await dbBob.insertEvent(createTestEvent('event-2'))
    deviceB.updateLocalBloom()
    await deviceB.sendBloomFilter('alice')
    await networkSimulator.tick(100)
    
    // A should know B has both events
    expect(deviceA.peerHasEvent('bob', 'event-1')).toBe(true)
    expect(deviceA.peerHasEvent('bob', 'event-2')).toBe(true)
  })
  
  test('achieves convergence through bloom sync', async () => {
    const deviceA = new SyncProtocol('alice', networkSimulator, dbAlice)
    const deviceB = new SyncProtocol('bob', networkSimulator, dbBob)
    
    // A has events 1,2,3
    for (let i = 1; i <= 3; i++) {
      await dbAlice.insertEvent(createTestEvent(`event-${i}`))
    }
    
    // B has events 3,4,5
    for (let i = 3; i <= 5; i++) {
      await dbBob.insertEvent(createTestEvent(`event-${i}`))
    }
    
    // Run sync rounds
    for (let round = 0; round < 5; round++) {
      deviceA.updateLocalBloom()
      deviceB.updateLocalBloom()
      
      await deviceA.sendBloomFilter('bob')
      await deviceB.sendBloomFilter('alice')
      await networkSimulator.tick(200)
    }
    
    // Both should have all 5 events
    const eventsA = await dbAlice.getAllEvents()
    const eventsB = await dbBob.getAllEvents()
    
    expect(eventsA.length).toBe(5)
    expect(eventsB.length).toBe(5)
  })
  
  test('handles large datasets with graceful degradation', async () => {
    const deviceA = new SyncProtocol('alice', networkSimulator, dbAlice)
    const deviceB = new SyncProtocol('bob', networkSimulator, dbBob)
    
    // Add many events to test scaling
    for (let i = 0; i < 25000; i++) {
      await dbAlice.insertEvent(createTestEvent(`event-${i}`))
    }
    deviceA.updateLocalBloom()
    
    // Single 500-byte filter should handle large dataset
    await deviceA.sendBloomFilter('bob')
    const sent = networkSimulator.getNetworkEvents().slice(-1)[0]
    expect(sent.payload.filterSize).toBeLessThan(500)
    
    // Should still trigger event transmission despite imperfect accuracy
    await networkSimulator.tick(100)
    const eventTransfers = networkSimulator.getNetworkEvents()
      .filter(e => e.type === 'message' && e.sourceDevice === 'alice')
    
    // With degraded accuracy, should still send some events
    expect(eventTransfers.length).toBeGreaterThan(0)
    expect(eventTransfers.length).toBeLessThan(500) // But not everything due to FP
  })
  
  test('composes knowledge over multiple sync rounds', async () => {
    const deviceA = new SyncProtocol('alice', networkSimulator, dbAlice)
    const deviceB = new SyncProtocol('bob', networkSimulator, dbBob)
    
    // A has some events, B has others
    for (let i = 0; i < 100; i++) {
      if (i < 60) await dbAlice.insertEvent(createTestEvent(`event-${i}`))
      if (i >= 40) await dbBob.insertEvent(createTestEvent(`event-${i}`))
    }
    
    // Run multiple sync rounds
    for (let round = 0; round < 10; round++) {
      deviceA.updateLocalBloom()
      deviceB.updateLocalBloom()
      
      await deviceA.sendBloomFilter('bob')
      await deviceB.sendBloomFilter('alice')
      await networkSimulator.tick(100)
    }
    
    // After multiple rounds, should achieve convergence
    const eventsA = await dbAlice.getAllEvents()
    const eventsB = await dbBob.getAllEvents()
    
    // Should be much closer to full convergence
    expect(Math.abs(eventsA.length - eventsB.length)).toBeLessThan(10)
  })
})
```

**Implementation**:
```typescript
// src/sync/protocol.ts
export class SyncProtocol {
  private myBloom: CumulativeBloomFilter
  private peerKnowledge: PeerKnowledge
  private lastSyncTimes: Map<string, { recent: number, medium: number, full: number }>
  private scanQueue: EventScanQueue // Prioritized queue for efficient scanning
  
  constructor(
    private deviceId: string,
    private network: NetworkSimulator,
    private database: DeviceDB
  ) {
    this.myBloom = new CumulativeBloomFilter()
    this.peerKnowledge = new PeerKnowledge()
    this.lastSyncTimes = new Map()
    this.scanQueue = new EventScanQueue()
    this.setupNetworkHandlers()
  }
  
  async updateLocalBloom(): Promise<void> {
    // Add all local events to bloom filter
    const events = await this.database.getAllEvents()
    for (const event of events) {
      this.myBloom.add(event.event_id)
    }
    
    // Update scan queue with new events
    this.scanQueue.updateFromDatabase(events)
  }
  
  async sendBloomFilter(targetDevice: string, filterType: 'recent' | 'medium' | 'full' = 'recent'): Promise<void> {
    const filter = this.myBloom.getFilterForTransmission(filterType)
    const serialized = filter.serialize()
    
    this.network.sendEvent(this.deviceId, targetDevice, 'bloom_filter', {
      filter: Array.from(serialized), // Convert for network
      filterType,
      filterSize: serialized.length,
      eventCount: await this.database.getEventCount(),
      timestamp: this.network.getCurrentTime()
    })
    
    // Update last sync time
    if (!this.lastSyncTimes.has(targetDevice)) {
      this.lastSyncTimes.set(targetDevice, { recent: 0, medium: 0, full: 0 })
    }
    this.lastSyncTimes.get(targetDevice)![filterType] = this.network.getCurrentTime()
  }
  
  private setupNetworkHandlers(): void {
    this.network.onNetworkEvent(async (event) => {
      if (event.targetDevice !== this.deviceId) return
      if (event.status !== 'delivered') return
      
      switch (event.type) {
        case 'bloom_filter':
          await this.handleBloomFilter(event)
          break
        case 'message':
          // Store received events
          if (event.payload.encrypted) {
            await this.handleReceivedEvent(event)
          }
          break
      }
    })
  }
  
  private async handleBloomFilter(event: NetworkEvent): Promise<void> {
    const peerFilter = BloomFilter.deserialize(new Uint8Array(event.payload.filter))
    const peerId = event.sourceDevice
    
    // Update our knowledge of what peer has
    this.peerKnowledge.updatePeer(peerId, peerFilter)
    
    // Use prioritized scanning instead of full scan
    // Recent events first, then older events
    const eventsToSend = await this.scanQueue.getEventsToSend(peerId, peerFilter, {
      recentEventsBatch: 50,     // Check last 50 events first
      olderEventsBatch: 10,      // Then check 10 older events  
      maxEventsPerRound: 20      // Don't overwhelm UDP
    })
    
    // Send missing events (UDP-sized batches)
    for (const event of eventsToSend) {
      this.network.sendEvent(this.deviceId, peerId, 'message', {
        eventId: event.event_id,
        encrypted: Array.from(event.encrypted),
        createdAt: event.created_at,
        deviceId: event.device_id
      })
      
      // Small delay to avoid UDP flooding
      await new Promise(resolve => setTimeout(resolve, 5))
    }
  }
  
  private async handleReceivedEvent(networkEvent: NetworkEvent): Promise<void> {
    const eventData = networkEvent.payload
    
    // Check if we already have this event
    const eventId = await this.database.computeEventId(new Uint8Array(eventData.encrypted))
    const existing = await this.database.getEvent(eventId)
    
    if (!existing) {
      // Store new event
      await this.database.insertEvent({
        device_id: eventData.deviceId,
        created_at: eventData.createdAt,
        received_at: this.network.getCurrentTime(),
        encrypted: new Uint8Array(eventData.encrypted)
      })
      
      // Update our bloom filter
      this.myBloom.add(eventId)
    }
  }
  
  peerHasEvent(peerId: string, eventId: string): boolean {
    // Check our accumulated knowledge of peer
    return !this.peerKnowledge.shouldSendEvent(peerId, eventId)
  }
  
  // Determine which bloom filter level to send based on time
  shouldSendBloomLevel(peerId: string): 'recent' | 'medium' | 'full' | null {
    const now = this.network.getCurrentTime()
    const lastSync = this.lastSyncTimes.get(peerId) || { recent: 0, medium: 0, full: 0 }
    
    // Send different levels at different frequencies
    if (now - lastSync.full > 600000) return 'full'      // Every 10 min
    if (now - lastSync.medium > 60000) return 'medium'   // Every 1 min
    if (now - lastSync.recent > 10000) return 'recent'   // Every 10 sec
    
    return null
  }
  
  getSyncStatus(): { syncPercentage: number, knownEvents: number, totalEvents: number } {
    // This would be calculated based on network-wide knowledge
    // For now, simplified
    return {
      syncPercentage: 100,
      knownEvents: this.myBloom.getEventCount(),
      totalEvents: this.network.getTotalEventCount()
    }
  }
}

// Prioritized event scanning for UDP-safe sync
class EventScanQueue {
  private recentEvents: Event[] = []
  private olderEventsCursor = 0
  private lastUpdateTime = 0
  
  updateFromDatabase(events: Event[]): void {
    const now = Date.now()
    
    // Recent events = last 1 minute, scanned every round
    this.recentEvents = events.filter(e => 
      (now - e.created_at) < 60000
    ).sort((a, b) => b.created_at - a.created_at) // Newest first
    
    this.lastUpdateTime = now
  }
  
  async getEventsToSend(
    peerId: string, 
    peerFilter: BloomFilter,
    options: {
      recentEventsBatch: number
      olderEventsBatch: number  
      maxEventsPerRound: number
    }
  ): Promise<Event[]> {
    const eventsToSend: Event[] = []
    
    // 1. Always check recent events first
    for (const event of this.recentEvents.slice(0, options.recentEventsBatch)) {
      if (!peerFilter.test(event.event_id)) {
        eventsToSend.push(event)
        if (eventsToSend.length >= options.maxEventsPerRound) break
      }
    }
    
    // 2. Round-robin through older events if we have room
    if (eventsToSend.length < options.maxEventsPerRound) {
      const allEvents = await this.database.getAllEvents()
      const olderEvents = allEvents.filter(e => !this.recentEvents.includes(e))
      
      // Continue from where we left off last time
      for (let i = 0; i < options.olderEventsBatch && eventsToSend.length < options.maxEventsPerRound; i++) {
        const index = (this.olderEventsCursor + i) % olderEvents.length
        const event = olderEvents[index]
        
        if (event && !peerFilter.test(event.event_id)) {
          eventsToSend.push(event)
        }
      }
      
      // Advance cursor for next round
      this.olderEventsCursor = (this.olderEventsCursor + options.olderEventsBatch) % olderEvents.length
    }
    
    return eventsToSend
  }
}
```

##### Phase 2.3: Integration with Existing Systems (Day 5)

**Objective**: Connect sync protocol to Phase 1's simulation engine and UI

**Required Changes**:
```typescript
// src/simulation/engine.ts - Enhanced for Bloom sync
export class SimulationEngine {
  private syncProtocols: Map<string, SyncProtocol> = new Map()
  private syncIntervalId: number | null = null
  
  async initializeSync(): Promise<void> {
    // Create sync protocols for each device
    for (const deviceId of ['alice', 'bob']) {
      const protocol = new SyncProtocol(
        deviceId, 
        this.networkSimulator,
        this.deviceDatabases.get(deviceId)!
      )
      this.syncProtocols.set(deviceId, protocol)
    }
    
    // Start periodic sync
    this.startPeriodicSync()
  }
  
  private startPeriodicSync(): void {
    // Check every second for sync opportunities
    this.syncIntervalId = setInterval(async () => {
      if (!this.isRunning) return
      
      for (const [deviceId, protocol] of this.syncProtocols) {
        // Update local bloom with any new events
        await protocol.updateLocalBloom()
        
        // Check which peers need which level of sync
        const peers = Array.from(this.syncProtocols.keys()).filter(id => id !== deviceId)
        
        for (const peerId of peers) {
          const level = protocol.shouldSendBloomLevel(peerId)
          if (level) {
            await protocol.sendBloomFilter(peerId, level)
          }
        }
      }
    }, 1000) // Check every second
  }
  
  onEventExecute(event: SimulationEvent): void {
    super.onEventExecute(event)
    
    // When a device creates a new event, update its bloom
    if (event.type === 'message') {
      const protocol = this.syncProtocols.get(event.deviceId)
      if (protocol) {
        // The bloom will be updated on next sync cycle
        this.networkSimulator.updateTotalEventCount(this.getTotalEventCount())
      }
    }
  }
  
  getDeviceSyncStatus(): Map<string, SyncStatus> {
    const status = new Map()
    const totalEvents = this.getTotalEventCount()
    
    for (const [deviceId, db] of this.deviceDatabases) {
      const eventCount = db.getEventCount()
      const syncPercentage = totalEvents > 0 ? (eventCount / totalEvents) * 100 : 100
      
      status.set(deviceId, {
        isSynced: syncPercentage >= 95,
        syncPercentage,
        knownEvents: eventCount,
        totalEvents
      })
    }
    
    return status
  }
  
  shutdown(): void {
    if (this.syncIntervalId) {
      clearInterval(this.syncIntervalId)
    }
    super.shutdown()
  }
}
```

##### Phase 2.4: Enhanced Network Event Visualization (Day 6)

**Objective**: Update the network event log to show Bloom sync activity

**Enhanced Network Event Types**:
- `bloom_filter`: Filter advertisement (includes size, type, event count)
- `message`: Event transmission triggered by Bloom sync
- `sync_stats`: Periodic sync status updates

**Updated NetworkEventLog Component**:
```typescript
// Enhanced to show Bloom filter details
const BloomFilterEventDisplay = ({ event }: { event: NetworkEvent }) => {
  const { filterType, filterSize, eventCount } = event.payload
  
  return (
    <div className="bloom-event">
      <div className="event-header">
        <span className="bloom-icon">🌸</span>
        <span className="event-title">Bloom Filter ({filterType})</span>
        <span className="event-meta">{filterSize} bytes</span>
      </div>
      <div className="event-details">
        Advertising {eventCount} events to {event.targetDevice}
      </div>
    </div>
  )
}
```

**Enhanced Chat Interface Sync Indicators**:
```typescript
// src/components/ChatInterface.tsx - Enhanced sync display
const SyncStatusDisplay = ({ syncStatus }: { syncStatus: SyncStatus }) => {
  const getStatusColor = () => {
    if (syncStatus.syncPercentage >= 95) return '#28a745' // Green
    if (syncStatus.syncPercentage >= 80) return '#ffc107' // Yellow  
    return '#dc3545' // Red
  }
  
  return (
    <div className="sync-status-enhanced">
      <div className="sync-indicator">
        <div 
          className="sync-dot" 
          style={{ backgroundColor: getStatusColor() }}
        />
        <span className="sync-label">
          {syncStatus.isSynced ? 'Synced' : 'Syncing'} 
          ({syncStatus.syncPercentage.toFixed(1)}%)
        </span>
      </div>
      <div className="sync-details">
        {syncStatus.knownEvents} / {syncStatus.totalEvents} events
      </div>
    </div>
  )
}
```

##### Phase 2.5: Demo Scenarios & Testing (Day 7)

**Built-in Bloom Sync Scenarios**:

1. **Perfect Sync**: 
   - Network: 0% loss, 10ms latency
   - Events: Steady 1 msg/min from each device
   - Expected: >99% sync within 30 seconds
   
2. **Lossy Network**:
   - Network: 20% packet loss, 100ms latency
   - Events: 2 msgs/min mixed between devices
   - Expected: >90% sync, visible retries
   
3. **Burst & Catch-up**:
   - Scenario: Alice sends 10 messages quickly, then stops
   - Network: 5% loss, 50ms latency
   - Expected: Bob catches up via Bloom sync within 60s
   
4. **Large Dataset**:
   - Pre-populate: 500 events split randomly
   - Network: 1% loss, realistic conditions
   - Expected: Full convergence, efficient bandwidth usage
   
5. **Hierarchical Filters**:
   - Long-running: 1000+ events over time
   - Observe: Recent/Medium/Full filter transmissions
   - Verify: Filter sizes stay within bounds

**Integration Test Framework**:
```typescript
// tests/scenarios/bloom-sync-scenarios.test.ts
class BloomSyncScenario {
  constructor(
    private devices: string[],
    private networkConfig: NetworkConfig,
    private eventConfig: EventConfig
  ) {}
  
  async run(durationMs: number): Promise<SyncResults> {
    // Setup devices with databases
    // Run simulation with Bloom sync enabled
    // Collect metrics throughout
    // Return convergence analysis
  }
  
  getMetrics(): BloomSyncMetrics {
    return {
      convergenceTime: number,
      finalSyncPercentage: number,
      bloomFiltersSent: number,
      averageFilterSize: number,
      falsePositiveRate: number,
      bandwidthEfficiency: number,
      duplicateEvents: number
    }
  }
}
```

**Performance Validation**:
- Two devices converge in <60s under ideal conditions
- 90%+ sync achieved with 20% packet loss
- Bloom filters stay under size limits (2KB/200KB/2MB)
- False positive rate <5% for large datasets
- No duplicate events in final databases
- Bandwidth usage <5x raw message data

##### Phase 2.6: Success Criteria & Next Steps

##### Modular Sync Strategy Design

**Important**: This Bloom filter approach is Strategy #1. The simulation should support pluggable sync strategies to enable experimentation and comparison.

**Sync Strategy Interface**:
```typescript
interface SyncStrategy {
  name: string
  description: string
  
  // Initialize strategy for a device
  initialize(deviceId: string, network: NetworkSimulator, database: DeviceDB): void
  
  // Handle incoming network events
  handleNetworkEvent(event: NetworkEvent): Promise<void>
  
  // Periodic sync opportunity (called every second)
  onSyncTick(): Promise<void>
  
  // Get sync status for UI
  getSyncStatus(): SyncStatus
  
  // Cleanup
  shutdown(): void
}
```

**Planned Strategies**:
1. **Bloom Filter Sync** (Phase 2) - Compositional accuracy via small filters
2. **Gossip Sync** (Future) - Epidemic-style random peer selection
3. **Want-List Sync** (Future) - Explicit missing event requests
4. **Hybrid Sync** (Future) - Bloom + occasional want-lists for critical events

**Implementation Structure**:
```
src/sync/
├── strategies/
│   ├── BloomFilterStrategy.ts
│   ├── GossipStrategy.ts (future)
│   └── WantListStrategy.ts (future)
├── SyncStrategy.interface.ts
└── SyncManager.ts (orchestrates strategy switching)
```

This modularity enables A/B testing of sync approaches within the same simulation environment.

**Phase 2 Completion Criteria**:
- [ ] Modular SyncStrategy interface implemented
- [ ] BloomFilterStrategy as first concrete implementation
- [ ] CumulativeBloomFilter handles 50K+ events with graceful degradation
- [ ] PeerKnowledge accumulates accurately over multiple rounds
- [ ] SyncProtocol achieves convergence between Alice & Bob via composition
- [ ] Fixed 500-byte filters maintain UDP compatibility
- [ ] Prioritized scanning focuses on recent events first
- [ ] Round-robin scanning ensures older events eventually covered
- [ ] Network event log shows Bloom filter activity
- [ ] Sync status displays real progress in chat interfaces
- [ ] Multi-round convergence scenarios pass
- [ ] False positive rates degrade gracefully with large datasets
- [ ] No assumptions about UDP packet delivery
- [ ] Easy to swap sync strategies in simulation

**Key Learnings for Phase 3**:
- How false positive rates affect sync efficiency
- Optimal timing for different filter levels
- Bandwidth vs. convergence time trade-offs
- Impact of packet loss on Bloom sync reliability

**Phase 2 Deliverables**:
1. Complete Bloom filter implementation with optimal sizing
2. Peer-to-peer sync protocol using filter advertisements
3. Cumulative peer knowledge that improves over time
4. Hierarchical filter system for large datasets
5. Enhanced UI showing sync progress and filter activity
6. Comprehensive test suite validating sync behavior
7. Demo scenarios showcasing different network conditions

**Architecture Summary**:
```
┌─────────────────┐    ┌─────────────────┐
│ Device A        │    │ Device B        │
├─ SQLite DB     │    ├─ SQLite DB     │
├─ Cumulative    │    ├─ Cumulative    │
│  BloomFilter    │◄──►│  BloomFilter    │
├─ PeerKnowledge │    ├─ PeerKnowledge │
└─ SyncProtocol  │    └─ SyncProtocol  │
     │                       │
     └───── Network Sim ─────┘
            (UDP packets)
```

This establishes the foundation for multi-device sync in Phase 3, where we'll extend from 2 to N devices and add more sophisticated network topologies.

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

### 14. Local-First Architecture with Per-Device Backends

#### Current Problem Diagnosis

The current implementation has fundamental architectural issues:
1. **Browser crypto for messages**: `MessageGenerator` uses crypto operations in browser
2. **Browser crypto for files**: `FileHandler` uses Node.js crypto, causing import errors
3. **No proper backend**: Everything runs in browser, which is insecure and impractical

**Key Insight**: Each device runs its own Node-based backend bound to 127.0.0.1:
- All clear-text originates and terminates on the same device
- Inter-device traffic is encrypted blobs only
- Browser connects only to localhost backend
- This preserves local-first security model

#### Correct Architecture

```
┌─────────────────────────┐     ┌─────────────────────────┐
│   Browser (React UI)    │     │   Browser (React UI)    │
│  Device A - Alice       │     │  Device B - Bob         │
├─────────────────────────┤     ├─────────────────────────┤
│ - Display messages      │     │ - Display messages      │
│ - Send button clicks    │     │ - Send button clicks    │
│ - Show sync status      │     │ - Show sync status      │
│ - Upload file UI        │     │ - Upload file UI        │
│ - NO CRYPTO            │     │ - NO CRYPTO            │
└───────────┬─────────────┘     └───────────┬─────────────┘
            │                                 │
            │   HTTP/WebSocket API           │
            ▼                                 ▼
┌─────────────────────────────────────────────────────────┐
│                   Node.js Backend                       │
├─────────────────────────────────────────────────────────┤
│ - ALL encryption/decryption (messages & files)         │
│ - Device SQLite databases (alice.db, bob.db)           │
│ - Bloom filter computation and exchange                │
│ - P2P sync protocol implementation                     │
│ - File chunking and reassembly                         │
│ - Event routing between devices                        │
└─────────────────────────────────────────────────────────┘
```

#### API Design (Like Telegram's MTProto)

**Client → Server API**:
```typescript
// Send a message
POST /api/devices/:deviceId/messages
Body: { content: string, attachments?: File[] }
Response: { messageId: string, timestamp: number }

// Get messages (with long polling for real-time)
GET /api/devices/:deviceId/messages?since=timestamp
Response: { messages: DecryptedMessage[] }

// Upload file for attachment
POST /api/devices/:deviceId/files/upload
Body: multipart/form-data
Response: { fileId: string, chunks: number }

// Download file
GET /api/devices/:deviceId/files/:fileId
Response: Decrypted file data

// Get sync status
GET /api/devices/:deviceId/sync/status
Response: { syncPercentage: number, knownEvents: number }
```

**Server Internal Operations**:
1. Receive plain text message from client
2. Create event payload, encrypt with PSK
3. Store in device's SQLite database
4. Update Bloom filter
5. Trigger P2P sync with other devices
6. When receiving events from peers, decrypt and make available to client

#### Implementation Plan

##### Step 1: Create Node.js Backend Structure
```
backend/
├── src/
│   ├── api/
│   │   ├── deviceRoutes.ts    # REST endpoints
│   │   ├── messageRoutes.ts   # Message handling
│   │   └── fileRoutes.ts      # File operations
│   ├── crypto/
│   │   ├── messageEncryption.ts # Message AEAD
│   │   ├── fileEncryption.ts    # File chunking
│   │   └── keys.ts              # PSK management
│   ├── storage/
│   │   ├── DeviceDB.ts         # SQLite per device
│   │   └── EventStore.ts       # Event management
│   ├── sync/
│   │   ├── BloomFilter.ts      # Bloom operations
│   │   ├── SyncManager.ts      # P2P protocol
│   │   └── NetworkSim.ts       # UDP simulation
│   └── index.ts                # Express server
├── data/
│   ├── alice.db                # Alice's SQLite
│   └── bob.db                  # Bob's SQLite
└── package.json
```

##### Step 2: Refactor Frontend to be Display-Only
```typescript
// frontend/src/api/DeviceAPI.ts
export class DeviceAPI {
  constructor(private deviceId: string, private baseURL: string) {}

  async sendMessage(content: string): Promise<void> {
    await fetch(`${this.baseURL}/api/devices/${this.deviceId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content })
    })
  }

  async getMessages(since?: number): Promise<Message[]> {
    const res = await fetch(`${this.baseURL}/api/devices/${this.deviceId}/messages?since=${since}`)
    return res.json()
  }

  async uploadFile(file: File): Promise<string> {
    const formData = new FormData()
    formData.append('file', file)
    const res = await fetch(`${this.baseURL}/api/devices/${this.deviceId}/files/upload`, {
      method: 'POST',
      body: formData
    })
    return res.json().fileId
  }

  // WebSocket for real-time updates
  connectRealtime(): WebSocket {
    return new WebSocket(`${this.baseURL.replace('http', 'ws')}/api/devices/${this.deviceId}/stream`)
  }
}
```

##### Step 3: Backend Handles Everything
```typescript
// backend/src/api/messageRoutes.ts
app.post('/api/devices/:deviceId/messages', async (req, res) => {
  const { deviceId } = req.params
  const { content } = req.body
  
  // 1. Get device's encryption context
  const device = deviceManager.get(deviceId)
  
  // 2. Create and encrypt event
  const event = await device.createMessageEvent(content)
  
  // 3. Store in device's database
  await device.database.insertEvent(event)
  
  // 4. Update Bloom filter
  await device.syncManager.updateLocalBloom()
  
  // 5. Trigger sync with peers
  await device.syncManager.notifyPeers()
  
  res.json({ 
    messageId: event.event_id,
    timestamp: event.created_at 
  })
})

// Get decrypted messages for UI display
app.get('/api/devices/:deviceId/messages', async (req, res) => {
  const { deviceId } = req.params
  const { since = 0 } = req.query
  
  const device = deviceManager.get(deviceId)
  const events = await device.database.getEventsSince(since)
  
  // Decrypt all events for client display
  const messages = events.map(event => device.decrypt(event))
  
  res.json({ messages })
})
```

#### Benefits of Proper Architecture

1. **Security**: All crypto in controlled server environment
2. **Realistic**: Matches how real messaging apps work
3. **Testable**: Can test client/server independently
4. **Scalable**: Can add more devices easily
5. **Observable**: Server can log all sync operations

#### Migration Steps

1. **Immediate**:
   - Stop all crypto operations in browser code
   - Create basic Express server
   - Move DeviceDB to backend

2. **Phase 1 Completion**:
   - Implement message encryption in backend
   - Create REST API for messages
   - Update React to use API instead of direct DB access

3. **Phase 2 (Bloom Sync)**:
   - Implement Bloom filters in backend
   - Add P2P sync between backend devices
   - Expose sync status via API

4. **Phase 4 (Files)**:
   - Add file upload/download API
   - Implement chunking in backend
   - Stream decrypted files to clients

This is the correct architecture that separates concerns properly and matches how production messaging systems actually work.

### 15. Packet Signing Implementation Plan

#### Overview
All UDP packets (Bloom filters, direct messages, and sync events) will be signed using Ed25519 to ensure authenticity and prevent tampering. This provides cryptographic proof of origin and protects against malicious actors.

#### Key Components

##### 1. Key Generation & Management
```typescript
interface DeviceKeys {
  publicKey: Uint8Array   // Ed25519 public key (32 bytes)
  privateKey: Uint8Array  // Ed25519 private key (64 bytes)
  deviceId: string        // Human-readable device identifier
}

// Generate on device initialization
const generateDeviceKeys = (): DeviceKeys => {
  const keypair = nacl.sign.keyPair()
  return {
    publicKey: keypair.publicKey,
    privateKey: keypair.secretKey,
    deviceId: generateDeviceId(keypair.publicKey) // e.g., "alice", "bob"
  }
}
```

##### 2. Signed Packet Format
```typescript
interface SignedPacket {
  // Header (not encrypted)
  version: number         // Protocol version (1)
  deviceId: string        // Sender's device ID
  timestamp: number       // Unix timestamp (milliseconds)
  packetType: string      // 'bloom_filter' | 'message' | 'sync_event'
  
  // Payload (may be encrypted)
  payload: Uint8Array     // Actual packet data
  
  // Signature
  signature: Uint8Array   // Ed25519 signature (64 bytes)
}

// Wire format (CBOR encoded):
// [version, deviceId, timestamp, packetType, payload, signature]
```

##### 3. Signing Process
```typescript
class PacketSigner {
  constructor(private deviceKeys: DeviceKeys) {}
  
  signPacket(packetType: string, payload: Uint8Array): SignedPacket {
    const timestamp = Date.now()
    
    // Create signing input: payload || deviceId || timestamp || packetType
    const signingInput = new Uint8Array(
      payload.length + 
      this.deviceKeys.deviceId.length + 
      8 + // timestamp as 64-bit
      packetType.length
    )
    
    let offset = 0
    signingInput.set(payload, offset)
    offset += payload.length
    signingInput.set(new TextEncoder().encode(this.deviceKeys.deviceId), offset)
    offset += this.deviceKeys.deviceId.length
    new DataView(signingInput.buffer).setBigUint64(offset, BigInt(timestamp), true)
    offset += 8
    signingInput.set(new TextEncoder().encode(packetType), offset)
    
    // Sign with Ed25519
    const signature = nacl.sign.detached(signingInput, this.deviceKeys.privateKey)
    
    return {
      version: 1,
      deviceId: this.deviceKeys.deviceId,
      timestamp,
      packetType,
      payload,
      signature
    }
  }
}
```

##### 4. Verification Process
```typescript
class PacketVerifier {
  private trustedKeys: Map<string, Uint8Array> = new Map()
  private replayWindow = 60000 // 60 seconds
  private seenPackets: Map<string, number> = new Map()
  
  addTrustedKey(deviceId: string, publicKey: Uint8Array) {
    this.trustedKeys.set(deviceId, publicKey)
  }
  
  verifyPacket(packet: SignedPacket): boolean {
    // 1. Check version
    if (packet.version !== 1) {
      console.warn('Unsupported packet version:', packet.version)
      return false
    }
    
    // 2. Check if we trust the sender
    const publicKey = this.trustedKeys.get(packet.deviceId)
    if (!publicKey) {
      console.warn('Unknown device:', packet.deviceId)
      return false
    }
    
    // 3. Check timestamp (prevent replay attacks)
    const now = Date.now()
    if (Math.abs(now - packet.timestamp) > this.replayWindow) {
      console.warn('Packet timestamp outside window:', packet.timestamp)
      return false
    }
    
    // 4. Check for replay
    const packetId = `${packet.deviceId}-${packet.timestamp}-${packet.signature.slice(0, 8)}`
    if (this.seenPackets.has(packetId)) {
      console.warn('Replay detected:', packetId)
      return false
    }
    this.seenPackets.set(packetId, now)
    
    // 5. Verify signature
    const signingInput = this.reconstructSigningInput(packet)
    const valid = nacl.sign.detached.verify(
      signingInput,
      packet.signature,
      publicKey
    )
    
    if (!valid) {
      console.warn('Invalid signature from:', packet.deviceId)
      return false
    }
    
    // 6. Clean old replay entries
    this.cleanReplayCache(now)
    
    return true
  }
  
  private cleanReplayCache(now: number) {
    for (const [packetId, timestamp] of this.seenPackets) {
      if (now - timestamp > this.replayWindow * 2) {
        this.seenPackets.delete(packetId)
      }
    }
  }
}
```

##### 5. Integration with Network Simulator
```typescript
// Enhanced NetworkSimulator
class NetworkSimulator {
  private packetSigner: PacketSigner
  private packetVerifier: PacketVerifier
  
  sendEvent(sourceDevice: string, targetDevice: string, type: string, payload: any): NetworkEvent {
    // Serialize payload
    const payloadBytes = CBOR.encode(payload)
    
    // Sign the packet
    const signedPacket = this.packetSigner.signPacket(type, payloadBytes)
    
    // Simulate network transmission
    const networkEvent: NetworkEvent = {
      id: `net-${this.nextEventId++}`,
      timestamp: this.currentTime,
      sourceDevice,
      targetDevice,
      type,
      payload: signedPacket,
      status: 'sent'
    }
    
    // ... rest of network simulation
  }
  
  private deliverEventToDevice(networkEvent: NetworkEvent) {
    const signedPacket = networkEvent.payload as SignedPacket
    
    // Verify packet before delivery
    if (!this.packetVerifier.verifyPacket(signedPacket)) {
      console.warn('Dropping invalid packet from', signedPacket.deviceId)
      return
    }
    
    // Deserialize verified payload
    const payload = CBOR.decode(signedPacket.payload)
    
    // Continue with normal delivery
    // ...
  }
}
```

##### 6. Testing Packet Signing
```typescript
describe('Packet Signing', () => {
  test('signs and verifies valid packets', () => {
    const alice = generateDeviceKeys()
    const bob = generateDeviceKeys()
    
    const signer = new PacketSigner(alice)
    const verifier = new PacketVerifier()
    verifier.addTrustedKey('alice', alice.publicKey)
    
    const packet = signer.signPacket('message', new TextEncoder().encode('Hello'))
    expect(verifier.verifyPacket(packet)).toBe(true)
  })
  
  test('rejects packets from untrusted devices', () => {
    const eve = generateDeviceKeys()
    const signer = new PacketSigner(eve)
    const verifier = new PacketVerifier()
    // Don't add Eve's key
    
    const packet = signer.signPacket('message', new TextEncoder().encode('Evil'))
    expect(verifier.verifyPacket(packet)).toBe(false)
  })
  
  test('prevents replay attacks', () => {
    const alice = generateDeviceKeys()
    const signer = new PacketSigner(alice)
    const verifier = new PacketVerifier()
    verifier.addTrustedKey('alice', alice.publicKey)
    
    const packet = signer.signPacket('message', new TextEncoder().encode('Hello'))
    expect(verifier.verifyPacket(packet)).toBe(true)
    expect(verifier.verifyPacket(packet)).toBe(false) // Replay rejected
  })
  
  test('handles clock skew gracefully', () => {
    const alice = generateDeviceKeys()
    const signer = new PacketSigner(alice)
    const verifier = new PacketVerifier()
    verifier.addTrustedKey('alice', alice.publicKey)
    
    // Simulate packet with timestamp 30 seconds in future
    const packet = signer.signPacket('message', new TextEncoder().encode('Hello'))
    packet.timestamp += 30000
    
    // Should still verify (within 60 second window)
    expect(verifier.verifyPacket(packet)).toBe(true)
  })
})
```

##### 7. UI Integration
```typescript
// Show signing status in network event log
const SignedPacketIndicator = ({ event }: { event: NetworkEvent }) => {
  const packet = event.payload as SignedPacket
  const isValid = verifier.verifyPacket(packet)
  
  return (
    <div className="packet-signature">
      {isValid ? (
        <span className="signature-valid">✓ Signed by {packet.deviceId}</span>
      ) : (
        <span className="signature-invalid">✗ Invalid signature</span>
      )}
    </div>
  )
}

// Show key management in device panel
const DeviceKeyInfo = ({ deviceId }: { deviceId: string }) => {
  const keys = getDeviceKeys(deviceId)
  
  return (
    <div className="device-key-info">
      <h4>Public Key</h4>
      <code>{base64(keys.publicKey)}</code>
      <button onClick={() => copyToClipboard(keys.publicKey)}>
        Copy Public Key
      </button>
    </div>
  )
}
```

##### 8. Performance Considerations

- **Signing overhead**: ~0.1ms per packet on modern hardware
- **Verification overhead**: ~0.2ms per packet
- **Memory**: ~100 bytes per cached packet for replay protection
- **Network overhead**: 64 bytes for signature + ~20 bytes for metadata

For a simulation with:
- 100 messages/second
- 10 Bloom filters/second
- 2 devices

Total crypto overhead: ~25ms/second (~2.5% CPU)

##### 9. Implementation Timeline

1. **Day 1**: Basic Ed25519 key generation and storage
2. **Day 2**: Packet signing and verification classes
3. **Day 3**: Network simulator integration
4. **Day 4**: Replay protection and clock skew handling
5. **Day 5**: UI integration and key display
6. **Day 6**: Performance testing and optimization
7. **Day 7**: Documentation and example scenarios

This implementation provides strong security guarantees while maintaining the simplicity needed for a simulation environment.

### 16. Key Technical Decisions from Updated Spec

Based on the latest recommendations, here are the critical technical decisions for implementation:

#### Event ID Definition
```
event_id = BLAKE3(ciphertext)
```
Where `ciphertext = nonce || AEAD-ciphertext`

Benefits:
- Deterministic and verifiable by any peer without decryption
- No plaintext equality leaks across databases
- No canonical JSON complexity

#### Single Events Table
```sql
CREATE TABLE events (
  arrival_seq INTEGER PRIMARY KEY,     -- local monotonic counter
  event_id    TEXT    UNIQUE,         -- BLAKE3(ciphertext)
  channel_id  TEXT,                   -- extracted for indexing
  authored_ts INTEGER,                -- extracted HLC timestamp
  ciphertext  BLOB                    -- nonce || AEAD-ciphertext
);
```

All event types (messages, file_chunk, reactions, etc.) share this table:
- Simplifies sync logic - Bloom filters treat all events uniformly
- arrival_seq provides stable ordering and pagination
- Only metadata needed for queries is extracted (channel_id, authored_ts)

#### File Chunks as Events
Files are split into 500-byte chunks (UDP-friendly) and each chunk is a regular event:
```typescript
type FileChunkBlock = {
  type: 'file_chunk'
  channelId: string
  fileId: string
  chunkNo: number
  totalChunks: number
  bytes: Uint8Array  // ~500 bytes per chunk
}
```

This means:
- Each chunk fits in a single UDP packet even with encryption overhead
- File sync uses the exact same Bloom filter mechanism as messages
- Large files result in many small events, but that's fine for P2P reliability

#### Security Notes for Phase 1
- **PSK is temporary**: All devices share one key for the demo/PoC
- **Rate limiting**: Even in PSK mode, limit events per peer per minute
- **Future**: Will use CRDT-based ACL (like Keyhive) for proper authorization

#### Canonical Encoding (Deferred)
For PoC: Use JSON.stringify
For Production: CBOR deterministic mode (RFC 8949 §4.2.1)

This ensures all implementations produce identical bytes for signing/hashing.