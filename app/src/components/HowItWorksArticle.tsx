export const HowItWorksArticle = () => {
  return (
    <article className="how-it-works">
      <div className="article-content">
        <h1>How This Works: A Deep Dive into P2P Event Synchronization</h1>
        
        <p className="intro">
          This simulation demonstrates a peer-to-peer messaging system that works without any central server. 
          Messages flow directly between devices using UDP packets, with automatic recovery for lost messages 
          through Bloom filter synchronization. Let's explore how it all works.
        </p>

        <section>
          <h2>The Event Timeline: Heart of the Simulation</h2>
          <div className="diagram">
            <pre>{`
┌─────────────────────────────────────────────────────────────┐
│                      EVENT TIMELINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Past Events              Current Time          Future Events│
│  (Executed)                    │                (Scheduled) │
│                                ▼                            │
│  ✓──✓──✓──✓──✓──✓──✓──✓──✓──●──○──○──○──○──○──○──○──○    │
│                                                             │
│  Green: Delivered              Yellow: Scheduled            │
│  to devices                    for execution                │
└─────────────────────────────────────────────────────────────┘
            `}</pre>
          </div>
          <p>
            The simulation engine maintains a timeline of all events. As time advances, scheduled events 
            execute and new events are generated based on device frequencies. Each event represents a 
            message sent by a device at a specific simulation time.
          </p>
        </section>

        <section>
          <h2>Device Architecture & Storage</h2>
          <div className="diagram">
            <pre>{`
┌─────────────────┐         ┌─────────────────┐
│   Device: Alice │         │   Device: Bob   │
├─────────────────┤         ├─────────────────┤
│                 │         │                 │
│  SQLite DB      │  UDP    │  SQLite DB      │
│  ┌───────────┐  │ Packets │  ┌───────────┐  │
│  │ events    │  │◄────────┤  │ events    │  │
│  │ ┌───────┐ │  │         │  │ ┌───────┐ │  │
│  │ │ msg_1 │ │  │────────►│  │ │ msg_1 │ │  │
│  │ │ msg_2 │ │  │         │  │ │ msg_3 │ │  │
│  │ │ msg_3 │ │  │         │  │ │ msg_4 │ │  │
│  │ └───────┘ │  │         │  │ └───────┘ │  │
│  └───────────┘  │         │  └───────────┘  │
│                 │         │                 │
│  Bloom Filter   │         │  Bloom Filter   │
│  [1,0,1,1,0,1]  │         │  [1,1,0,1,0,0]  │
└─────────────────┘         └─────────────────┘
            `}</pre>
          </div>
          <p>
            Each device maintains its own SQLite database storing encrypted events. The database schema 
            uses content-addressed event IDs (hash of the event), making events immutable and easy to 
            identify across the network.
          </p>
          <div className="code-example">
            <pre>{`
CREATE TABLE events (
  event_id     TEXT PRIMARY KEY,  -- hash(event_bytes)
  device_id    TEXT,              -- originating device
  created_at   INTEGER,           -- timestamp
  received_at  INTEGER,           -- when we got it
  encrypted    BLOB               -- encrypted payload
);
            `}</pre>
          </div>
        </section>

        <section>
          <h2>Direct Message Delivery via UDP</h2>
          <div className="diagram">
            <pre>{`
  Alice sends "Hello!"                    Bob receives instantly
         │                                        │
         ▼                                        ▼
┌─────────────────┐                    ┌─────────────────┐
│ 1. Create Event │                    │ 4. Store Event  │
│ 2. Store in DB  │      UDP Packet    │ 5. Update UI    │
│ 3. Broadcast    │ ──────────────────►│                 │
└─────────────────┘    ~10-50ms latency└─────────────────┘
                      (configurable)
            `}</pre>
          </div>
          <p>
            When a device sends a message, it immediately broadcasts the encrypted event to all peers 
            via UDP. This provides near-instant delivery when the network is reliable. UDP was chosen 
            because:
          </p>
          <ul>
            <li>No connection overhead - perfect for P2P</li>
            <li>Fire-and-forget simplicity</li>
            <li>Natural packet boundaries match our event model</li>
            <li>Realistic simulation of unreliable networks</li>
          </ul>
        </section>

        <section>
          <h2>Bloom Filter Synchronization</h2>
          <div className="diagram">
            <pre>{`
When packets are lost, Bloom filters ensure eventual delivery:

1. Periodic Filter Exchange (every 2 seconds)
   ┌─────────┐                          ┌─────────┐
   │  Alice  │ ───── Bloom Filter ────► │   Bob   │
   │         │                          │         │
   │ [1,0,1] │ ◄──── Bloom Filter ───── │ [0,1,1] │
   └─────────┘                          └─────────┘

2. Missing Event Detection
   Alice's filter: [1,0,1,1,0,1]  "I have events A, C, D, F"
   Bob's filter:   [1,1,0,1,0,0]  "I have events A, B, D"
   
   Alice detects Bob is missing C & F → Sends those events

3. Eventual Consistency
   After sync, both have: [1,1,1,1,0,1] (all events except E)
            `}</pre>
          </div>
          <p>
            Bloom filters are probabilistic data structures that efficiently represent which events 
            each device has seen. They're perfect for sync because:
          </p>
          <ul>
            <li>Compact representation (small UDP packets)</li>
            <li>Fast membership testing</li>
            <li>No false negatives (never miss events)</li>
            <li>Occasional false positives are harmless</li>
          </ul>
        </section>

        <section>
          <h2>Network Simulation</h2>
          <div className="diagram">
            <pre>{`
┌──────────────────────────────────────────────────────────┐
│                  NetworkSimulator                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Configuration:                Packet Flow:              │
│  • Packet Loss: 0-100%         Alice ──┐                │
│  • Latency: 10-100ms                   ▼                │
│  • Jitter: ±20ms              [Packet Queue]            │
│                                    │                     │
│                                    ├─── Dropped (20%)    │
│                                    │                     │
│                                    └─── Delivered (80%)  │
│                                         │                │
│                                         ▼                │
│                                        Bob               │
└──────────────────────────────────────────────────────────┘
            `}</pre>
          </div>
          <p>
            The network simulator models real-world UDP behavior including packet loss, variable 
            latency, and jitter. This lets us test how well the system handles adverse conditions.
          </p>
        </section>

        <section>
          <h2>Frontend Integration via ChatAPI</h2>
          <div className="diagram">
            <pre>{`
┌─────────────────┐     ChatAPI      ┌────────────────┐
│ SimulationEngine│ ←───────────────→ │ Chat Interface │
├─────────────────┤                  ├────────────────┤
│                 │  sendMessage()   │                │
│ • Execute Events│ ◄────────────────│ • Message Input│
│ • Update DBs    │                  │                │
│ • Broadcast UDP │  onNewMessage()  │ • Chat Bubbles │
│                 │ ─────────────────►│                │
└─────────────────┘                  └────────────────┘
            `}</pre>
          </div>
          <p>
            The ChatAPI provides a clean interface between the simulation engine and the React 
            frontend. It handles message creation, delivery notifications, and UI updates without 
            the frontend needing to understand the underlying P2P mechanics.
          </p>
        </section>

        <section>
          <h2>Why This Architecture?</h2>
          <div className="key-benefits">
            <div className="benefit">
              <h3>🌐 True Peer-to-Peer</h3>
              <p>No servers, no single points of failure. Each device is autonomous.</p>
            </div>
            <div className="benefit">
              <h3>🔒 Privacy First</h3>
              <p>All events encrypted before storage. Only peers with keys can read.</p>
            </div>
            <div className="benefit">
              <h3>📡 Network Resilient</h3>
              <p>Handles packet loss gracefully. Messages eventually reach everyone.</p>
            </div>
            <div className="benefit">
              <h3>⚡ Fast & Efficient</h3>
              <p>Direct UDP delivery for speed, Bloom filters for efficient sync.</p>
            </div>
          </div>
        </section>

        <section>
          <h2>Try It Yourself!</h2>
          <p>
            Use the controls above to experiment with different network conditions, message 
            frequencies, and manual messaging. Watch how the system adapts to packet loss and 
            ensures all messages eventually reach their destination.
          </p>
        </section>
      </div>
    </article>
  )
}