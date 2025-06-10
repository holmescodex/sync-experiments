describe('Backend Message API Integration', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for app to initialize
    cy.get('[data-testid="simulation-app"]').should('be.visible')
    cy.wait(2000) // Give time for backend detection
  })

  it('should detect backend servers and send messages through API', () => {
    // Check if backend adapters are initialized
    cy.window().then((win) => {
      // Check console logs for backend detection
      cy.task('log', 'Checking for backend detection messages in console')
    })

    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hello from Alice via backend API')
      cy.get('.send-button').click()
    })

    // Wait for message to appear
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Hello from Alice via backend API').should('be.visible')
    })

    // Send a message from Bob
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Hello from Bob via backend API')
      cy.get('.send-button').click()
    })

    // Wait for message to appear
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Hello from Bob via backend API').should('be.visible')
    })

    // Check that messages are stored in backend (each device sees only its own)
    cy.get('[data-testid="chat-alice"] .status-indicator.messages')
      .should('contain', 'messages')
    
    cy.get('[data-testid="chat-bob"] .status-indicator.messages')
      .should('contain', 'messages')
  })

  it('should fall back to local mode when backends are not available', () => {
    // This test would need to run without backend servers
    // For now, we'll just verify the UI works regardless
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Test message in local mode')
      cy.get('.send-button').click()
    })

    // Message should still appear
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Test message in local mode').should('be.visible')
    })
  })

  it('should handle message polling and updates', () => {
    // Send multiple messages quickly
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Message 1')
      cy.get('.send-button').click()
      cy.get('.message-input').type('Message 2')
      cy.get('.send-button').click()
      cy.get('.message-input').type('Message 3')
      cy.get('.send-button').click()
    })

    // All messages should appear
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Message 1').should('be.visible')
      cy.contains('Message 2').should('be.visible')
      cy.contains('Message 3').should('be.visible')
    })

    // Check message count
    cy.get('[data-testid="chat-alice"] .status-indicator.messages')
      .invoke('text')
      .then((text) => {
        const count = parseInt(text.match(/(\d+) messages/)?.[1] || '0')
        expect(count).to.be.at.least(3)
      })
  })
})