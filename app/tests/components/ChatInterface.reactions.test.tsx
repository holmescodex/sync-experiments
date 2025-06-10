import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { ChatInterface } from '../../components/ChatInterface'
import type { ChatAPI } from '../../api/ChatAPI'

describe('ChatInterface Reactions', () => {
  const mockChatAPI: Partial<ChatAPI> = {
    onMessagesUpdate: vi.fn((callback) => {
      // Simulate messages with reactions
      callback([
        {
          id: 'msg-1',
          content: 'Hello world!',
          author: 'alice',
          timestamp: Date.now(),
          isOwn: true,
          reactions: [
            { emoji: '👍', author: 'bob', timestamp: Date.now() },
            { emoji: '❤️', author: 'charlie', timestamp: Date.now() }
          ]
        },
        {
          id: 'msg-2',
          content: 'Great to see you!',
          author: 'bob',
          timestamp: Date.now() + 1000,
          isOwn: false,
          reactions: []
        }
      ])
      return () => {}
    }),
    addReaction: vi.fn(),
    removeReaction: vi.fn(),
    sendMessage: vi.fn(),
    sendMessageWithFiles: vi.fn()
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should display reactions on messages', async () => {
    render(
      <ChatInterface
        deviceId="alice"
        currentSimTime={0}
        imageAttachmentPercentage={0}
        onManualMessage={vi.fn()}
        chatAPI={mockChatAPI as ChatAPI}
      />
    )

    await waitFor(() => {
      // Check that reactions are displayed
      expect(screen.getByText('👍')).toBeInTheDocument()
      expect(screen.getByText('❤️')).toBeInTheDocument()
      
      // Check reaction counts
      expect(screen.getByText('1', { selector: '.reaction-count' })).toBeInTheDocument()
    })
  })

  it('should show add reaction button on hover', async () => {
    const { container } = render(
      <ChatInterface
        deviceId="alice"
        currentSimTime={0}
        imageAttachmentPercentage={0}
        onManualMessage={vi.fn()}
        chatAPI={mockChatAPI as ChatAPI}
      />
    )

    await waitFor(() => {
      const messages = container.querySelectorAll('.message')
      expect(messages.length).toBeGreaterThan(0)
    })

    // Find a message and hover over it
    const message = container.querySelector('.message')!
    fireEvent.mouseEnter(message)

    // Add reaction button should be visible
    const addButton = message.querySelector('.add-reaction-button')
    expect(addButton).toBeInTheDocument()
  })

  it('should open emoji picker when clicking add reaction', async () => {
    const { container } = render(
      <ChatInterface
        deviceId="alice"
        currentSimTime={0}
        imageAttachmentPercentage={0}
        onManualMessage={vi.fn()}
        chatAPI={mockChatAPI as ChatAPI}
      />
    )

    await waitFor(() => {
      const messages = container.querySelectorAll('.message')
      expect(messages.length).toBeGreaterThan(0)
    })

    // Click add reaction button
    const addButton = container.querySelector('.add-reaction-button')!
    fireEvent.click(addButton)

    // Emoji picker should appear
    await waitFor(() => {
      expect(container.querySelector('.emoji-picker')).toBeInTheDocument()
    })
  })

  it('should call addReaction when selecting an emoji', async () => {
    const { container } = render(
      <ChatInterface
        deviceId="alice"
        currentSimTime={0}
        imageAttachmentPercentage={0}
        onManualMessage={vi.fn()}
        chatAPI={mockChatAPI as ChatAPI}
      />
    )

    await waitFor(() => {
      const messages = container.querySelectorAll('.message')
      expect(messages.length).toBeGreaterThan(0)
    })

    // Open emoji picker
    const addButton = container.querySelector('.add-reaction-button')!
    fireEvent.click(addButton)

    // Select an emoji
    await waitFor(() => {
      const emojiPicker = container.querySelector('.emoji-picker')
      expect(emojiPicker).toBeInTheDocument()
    })

    const emojiButton = container.querySelector('.emoji-button')!
    fireEvent.click(emojiButton)

    // Should call addReaction
    expect(mockChatAPI.addReaction).toHaveBeenCalled()
  })

  it('should toggle reaction when clicking existing reaction', async () => {
    const { container } = render(
      <ChatInterface
        deviceId="bob" // Bob's view to test removing his own reaction
        currentSimTime={0}
        imageAttachmentPercentage={0}
        onManualMessage={vi.fn()}
        chatAPI={mockChatAPI as ChatAPI}
      />
    )

    await waitFor(() => {
      const reactions = container.querySelectorAll('.reaction-badge')
      expect(reactions.length).toBeGreaterThan(0)
    })

    // Click Bob's own reaction (should have 'own' class)
    const ownReaction = container.querySelector('.reaction-badge.own')!
    fireEvent.click(ownReaction)

    // Should call removeReaction
    expect(mockChatAPI.removeReaction).toHaveBeenCalledWith('msg-1', '👍')
  })

  it('should add reaction when clicking someone else\'s reaction', async () => {
    const { container } = render(
      <ChatInterface
        deviceId="charlie"
        currentSimTime={0}
        imageAttachmentPercentage={0}
        onManualMessage={vi.fn()}
        chatAPI={mockChatAPI as ChatAPI}
      />
    )

    await waitFor(() => {
      const reactions = container.querySelectorAll('.reaction-badge')
      expect(reactions.length).toBeGreaterThan(0)
    })

    // Click a reaction that Charlie hasn't added yet
    const reaction = container.querySelector('.reaction-badge')!
    fireEvent.click(reaction)

    // Should call addReaction
    expect(mockChatAPI.addReaction).toHaveBeenCalledWith('msg-1', '👍')
  })

  it('should group reactions by emoji', async () => {
    // Update mock to have multiple of same emoji
    const mockWithGroupedReactions: Partial<ChatAPI> = {
      ...mockChatAPI,
      onMessagesUpdate: vi.fn((callback) => {
        callback([
          {
            id: 'msg-1',
            content: 'Popular message!',
            author: 'alice',
            timestamp: Date.now(),
            isOwn: true,
            reactions: [
              { emoji: '👍', author: 'bob', timestamp: Date.now() },
              { emoji: '👍', author: 'charlie', timestamp: Date.now() },
              { emoji: '👍', author: 'david', timestamp: Date.now() },
              { emoji: '❤️', author: 'eve', timestamp: Date.now() }
            ]
          }
        ])
        return () => {}
      })
    }

    const { container } = render(
      <ChatInterface
        deviceId="alice"
        currentSimTime={0}
        imageAttachmentPercentage={0}
        onManualMessage={vi.fn()}
        chatAPI={mockWithGroupedReactions as ChatAPI}
      />
    )

    await waitFor(() => {
      // Should show grouped count for thumbs up
      const thumbsUp = container.querySelector('.reaction-badge')!
      expect(thumbsUp.textContent).toContain('👍')
      expect(thumbsUp.textContent).toContain('3') // Count
      
      // Should show single heart
      const hearts = Array.from(container.querySelectorAll('.reaction-badge'))
        .find(el => el.textContent?.includes('❤️'))
      expect(hearts?.textContent).toContain('1')
    })
  })
})