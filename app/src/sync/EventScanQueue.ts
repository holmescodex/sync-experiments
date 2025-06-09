import type { Event } from '../storage/device-db'
import type { BloomFilter } from './BloomFilter'

/**
 * Prioritized event scanning for UDP-safe sync
 * Focuses on recent events first, round-robin through older events
 */
export class EventScanQueue {
  private recentEvents: Event[] = []
  private olderEventsCursor = 0
  private lastUpdateTime = 0
  private allEvents: Event[] = []
  
  /**
   * Update the scan queue with current database state
   */
  updateFromDatabase(events: Event[]): void {
    this.allEvents = events.sort((a, b) => b.created_at - a.created_at) // Newest first
    this.lastUpdateTime = Date.now()
    
    // Recent events = last 1 minute, scanned every round
    const oneMinuteAgo = this.lastUpdateTime - 60000
    this.recentEvents = events.filter(e => e.created_at > oneMinuteAgo)
  }
  
  /**
   * Get events to send to a peer based on their Bloom filter
   * Prioritizes recent events, then round-robin through older events
   */
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
    
    // 1. Always check recent events first (highest priority)
    for (const event of this.recentEvents.slice(0, options.recentEventsBatch)) {
      if (!peerFilter.test(event.event_id)) {
        eventsToSend.push(event)
        if (eventsToSend.length >= options.maxEventsPerRound) {
          return eventsToSend // Hit UDP batch limit
        }
      }
    }
    
    // 2. Round-robin through older events if we have room
    if (eventsToSend.length < options.maxEventsPerRound) {
      const olderEvents = this.allEvents.filter(e => 
        !this.recentEvents.some(recent => recent.event_id === e.event_id)
      )
      
      if (olderEvents.length > 0) {
        // Continue from where we left off last time (round-robin)
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
    }
    
    return eventsToSend
  }
  
  /**
   * Get statistics about the scan queue
   */
  getStats(): {
    totalEvents: number
    recentEvents: number
    olderEventsCursor: number
    lastUpdateTime: number
  } {
    return {
      totalEvents: this.allEvents.length,
      recentEvents: this.recentEvents.length,
      olderEventsCursor: this.olderEventsCursor,
      lastUpdateTime: this.lastUpdateTime
    }
  }
  
  /**
   * Reset the scan queue (useful for testing)
   */
  reset(): void {
    this.recentEvents = []
    this.olderEventsCursor = 0
    this.allEvents = []
    this.lastUpdateTime = 0
  }
}