import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { ChatInterface } from '../../components/ChatInterface'
import { BackendAdapter } from '../../api/BackendAdapter'
import type { Message } from '../../api/BackendAdapter'

// Mock BackendAdapter
vi.mock('../../api/BackendAdapter')

describe('ChatInterface Message Ownership', () => {
  let mockBackendAdapter: any

  beforeEach(() => {
    mockBackendAdapter = {
      sendMessage: vi.fn(),
      startPolling: vi.fn(),
      stopPolling: vi.fn(),
      getBackendType: vi.fn().mockReturnValue('api')
    }
  })

  it('should immediately show sent messages with isOwn=true styling', async () => {
    // Setup the mock to return a message after a delay
    mockBackendAdapter.sendMessage.mockImplementation(async (content: string) => {
      await new Promise(resolve => setTimeout(resolve, 100))
      return {
        id: 'real-id-123',
        content,
        timestamp: Date.now(),
        author: 'alice',
        isOwn: true
      }
    })

    const handleManualMessage = vi.fn()
    
    const { container } = render(
      <ChatInterface
        deviceId="alice"
        currentSimTime={Date.now()}
        onManualMessage={handleManualMessage}
        backendAdapter={mockBackendAdapter}
      />
    )

    // Type and send a message
    const input = screen.getByPlaceholderText('Type a message as alice...')
    const sendButton = screen.getByRole('button', { name: /send/i })
    
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.click(sendButton)

    // Check that optimistic message appears immediately with 'sent' class
    await waitFor(() => {
      const messages = container.querySelectorAll('.message')
      expect(messages).toHaveLength(1)
      expect(messages[0]).toHaveClass('sent')
      expect(messages[0]).not.toHaveClass('received')
    })

    // Wait for backend response
    await waitFor(() => {
      expect(mockBackendAdapter.sendMessage).toHaveBeenCalledWith('Test message', undefined)
    })

    // Verify message still has 'sent' class after backend response
    await waitFor(() => {
      const messages = container.querySelectorAll('.message')
      expect(messages).toHaveLength(1)
      expect(messages[0]).toHaveClass('sent')
      expect(messages[0]).not.toHaveClass('received')
    })
  })

  it('should show simulation messages from own device with isOwn=true', () => {
    const handleManualMessage = vi.fn()
    let chatInterfaceRef: any = null

    const { container } = render(
      <ChatInterface
        ref={(ref) => { chatInterfaceRef = ref }}
        deviceId="alice"
        currentSimTime={Date.now()}
        onManualMessage={handleManualMessage}
        backendAdapter={mockBackendAdapter}
      />
    )

    // Simulate a message from the simulation engine
    act(() => {
      chatInterfaceRef?.handleSimulationMessage('Simulation message')
    })

    // Check that simulation message appears with 'sent' class
    const messages = container.querySelectorAll('.message')
    expect(messages).toHaveLength(1)
    expect(messages[0]).toHaveClass('sent')
    expect(messages[0]).not.toHaveClass('received')
  })

  it('should handle polling updates correctly without changing ownership', async () => {
    // Mock polling to return messages
    let pollCallback: any = null
    mockBackendAdapter.startPolling.mockImplementation((callback: any) => {
      pollCallback = callback
    })

    const handleManualMessage = vi.fn()
    
    const { container } = render(
      <ChatInterface
        deviceId="alice"
        currentSimTime={Date.now()}
        onManualMessage={handleManualMessage}
        backendAdapter={mockBackendAdapter}
      />
    )

    // Trigger polling with a message from alice (should be 'sent')
    const aliceMessage: Message = {
      id: 'msg-1',
      content: 'Hello from Alice',
      timestamp: Date.now(),
      author: 'alice',
      isOwn: true
    }

    act(() => {
      pollCallback([aliceMessage])
    })

    await waitFor(() => {
      const messages = container.querySelectorAll('.message')
      expect(messages).toHaveLength(1)
      expect(messages[0]).toHaveClass('sent')
    })

    // Add a message from bob (should be 'received')
    const bobMessage: Message = {
      id: 'msg-2',
      content: 'Hello from Bob',
      timestamp: Date.now() + 1000,
      author: 'bob',
      isOwn: false
    }

    act(() => {
      pollCallback([aliceMessage, bobMessage])
    })

    await waitFor(() => {
      const messages = container.querySelectorAll('.message')
      expect(messages).toHaveLength(2)
      expect(messages[0]).toHaveClass('sent') // Alice's message
      expect(messages[1]).toHaveClass('received') // Bob's message
    })
  })
})