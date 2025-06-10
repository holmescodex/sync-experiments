describe('Basic Message Test', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5176')
    cy.wait(3000) // Wait for app initialization and backend connection
  })

  it('should display manual message in sender chat', () => {
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('input[type="text"]').type('Test message from Alice')
      cy.get('button[aria-label="Send message"]').click()
      
      // Verify message appears
      cy.contains('Test message from Alice').should('be.visible')
    })
  })

  it('should have backend connection', () => {
    // Check that messages count is visible (indicates backend is connected)
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('messages').should('be.visible')
    })
  })

  it('should show message in timeline when sent', () => {
    // Send a message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('input[type="text"]').type('Timeline test message')
      cy.get('button[aria-label="Send message"]').click()
    })
    
    // Check timeline
    cy.get('[data-testid="event-timeline"]').should('be.visible')
    
    // Wait a bit for the event to appear
    cy.wait(1000)
    
    // Check if any executed events exist
    cy.get('[data-testid="executed-event"]').should('exist')
  })
})