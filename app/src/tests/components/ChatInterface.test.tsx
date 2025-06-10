import { render, screen, fireEvent } from '@testing-library/react'
import { ChatInterface, type ChatInterfaceRef } from '../../components/ChatInterface'
import { useRef, useEffect } from 'react'
import { describe, it, expect, vi } from 'vitest'

describe('ChatInterface', () => {
  const defaultProps = {
    deviceId: 'alice',
    currentSimTime: 1000,
    imageAttachmentPercentage: 30,
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
    
    // Should have called the callback (with no attachments, so third param is undefined)
    expect(onManualMessage).toHaveBeenCalledWith('alice', 'Hello world', undefined)
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
    expect(firstMessage).toHaveClass('received') // Auto messages are received from simulation
    expect(secondMessage).toHaveClass('message') 
    expect(secondMessage).toHaveClass('received')
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
    
    // Should call the callback (with no attachments, so third param is undefined)
    expect(onManualMessage).toHaveBeenCalledWith('alice', 'Test message', undefined)
    
    // Message should NOT appear immediately in the UI
    expect(screen.queryByText('Test message')).not.toBeInTheDocument()
    
    // Should still show the "no messages" state
    expect(screen.getByText('No messages yet')).toBeInTheDocument()
  })

  it('should render attachment button inside input field', () => {
    const TestComponent = () => {
      const chatRef = useRef<ChatInterfaceRef>(null)
      
      return (
        <ChatInterface 
          {...defaultProps} 
          ref={chatRef}
        />
      )
    }

    render(<TestComponent />)
    
    // Check that the attachment button exists and has correct properties
    const attachButton = screen.getByTitle('Attach file')
    expect(attachButton).toBeInTheDocument()
    expect(attachButton).toHaveClass('attach-button-inline')
    expect(attachButton).toHaveTextContent('📎')
    
    // Check that the input container exists
    const inputContainer = attachButton.closest('.input-container')
    expect(inputContainer).toBeInTheDocument()
    
    // Check that message input is inside the same container
    const messageInput = screen.getByPlaceholderText('Type a message as alice...')
    expect(inputContainer).toContainElement(messageInput)
  })
})