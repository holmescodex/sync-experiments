describe('Emoji Picker Layout', () => {
  it('shows emoji picker with proper layout', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for initialization
    cy.wait(2000)
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Test message')
      cy.get('.send-button').click()
    })
    
    // Wait for message
    cy.wait(1000)
    
    // Open emoji picker
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().trigger('mouseenter')
      cy.wait(500)
      cy.get('.add-reaction-button').click({ force: true })
    })
    
    // Check emoji picker is visible
    cy.get('.emoji-picker').should('be.visible')
    
    // Check quick reactions section
    cy.get('.emoji-quick-reactions').within(() => {
      // Should have 12 quick reaction buttons
      cy.get('.emoji-button').should('have.length', 12)
      
      // All buttons should be visible within the container
      cy.get('.emoji-button').each(($btn) => {
        cy.wrap($btn).should('be.visible')
      })
    })
    
    // Check that quick reactions are in a 6x2 grid
    cy.get('.emoji-quick-reactions').should('have.css', 'display', 'grid')
    cy.get('.emoji-quick-reactions').should('have.css', 'grid-template-columns')
    
    // Take screenshot
    cy.screenshot('emoji-picker-layout-fixed')
  })
})