import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ChatInterface, type ChatInterfaceRef } from '../../components/ChatInterface'
import { createChatAPI, type ChatAPI } from '../../api/ChatAPI'
import { SimulationEngine } from '../../simulation/engine'
import { useRef } from 'react'

// Mock component to test ChatInterface with ChatAPI
function TestChatInterface({ chatAPI }: { chatAPI: ChatAPI | null }) {
  const ref = useRef<ChatInterfaceRef>(null)
  
  return (
    <ChatInterface
      ref={ref}
      deviceId="alice"
      currentSimTime={Date.now()}
      imageAttachmentPercentage={30}
      onManualMessage={() => {}}
      chatAPI={chatAPI}
    />
  )
}

describe('ChatInterface File Display', () => {
  let engine: SimulationEngine
  let chatAPI: ChatAPI

  beforeEach(async () => {
    engine = new SimulationEngine()
    
    // Initialize devices
    await engine.setDeviceFrequencies([
      { deviceId: 'alice', messagesPerHour: 0, enabled: false },
      { deviceId: 'bob', messagesPerHour: 0, enabled: false }
    ])
    
    // Create ChatAPI
    chatAPI = createChatAPI('alice', engine)!
    expect(chatAPI).toBeDefined()
  })

  it('should display file attachments in chat messages', async () => {
    console.log('[TEST] Starting file attachment display test')
    
    // Step 1: Send a message with file attachment via ChatAPI
    const testFileData = new Uint8Array(800) // Small test file
    for (let i = 0; i < testFileData.length; i++) {
      testFileData[i] = i % 256
    }
    
    const mockFile = new File([testFileData], 'test-image.jpg', { type: 'image/jpeg' })
    
    // Mock File.arrayBuffer() for Node.js compatibility
    if (!mockFile.arrayBuffer) {
      Object.defineProperty(mockFile, 'arrayBuffer', {
        value: async () => testFileData.buffer
      })
    }
    
    await chatAPI.sendMessageWithFiles('Check out this image!', [mockFile])
    console.log('[TEST] File sent via ChatAPI')
    
    // Step 2: Render ChatInterface with the ChatAPI
    render(<TestChatInterface chatAPI={chatAPI} />)
    
    // Step 3: Wait for the message to appear
    await waitFor(
      () => {
        const messageText = screen.getByText('Check out this image!')
        expect(messageText).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
    
    console.log('[TEST] Message text found in UI')
    
    // Step 4: Check if file attachment is displayed
    await waitFor(
      () => {
        // Look for attachment indicators
        const attachmentElements = screen.queryAllByText(/test-image\.jpg/i)
        console.log(`[TEST] Found ${attachmentElements.length} elements with filename`)
        
        // Look for image elements
        const imageElements = screen.queryAllByRole('img')
        console.log(`[TEST] Found ${imageElements.length} image elements`)
        
        // Look for file size indicators
        const sizeElements = screen.queryAllByText(/KB|MB/i)
        console.log(`[TEST] Found ${sizeElements.length} size indicators`)
        
        // At least one of these should exist for file attachments
        expect(
          attachmentElements.length > 0 || 
          imageElements.length > 0 || 
          sizeElements.length > 0
        ).toBe(true)
      },
      { timeout: 3000 }
    )
    
    console.log('[TEST] File attachment UI elements found!')
  })

  it('should show attachment count and metadata', async () => {
    console.log('[TEST] Starting attachment metadata test')
    
    // Send message with attachment
    const testFileData = new Uint8Array(1200)
    for (let i = 0; i < testFileData.length; i++) {
      testFileData[i] = (i * 7) % 256 // Different pattern
    }
    
    const mockFile = new File([testFileData], 'document.pdf', { type: 'application/pdf' })
    
    if (!mockFile.arrayBuffer) {
      Object.defineProperty(mockFile, 'arrayBuffer', {
        value: async () => testFileData.buffer
      })
    }
    
    await chatAPI.sendMessageWithFiles('Here is the document', [mockFile])
    console.log('[TEST] Document sent via ChatAPI')
    
    // Render and wait for message
    render(<TestChatInterface chatAPI={chatAPI} />)
    
    await waitFor(
      () => {
        expect(screen.getByText('Here is the document')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
    
    // Check for document-specific indicators
    await waitFor(
      () => {
        // Look for PDF indicators or document icons
        const docElements = screen.queryAllByText(/document\.pdf|PDF|📄/i)
        console.log(`[TEST] Found ${docElements.length} document indicators`)
        
        expect(docElements.length).toBeGreaterThan(0)
      },
      { timeout: 3000 }
    )
    
    console.log('[TEST] Document attachment metadata found!')
  })

  it('should handle messages without attachments normally', async () => {
    console.log('[TEST] Testing normal messages without attachments')
    
    // Send regular message without files
    await chatAPI.sendMessage('Just a regular message')
    console.log('[TEST] Regular message sent')
    
    render(<TestChatInterface chatAPI={chatAPI} />)
    
    await waitFor(
      () => {
        expect(screen.getByText('Just a regular message')).toBeInTheDocument()
      },
      { timeout: 3000 }
    )
    
    console.log('[TEST] Regular message displayed correctly')
    
    // Verify no attachment UI elements appear
    const attachmentElements = screen.queryAllByText(/\.(jpg|png|pdf)/i)
    const imageElements = screen.queryAllByRole('img')
    
    console.log(`[TEST] Found ${attachmentElements.length} filename elements and ${imageElements.length} images`)
    
    // Should be 0 or very few (maybe avatars, but no file attachments)
    expect(attachmentElements.length).toBe(0)
  })
})