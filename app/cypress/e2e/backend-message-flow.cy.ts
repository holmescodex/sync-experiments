describe('Backend Message Flow', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5176') // Or whatever port the frontend is on
    
    // Wait for app to initialize
    cy.contains('alice').should('be.visible')
    cy.contains('bob').should('be.visible')
    
    // Wait for backend connection
    cy.wait(2000) // Give time for backend adapters to initialize
  })

  it('should send manual messages through backend API', () => {
    // Type a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('input[type="text"]').type('Hello from Alice via backend')
      cy.get('button[aria-label="Send message"]').click()
    })
    
    // Wait for message to appear in Alice's chat
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Hello from Alice via backend').should('be.visible')
      // Check if message is shown as "own" (blue)
      cy.contains('Hello from Alice via backend')
        .closest('.message-bubble')
        .should('have.class', 'own')
    })
    
    // Wait for sync
    cy.wait(2000)
    
    // Check if Bob received the message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Hello from Alice via backend').should('be.visible')
      // Check if message is shown as received (gray)
      cy.contains('Hello from Alice via backend')
        .closest('.message-bubble')
        .should('not.have.class', 'own')
    })
  })

  it('should send simulation timeline messages through backend', () => {
    // Enable automatic message generation
    cy.get('.device-controls').first().within(() => {
      cy.get('input[type="checkbox"]').check()
    })
    
    // Wait for a simulated message
    cy.wait(5000)
    
    // Check that simulated messages appear in both devices
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-bubble.own').should('exist')
    })
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-bubble').should('exist')
    })
  })

  it('should persist messages after page reload', () => {
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('input[type="text"]').type('Persistent message')
      cy.get('button[aria-label="Send message"]').click()
    })
    
    // Wait for message
    cy.contains('Persistent message').should('be.visible')
    
    // Reload page
    cy.reload()
    
    // Wait for app to reinitialize
    cy.wait(2000)
    
    // Check message is still there
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Persistent message').should('be.visible')
    })
  })

  it('should clear all messages on reset', () => {
    // Send some messages
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('input[type="text"]').type('Message to be cleared')
      cy.get('button[aria-label="Send message"]').click()
    })
    
    cy.contains('Message to be cleared').should('be.visible')
    
    // Click reset button
    cy.get('[data-testid="reset-button"]').click()
    
    // Wait for reload
    cy.wait(3000)
    
    // Verify messages are cleared
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Message to be cleared').should('not.exist')
      cy.contains('0 messages').should('be.visible')
    })
  })
})