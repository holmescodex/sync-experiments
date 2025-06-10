// Simple in-memory storage for initial testing
// Will be replaced with SQLite integration

export interface StoredEvent {
  event_id: string
  device_id: string
  created_at: number
  received_at: number
  encrypted: Buffer
}

export class InMemoryStore {
  private events: Map<string, StoredEvent> = new Map()
  
  constructor(private deviceId: string) {}

  async storeEvent(event: Omit<StoredEvent, 'event_id'>, eventId: string): Promise<void> {
    this.events.set(eventId, {
      ...event,
      event_id: eventId
    })
  }

  async getEvent(eventId: string): Promise<StoredEvent | null> {
    return this.events.get(eventId) || null
  }

  async getAllEvents(): Promise<StoredEvent[]> {
    return Array.from(this.events.values())
      .sort((a, b) => a.created_at - b.created_at)
  }

  async getMessagesSince(timestamp: number): Promise<StoredEvent[]> {
    return Array.from(this.events.values())
      .filter(e => e.created_at > timestamp)
      .sort((a, b) => a.created_at - b.created_at)
  }

  async getAllEventsSince(timestamp: number): Promise<StoredEvent[]> {
    // Return all events (messages, reactions, etc.) since timestamp
    return Array.from(this.events.values())
      .filter(e => e.created_at > timestamp)
      .sort((a, b) => a.created_at - b.created_at)
  }

  async clear(): Promise<void> {
    this.events.clear()
  }
}