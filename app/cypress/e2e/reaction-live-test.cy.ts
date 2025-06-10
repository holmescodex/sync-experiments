describe('Live Reaction Test', () => {
  it('adds reactions that persist in the UI', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for initialization
    cy.wait(3000)
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Testing reactions!')
      cy.get('.send-button').click()
    })
    
    cy.wait(3000) // Wait for sync
    
    // Bob should see the message
    cy.get('[data-testid="chat-bob"]').within(() => {
      // Hover over the received message to show reaction button
      cy.get('.message.received').first().trigger('mouseenter')
      cy.wait(500)
      
      // Click the add reaction button
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    // Wait for emoji picker
    cy.get('.emoji-picker').should('be.visible')
    cy.wait(500)
    
    // Select a heart emoji
    cy.get('.emoji-picker .emoji-button').contains('❤️').click()
    
    // Wait for reaction to be processed
    cy.wait(3000)
    
    // Check that Bob sees the reaction on the message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().within(() => {
        cy.get('.reaction-badge').should('exist')
        cy.get('.reaction-badge').contains('❤️').should('exist')
        cy.get('.reaction-count').should('contain', '1')
      })
    })
    
    // Alice should also see the reaction after sync
    cy.wait(2000)
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().within(() => {
        cy.get('.reaction-badge').should('exist')
        cy.get('.reaction-badge').contains('❤️').should('exist')
        cy.get('.reaction-count').should('contain', '1')
      })
    })
    
    // Take screenshots
    cy.screenshot('reactions-working', { capture: 'viewport' })
    cy.get('.chat-apps').screenshot('chat-with-reactions-live')
  })
})