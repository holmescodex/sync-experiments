describe('Message Ownership Display', () => {
  beforeEach(() => {
    // Start backend servers before each test
    cy.exec('cd ../backend && npm run test:start', { failOnNonZeroExit: false })
    cy.wait(3000) // Wait for backends to start
  })

  afterEach(() => {
    // Stop backend servers after each test
    cy.exec('cd ../backend && npm run test:stop', { failOnNonZeroExit: false })
  })

  it('should immediately display sent messages with correct ownership styling', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for app initialization and backend connection
    cy.wait(3000)
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      // Wait for the chat interface to be ready
      cy.get('.message-input').should('be.visible')
      
      // Type a message
      cy.get('.message-input').type('Test message from Alice')
      cy.get('.send-button').click()
      
      // The message should immediately appear as a sent message (blue bubble, right-aligned)
      cy.get('.message', { timeout: 5000 }).should('have.length.at.least', 1)
      cy.get('.message').first().should('have.class', 'sent')
      cy.get('.message').first().should('not.have.class', 'received')
      cy.get('.message-bubble').should('have.css', 'background-color', 'rgb(0, 123, 255)')
      
      // Take a screenshot of the immediate state
      cy.screenshot('alice-message-sent-immediate')
      
      // Verify it stays as sent after backend confirmation (wait for polling)
      cy.wait(2000)
      cy.get('.message').first().should('have.class', 'sent')
      cy.get('.message-bubble').should('have.css', 'background-color', 'rgb(0, 123, 255)')
    })
    
    // Now check that Bob sees it as received
    cy.get('[data-testid="chat-bob"]').within(() => {
      // Wait for sync
      cy.wait(3000)
      
      // Bob should see the message as received (grey bubble, left-aligned)
      cy.get('.message', { timeout: 10000 }).should('have.length.at.least', 1)
      cy.get('.message').first().should('have.class', 'received')
      cy.get('.message').first().should('not.have.class', 'sent')
      cy.get('.message-bubble').should('have.css', 'background-color', 'rgb(233, 236, 239)')
      
      // Take a screenshot showing the difference
      cy.screenshot('bob-sees-alice-message-as-received')
    })
    
    // Send a message from Bob
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Reply from Bob')
      cy.get('.send-button').click()
      
      // Should immediately appear as sent for Bob
      cy.get('.message.sent').should('have.length.at.least', 1)
      cy.get('.message.sent').last().within(() => {
        cy.get('.message-bubble').should('have.css', 'background-color', 'rgb(0, 123, 255)')
      })
    })
    
    // Alice should see Bob's message as received
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.wait(3000)
      cy.get('.message.received', { timeout: 10000 }).should('have.length.at.least', 1)
      cy.get('.message.received').last().within(() => {
        cy.get('.message-bubble').should('have.css', 'background-color', 'rgb(233, 236, 239)')
      })
    })
    
    // Take final screenshot showing both perspectives
    cy.screenshot('final-message-ownership-display')
  })
  
  it('should display simulation messages with correct ownership', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    cy.wait(3000)
    
    // Enable message generation for Alice
    cy.get('.device-toggle input[type="checkbox"]').first().check()
    
    // Wait for a simulation message to appear
    cy.get('[data-testid="chat-alice"]').within(() => {
      // Simulation messages from Alice should appear as sent
      cy.get('.message', { timeout: 30000 }).should('exist')
      cy.get('.message').first().should('have.class', 'sent')
      cy.get('.message-bubble').should('have.css', 'background-color', 'rgb(0, 123, 255)')
    })
    
    // Bob should see Alice's simulation messages as received
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.wait(3000)
      cy.get('.message', { timeout: 10000 }).should('exist')
      cy.get('.message').first().should('have.class', 'received')
      cy.get('.message-bubble').should('have.css', 'background-color', 'rgb(233, 236, 239)')
    })
    
    cy.screenshot('simulation-message-ownership')
  })
})