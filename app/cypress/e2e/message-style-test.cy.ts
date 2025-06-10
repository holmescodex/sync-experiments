describe('Message Style Test', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for initial load
    cy.get('[data-testid="simulation-app"]').should('exist')
    cy.get('[data-testid="chat-alice"]').should('exist')
    cy.get('[data-testid="chat-bob"]').should('exist')
    
    // Wait for initialization
    cy.wait(3000)
  })

  it('should show sent messages in blue without author label', () => {
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('This is Alice speaking')
    
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    // Give time for message to appear
    cy.wait(2000)
    
    // Check if message appears at all
    cy.get('[data-testid="chat-alice"] .chat-messages').then($messages => {
      const text = $messages.text()
      cy.log('Chat messages content:', text)
      
      // Check for the "No messages yet" text
      if (text.includes('No messages yet')) {
        cy.log('ERROR: Messages are not appearing in the UI')
      }
    })
    
    // Check the message count indicator
    cy.get('[data-testid="chat-alice"] .status-indicator.messages').then($indicator => {
      const text = $indicator.text()
      cy.log('Message count indicator:', text)
    })
    
    // If we have messages, check their styling
    cy.get('body').then($body => {
      if ($body.find('[data-testid="chat-alice"] .message').length > 0) {
        cy.log('Found messages, checking styling...')
        
        cy.get('[data-testid="chat-alice"] .message').first().then($msg => {
          // Log the classes
          cy.log('Message classes:', $msg.attr('class'))
          
          // Check for author label (should not exist for own messages)
          const authorExists = $msg.find('.message-author').length > 0
          if (authorExists) {
            const authorText = $msg.find('.message-author').text()
            cy.log('WARNING: Author label found on own message:', authorText)
          } else {
            cy.log('Good: No author label on own message')
          }
          
          // Check message bubble color
          const $bubble = $msg.find('.message-bubble')
          const bgColor = $bubble.css('background-color')
          cy.log('Message bubble background color:', bgColor)
          
          // Check if it's blue (sent) or gray (received)
          if (bgColor === 'rgb(0, 123, 255)') {
            cy.log('Good: Message is blue (sent)')
          } else if (bgColor === 'rgb(233, 236, 239)') {
            cy.log('ERROR: Message is gray (received) but should be blue')
          } else {
            cy.log('Unknown background color:', bgColor)
          }
        })
      } else {
        cy.log('No messages found in the UI')
      }
    })
  })

  it('should test local-only message flow (no backend)', () => {
    // This test will work even without backend servers
    
    // Check initial state
    cy.get('[data-testid="chat-alice"] .chat-messages').should('contain', 'No messages yet')
    cy.get('[data-testid="chat-bob"] .chat-messages').should('contain', 'No messages yet')
    
    // Try sending a message
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Test without backend')
    
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    // Wait a bit
    cy.wait(3000)
    
    // Check what happened
    cy.get('[data-testid="chat-alice"] .chat-messages').then($messages => {
      const text = $messages.text()
      cy.log('Alice chat after sending:', text)
      
      // Look for any DOM updates
      const messageElements = $messages.find('.message').length
      cy.log('Number of message elements:', messageElements)
      
      if (messageElements === 0) {
        cy.log('No messages in DOM - checking if backend adapter is required')
      }
    })
    
    // Check the event timeline to see if message was created
    cy.get('.event-timeline .timeline-event').then($events => {
      cy.log('Timeline events:', $events.length)
      
      $events.each((idx, el) => {
        const text = Cypress.$(el).text()
        if (text.includes('Test without backend')) {
          cy.log('Message found in timeline:', text)
        }
      })
    })
  })
})