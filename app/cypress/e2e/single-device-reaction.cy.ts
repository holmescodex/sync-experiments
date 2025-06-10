describe('Single Device Reaction Test', () => {
  it('tests reactions work on a single device', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for app to initialize
    cy.wait(3000)
    
    // Alice sends a message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Testing my own reactions')
      cy.get('.send-button').click()
    })
    
    // Wait for message to appear
    cy.wait(2000)
    
    // Alice adds a reaction to her own message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().trigger('mouseenter')
      cy.wait(500)
      cy.get('.add-reaction-button').click({ force: true })
    })
    
    // Select emoji
    cy.get('.emoji-picker').should('be.visible')
    cy.get('.emoji-picker .emoji-button').contains('😊').click()
    
    // Wait for reaction
    cy.wait(2000)
    
    // Verify reaction appears
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().within(() => {
        cy.get('.reaction-badge').should('exist')
        cy.get('.reaction-badge').contains('😊').should('exist')
        cy.get('.reaction-count').should('contain', '1')
        
        // The reaction should show as "own" (different styling)
        cy.get('.reaction-badge.own').should('exist')
      })
    })
    
    // Add another reaction
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().trigger('mouseenter')
      cy.wait(500)
      cy.get('.add-reaction-button').click({ force: true })
    })
    
    cy.get('.emoji-picker .emoji-button').contains('🎉').click()
    cy.wait(2000)
    
    // Should see 2 reactions
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().within(() => {
        cy.get('.reaction-badge').should('have.length', 2)
      })
    })
    
    // Click on existing reaction to remove it
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().within(() => {
        cy.get('.reaction-badge').contains('😊').click()
      })
    })
    
    cy.wait(2000)
    
    // Should see only 1 reaction now
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().within(() => {
        cy.get('.reaction-badge').should('have.length', 1)
        cy.get('.reaction-badge').contains('🎉').should('exist')
        cy.get('.reaction-badge').contains('😊').should('not.exist')
      })
    })
    
    // Take screenshot
    cy.screenshot('single-device-reactions-working')
  })
})