describe('Basic Sync Test', () => {
  it('tests basic message sync between devices', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait longer for initialization
    cy.wait(5000)
    
    // Check if both chat interfaces are loaded
    cy.get('[data-testid="chat-alice"]').should('exist')
    cy.get('[data-testid="chat-bob"]').should('exist')
    
    // Wait for auto-generated messages to appear
    cy.wait(10000) // Wait for simulation to generate messages
    
    // Check if any messages appear in Alice's chat
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message').should('have.length.greaterThan', 0)
    })
    
    // Check if any messages appear in Bob's chat
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message').should('have.length.greaterThan', 0)
    })
    
    // Take screenshot of current state
    cy.screenshot('basic-sync-state')
  })
})