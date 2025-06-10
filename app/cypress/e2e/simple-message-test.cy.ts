describe('Simple Message Test', () => {
  beforeEach(() => {
    // Handle uncaught exceptions to avoid jimp issue
    cy.on('uncaught:exception', (err, runnable) => {
      // Ignore jimp import errors
      if (err.message.includes('jimp')) {
        return false
      }
      return true
    })
    
    cy.visit('http://localhost:5173')
    cy.wait(3000) // Wait for app initialization
  })

  it('should allow manual messages to be sent from each device', () => {
    // Test Alice sending a message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hello from Alice')
      cy.get('.send-button').click()
    })
    
    // Verify Alice's message appears
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Hello from Alice').should('be.visible')
    })
    
    // Test Bob sending a message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Hello from Bob')
      cy.get('.send-button').click()
    })
    
    // Verify Bob's message appears
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Hello from Bob').should('be.visible')
    })
    
    // Check that messages appear in the event timeline
    cy.get('[data-testid="event-timeline"]').should('exist')
    cy.get('[data-testid="executed-event"]').should('have.length.at.least', 2)
  })

  it('should show timeline events trigger automatic messages', () => {
    // Wait for some automatic messages to be generated
    cy.wait(5000)
    
    // Check that executed events exist
    cy.get('[data-testid="executed-event"]').should('have.length.at.least', 1)
    
    // Verify events show in timeline with device info
    cy.get('[data-testid="executed-event"]').first().within(() => {
      // Should show either alice or bob as sender
      cy.get('body').then($body => {
        const text = $body.text()
        expect(text).to.match(/alice|bob/)
      })
    })
    
    // Messages from timeline should appear in chat interfaces
    cy.get('[data-testid="chat-alice"] .message, [data-testid="chat-bob"] .message')
      .should('have.length.at.least', 1)
  })

  it('should handle messages between devices (no backend sync)', () => {
    // This test verifies the UI behavior even without cross-device sync
    
    // Send from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Test message for sync')
      cy.get('.send-button').click()
    })
    
    // Send from Bob
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Reply from Bob')
      cy.get('.send-button').click()
    })
    
    // Check sync indicators exist
    cy.get('[data-testid="chat-alice"] [data-testid="sync-indicator"]').should('be.visible')
    cy.get('[data-testid="chat-bob"] [data-testid="sync-indicator"]').should('be.visible')
    
    // Check database stats are shown
    cy.get('[data-testid="chat-alice"] .db-stats').should('be.visible')
    cy.get('[data-testid="chat-bob"] .db-stats').should('be.visible')
  })
})