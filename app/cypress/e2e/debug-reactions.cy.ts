describe('Debug Reactions', () => {
  it('debugs reaction display issue', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for initialization
    cy.wait(2000)
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Debug message for reactions')
      cy.get('.send-button').click()
    })
    
    cy.wait(2000) // Wait for sync
    
    // Bob should see the message
    cy.get('[data-testid="chat-bob"]').within(() => {
      // Verify message is received
      cy.get('.message.received').should('contain', 'Debug message for reactions')
      
      // Hover and add reaction
      cy.get('.message.received').first().trigger('mouseenter')
      cy.get('.add-reaction-button').should('be.visible')
      cy.get('.add-reaction-button').click()
    })
    
    // Select emoji
    cy.get('.emoji-picker').should('be.visible')
    cy.get('.emoji-picker .emoji-button').contains('👍').click()
    
    // Wait for reaction to process
    cy.wait(3000)
    
    // Debug: Check if reaction appears
    cy.get('[data-testid="chat-bob"]').within(() => {
      // Log what we see
      cy.get('.message.received').first().then($msg => {
        console.log('Message HTML:', $msg.html())
      })
      
      // Check for reaction elements
      cy.get('.message-reactions').should('exist')
      cy.get('.reaction-badge').should('exist')
    })
    
    // Take screenshot
    cy.screenshot('debug-reactions-state')
  })
})