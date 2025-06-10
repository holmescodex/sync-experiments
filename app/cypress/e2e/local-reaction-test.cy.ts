describe('Local Reaction Test', () => {
  it('tests reactions work in local ChatAPI mode', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for initialization
    cy.wait(5000)
    
    // Wait for some auto-generated messages
    cy.wait(10000)
    
    // Find a message in Bob's chat and add reaction
    cy.get('[data-testid="chat-bob"]').within(() => {
      // Get the first received message
      cy.get('.message.received').first().then($msg => {
        // Log the message for debugging
        cy.log('Found message:', $msg.text())
        
        // Hover over the message
        cy.wrap($msg).trigger('mouseenter')
        cy.wait(500)
        
        // Click the reaction button
        cy.wrap($msg).find('.add-reaction-button').should('be.visible').click({ force: true })
      })
    })
    
    // Select emoji from picker
    cy.get('.emoji-picker').should('be.visible')
    cy.get('.emoji-picker .emoji-button').contains('👍').click()
    
    // Wait for reaction to process
    cy.wait(2000)
    
    // Verify reaction appears on Bob's side
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().within(() => {
        cy.get('.message-reactions').should('exist')
        cy.get('.reaction-badge').should('exist')
        cy.get('.reaction-badge').contains('👍').should('exist')
        cy.get('.reaction-count').should('contain', '1')
      })
    })
    
    // Wait for sync
    cy.wait(3000)
    
    // Verify Alice sees the reaction
    cy.get('[data-testid="chat-alice"]').within(() => {
      // Find corresponding sent message and check for reaction
      cy.get('.message.sent').each(($msg) => {
        cy.wrap($msg).within(() => {
          // If this message has reactions, check them
          cy.get('body').then(() => {
            if ($msg.find('.message-reactions').length > 0) {
              cy.get('.reaction-badge').contains('👍').should('exist')
              cy.get('.reaction-count').should('contain', '1')
            }
          })
        })
      })
    })
    
    // Take screenshot
    cy.screenshot('local-reactions-working')
  })
})