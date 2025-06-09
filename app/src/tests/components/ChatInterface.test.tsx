import { render, screen, fireEvent } from '@testing-library/react'
import { ChatInterface, ChatInterfaceRef } from '../../components/ChatInterface'
import { useRef, useEffect } from 'react'
import { describe, it, expect, vi } from 'vitest'

describe('ChatInterface', () => {
  const defaultProps = {
    deviceId: 'alice',
    currentSimTime: 1000,
    onManualMessage: vi.fn()
  }

  it('should call onManualMessage when sending manually', () => {
    const onManualMessage = vi.fn()
    const TestComponent = () => {
      const chatRef = useRef<ChatInterfaceRef>(null)
      
      return (
        <ChatInterface 
          {...defaultProps} 
          onManualMessage={onManualMessage}
          ref={chatRef}
        />
      )
    }

    render(<TestComponent />)
    
    // Send a manual message
    const input = screen.getByPlaceholderText('Type a message as alice...')
    const sendButton = screen.getByText('Send')
    
    fireEvent.change(input, { target: { value: 'Hello world' } })
    fireEvent.click(sendButton)
    
    // Should have called the callback
    expect(onManualMessage).toHaveBeenCalledWith('alice', 'Hello world')
    expect(onManualMessage).toHaveBeenCalledTimes(1)
    
    // Input should be cleared
    expect(input).toHaveValue('')
  })

  it('should render auto-generated messages with consistent styling', async () => {
    const TestComponent = () => {
      const chatRef = useRef<ChatInterfaceRef>(null)
      
      // Add auto-generated messages
      useEffect(() => {
        if (chatRef.current) {
          chatRef.current.handleSimulationMessage('First auto message')
          chatRef.current.handleSimulationMessage('Second auto message')
        }
      }, [])
      
      return (
        <ChatInterface 
          {...defaultProps} 
          ref={chatRef}
        />
      )
    }

    render(<TestComponent />)
    
    // Wait for auto messages to appear
    await screen.findByText('First auto message')
    await screen.findByText('Second auto message')
    
    const firstMessage = screen.getByText('First auto message').closest('.message')
    const secondMessage = screen.getByText('Second auto message').closest('.message')
    
    // Both should have consistent styling
    expect(firstMessage?.className).toBe(secondMessage?.className)
    expect(firstMessage).toHaveClass('message')
    expect(firstMessage).toHaveClass('sent')
    expect(secondMessage).toHaveClass('message') 
    expect(secondMessage).toHaveClass('sent')
  })

  it('regression test: manual messages should trigger callback without appearing immediately', () => {
    const onManualMessage = vi.fn()
    
    const TestComponent = () => {
      const chatRef = useRef<ChatInterfaceRef>(null)
      
      return (
        <ChatInterface 
          {...defaultProps} 
          onManualMessage={onManualMessage}
          ref={chatRef}
        />
      )
    }

    render(<TestComponent />)
    
    const input = screen.getByPlaceholderText('Type a message as alice...')
    fireEvent.change(input, { target: { value: 'Test message' } })
    fireEvent.click(screen.getByText('Send'))
    
    // Should call the callback
    expect(onManualMessage).toHaveBeenCalledWith('alice', 'Test message')
    
    // Message should NOT appear immediately in the UI
    expect(screen.queryByText('Test message')).not.toBeInTheDocument()
    
    // Should still show the "no messages" state
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })
})