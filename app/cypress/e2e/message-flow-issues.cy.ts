describe('Message Flow Issues', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5176')
    cy.wait(2000) // Wait for app initialization
  })

  it('should show manual messages in the timeline', () => {
    // Send a manual message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('input[type="text"]').type('Manual message from Alice')
      cy.get('button[aria-label="Send message"]').click()
    })
    
    // Check if message appears in timeline
    cy.get('[data-testid="event-timeline"]').within(() => {
      cy.get('[data-testid="executed-event"]').contains('Manual message from Alice').should('be.visible')
    })
    
    // Check if message appears in Alice's chat
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Manual message from Alice').should('be.visible')
    })
  })

  it('should create network events for manual messages', () => {
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('input[type="text"]').type('Test network event')
      cy.get('button[aria-label="Send message"]').click()
    })
    
    // Wait a moment
    cy.wait(1000)
    
    // Check network events section
    cy.get('.network-log').within(() => {
      cy.contains('MESSAGE').should('be.visible')
      cy.contains('alice → bob').should('be.visible')
    })
  })

  it('should sync manual messages between devices', () => {
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('input[type="text"]').type('Hello Bob from Alice')
      cy.get('button[aria-label="Send message"]').click()
    })
    
    // Wait for sync
    cy.wait(2000)
    
    // Check if Bob received the message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Hello Bob from Alice').should('be.visible')
    })
    
    // Send a reply from Bob
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('input[type="text"]').type('Hello Alice from Bob')
      cy.get('button[aria-label="Send message"]').click()
    })
    
    // Wait for sync
    cy.wait(2000)
    
    // Check if Alice received the reply
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Hello Alice from Bob').should('be.visible')
    })
  })

  it('should move events past the now marker when running', () => {
    // Make sure simulation is running
    cy.get('[data-testid="play-pause-button"]').then($btn => {
      if ($btn.text().includes('Resume')) {
        cy.wrap($btn).click()
      }
    })
    
    // Enable automatic message generation
    cy.get('[data-testid="device-controls-alice"]').within(() => {
      cy.get('input[type="checkbox"]').check()
    })
    
    // Wait for some events to be generated
    cy.wait(5000)
    
    // Check that events moved to executed section
    cy.get('[data-testid="event-timeline"]').within(() => {
      cy.get('[data-testid="executed-event"]').should('have.length.greaterThan', 0)
    })
    
    // Check that messages appear in chat interfaces
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-bubble.own').should('exist')
    })
  })

  it('should handle events when paused', () => {
    // Pause the simulation
    cy.get('[data-testid="play-pause-button"]').then($btn => {
      if ($btn.text().includes('Pause')) {
        cy.wrap($btn).click()
      }
    })
    
    // Send a manual message while paused
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('input[type="text"]').type('Message while paused')
      cy.get('button[aria-label="Send message"]').click()
    })
    
    // Manual messages should still work when paused
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Message while paused').should('be.visible')
    })
    
    // Check if it syncs to Bob
    cy.wait(2000)
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Message while paused').should('be.visible')
    })
  })
})