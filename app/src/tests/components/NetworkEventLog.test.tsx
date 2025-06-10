import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { NetworkEventLog } from '../../components/NetworkEventLog'
import type { NetworkEvent, NetworkConfig } from '../../network/simulator'

describe('NetworkEventLog', () => {
  const mockOnConfigUpdate = vi.fn()
  
  const defaultNetworkConfig: NetworkConfig = {
    packetLossRate: 0,
    minLatency: 10,
    maxLatency: 100,
    jitter: 20
  }

  const defaultNetworkStats = {
    total: 0,
    delivered: 0,
    dropped: 0,
    deliveryRate: 0,
    dropRate: 0
  }

  const createMockEvent = (
    type: 'message' | 'bloom_filter' | 'file_chunk',
    status: 'sent' | 'delivered' | 'dropped' = 'delivered',
    id: string = Math.random().toString(36)
  ): NetworkEvent => ({
    id,
    timestamp: Date.now(),
    sourceDevice: 'alice',
    targetDevice: 'bob',
    type,
    payload: type === 'message' 
      ? { content: 'Test message' }
      : type === 'bloom_filter'
      ? { eventCount: 10, filterSize: 1024 }
      : { chunkId: 'chunk-1', size: 2048 },
    status,
    latency: 50
  })

  describe('Event Filtering', () => {
    it('shows all events when all filters are enabled', () => {
      const events: NetworkEvent[] = [
        createMockEvent('message', 'delivered', '1'),
        createMockEvent('bloom_filter', 'delivered', '2'),
        createMockEvent('file_chunk', 'delivered', '3')
      ]

      render(
        <NetworkEventLog
          networkEvents={events}
          networkConfig={defaultNetworkConfig}
          networkStats={defaultNetworkStats}
          onConfigUpdate={mockOnConfigUpdate}
        />
      )

      // All events should be visible by default (messages and files enabled, bloom disabled)
      expect(screen.getByText('Network Events (2 total, showing 2)')).toBeInTheDocument()
      expect(screen.getByText('"Test message"')).toBeInTheDocument()
      expect(screen.queryByText(/Bloom filter:/)).not.toBeInTheDocument()
    })

    it('filters out bloom filter events when checkbox is unchecked', () => {
      const events: NetworkEvent[] = [
        createMockEvent('message', 'delivered', '1'),
        createMockEvent('bloom_filter', 'delivered', '2'),
        createMockEvent('bloom_filter', 'delivered', '3')
      ]

      render(
        <NetworkEventLog
          networkEvents={events}
          networkConfig={defaultNetworkConfig}
          networkStats={defaultNetworkStats}
          onConfigUpdate={mockOnConfigUpdate}
        />
      )

      // Bloom filters should be hidden by default
      expect(screen.getByText('Network Events (1 total, showing 1)')).toBeInTheDocument()
      expect(screen.queryByText(/Bloom filter:/)).not.toBeInTheDocument()

      // Enable bloom filter checkbox
      const bloomCheckbox = screen.getByLabelText('🔍 Bloom Filters')
      fireEvent.click(bloomCheckbox)

      // Now bloom filters should be visible
      expect(screen.getByText('Network Events (3 total, showing 3)')).toBeInTheDocument()
      expect(screen.getAllByText(/Bloom filter:/).length).toBe(2)
    })

    it('filters out message events when checkbox is unchecked', () => {
      const events: NetworkEvent[] = [
        createMockEvent('message', 'delivered', '1'),
        createMockEvent('message', 'delivered', '2'),
        createMockEvent('file_chunk', 'delivered', '3')
      ]

      render(
        <NetworkEventLog
          networkEvents={events}
          networkConfig={defaultNetworkConfig}
          networkStats={defaultNetworkStats}
          onConfigUpdate={mockOnConfigUpdate}
        />
      )

      // Messages should be visible by default
      expect(screen.getByText('Network Events (3 total, showing 3)')).toBeInTheDocument()
      expect(screen.getAllByText('"Test message"').length).toBe(2)

      // Disable message checkbox
      const messageCheckbox = screen.getByLabelText('💬 Messages')
      fireEvent.click(messageCheckbox)

      // Now messages should be hidden
      expect(screen.getByText('Network Events (1 total, showing 1)')).toBeInTheDocument()
      expect(screen.queryByText('"Test message"')).not.toBeInTheDocument()
    })

    it('shows no events message when all filters are disabled', () => {
      const events: NetworkEvent[] = [
        createMockEvent('message', 'delivered', '1'),
        createMockEvent('bloom_filter', 'delivered', '2'),
        createMockEvent('file_chunk', 'delivered', '3')
      ]

      render(
        <NetworkEventLog
          networkEvents={events}
          networkConfig={defaultNetworkConfig}
          networkStats={defaultNetworkStats}
          onConfigUpdate={mockOnConfigUpdate}
        />
      )

      // Disable all checkboxes
      fireEvent.click(screen.getByLabelText('💬 Messages'))
      fireEvent.click(screen.getByLabelText('📄 Files'))

      // Should show no events message
      expect(screen.getByText('No network events yet')).toBeInTheDocument()
      expect(screen.getByText('Events will appear as devices communicate')).toBeInTheDocument()
    })
  })

  describe('Display Limit', () => {
    it('respects the display limit selector', () => {
      // Create 200 events
      const events: NetworkEvent[] = Array.from({ length: 200 }, (_, i) => 
        createMockEvent('message', 'delivered', `event-${i}`)
      )

      render(
        <NetworkEventLog
          networkEvents={events}
          networkConfig={defaultNetworkConfig}
          networkStats={defaultNetworkStats}
          onConfigUpdate={mockOnConfigUpdate}
        />
      )

      // Should show 50 by default
      expect(screen.getByText('Network Events (200 total, showing 50)')).toBeInTheDocument()
      
      // Change to show 100
      const limitSelect = screen.getByDisplayValue('Show 50')
      fireEvent.change(limitSelect, { target: { value: '100' } })

      expect(screen.getByText('Network Events (200 total, showing 100)')).toBeInTheDocument()
    })

    it('shows correct count when filtered events are less than limit', () => {
      const events: NetworkEvent[] = [
        ...Array.from({ length: 20 }, (_, i) => createMockEvent('message', 'delivered', `msg-${i}`)),
        ...Array.from({ length: 80 }, (_, i) => createMockEvent('bloom_filter', 'delivered', `bloom-${i}`))
      ]

      render(
        <NetworkEventLog
          networkEvents={events}
          networkConfig={defaultNetworkConfig}
          networkStats={defaultNetworkStats}
          onConfigUpdate={mockOnConfigUpdate}
        />
      )

      // Messages only (bloom disabled by default)
      expect(screen.getByText('Network Events (20 total, showing 20)')).toBeInTheDocument()
    })
  })

  describe('Network Stats', () => {
    it('calculates stats based on filtered events', () => {
      const events: NetworkEvent[] = [
        createMockEvent('message', 'delivered', '1'),
        createMockEvent('message', 'dropped', '2'),
        createMockEvent('bloom_filter', 'delivered', '3'),
        createMockEvent('bloom_filter', 'dropped', '4'),
      ]

      render(
        <NetworkEventLog
          networkEvents={events}
          networkConfig={defaultNetworkConfig}
          networkStats={defaultNetworkStats}
          onConfigUpdate={mockOnConfigUpdate}
        />
      )

      // With bloom filters hidden, should only count messages
      expect(screen.getByText('2')).toBeInTheDocument() // Total packets
      
      // Enable bloom filters
      fireEvent.click(screen.getByLabelText('🔍 Bloom Filters'))
      
      // Now should count all events
      expect(screen.getByText('4')).toBeInTheDocument() // Total packets
    })

    it('shows correct delivery rate for filtered events', () => {
      const events: NetworkEvent[] = [
        createMockEvent('message', 'delivered', '1'),
        createMockEvent('message', 'delivered', '2'),
        createMockEvent('message', 'dropped', '3'),
        createMockEvent('bloom_filter', 'dropped', '4'),
        createMockEvent('bloom_filter', 'dropped', '5'),
      ]

      render(
        <NetworkEventLog
          networkEvents={events}
          networkConfig={defaultNetworkConfig}
          networkStats={defaultNetworkStats}
          onConfigUpdate={mockOnConfigUpdate}
        />
      )

      // Messages only: 2 delivered out of 3 = 67%
      expect(screen.getByText('67%')).toBeInTheDocument()
      
      // Enable bloom filters
      fireEvent.click(screen.getByLabelText('🔍 Bloom Filters'))
      
      // All events: 2 delivered out of 5 = 40%
      expect(screen.getByText('40%')).toBeInTheDocument()
    })
  })

  describe('Event Type Labels', () => {
    it('displays correct icons and labels for each event type', () => {
      const events: NetworkEvent[] = [
        createMockEvent('message', 'delivered', '1'),
        createMockEvent('bloom_filter', 'delivered', '2'),
        createMockEvent('file_chunk', 'delivered', '3')
      ]

      render(
        <NetworkEventLog
          networkEvents={events}
          networkConfig={defaultNetworkConfig}
          networkStats={defaultNetworkStats}
          onConfigUpdate={mockOnConfigUpdate}
        />
      )

      // Enable bloom filters to see all types
      fireEvent.click(screen.getByLabelText('🔍 Bloom Filters'))

      // Check for event type icons
      expect(screen.getByText('💬')).toBeInTheDocument() // Message icon
      expect(screen.getByText('🔍')).toBeInTheDocument() // Bloom filter icon
      expect(screen.getByText('📄')).toBeInTheDocument() // File chunk icon

      // Check for proper payload rendering
      expect(screen.getByText('"Test message"')).toBeInTheDocument()
      expect(screen.getByText(/Bloom filter: 10 events/)).toBeInTheDocument()
      expect(screen.getByText('file_chunk data')).toBeInTheDocument()
    })
  })
})