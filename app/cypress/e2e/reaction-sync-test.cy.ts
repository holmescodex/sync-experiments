describe('Reaction Sync Test', () => {
  it('tests reactions sync between Alice and Bob', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for app to initialize
    cy.wait(3000)
    
    // Alice sends a message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hello Bob! React to this message')
      cy.get('.send-button').click()
    })
    
    // Wait for sync
    cy.wait(3000)
    
    // Bob should see the message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').should('contain', 'Hello Bob! React to this message')
      
      // Bob adds a reaction
      cy.get('.message.received').first().trigger('mouseenter')
      cy.wait(500)
      cy.get('.add-reaction-button').click({ force: true })
    })
    
    // Select heart emoji
    cy.get('.emoji-picker').should('be.visible')
    cy.get('.emoji-picker .emoji-button').contains('❤️').click()
    
    // Wait for reaction to sync
    cy.wait(3000)
    
    // Verify Bob sees his own reaction
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().within(() => {
        cy.get('.reaction-badge').should('exist')
        cy.get('.reaction-badge').contains('❤️').should('exist')
        cy.get('.reaction-count').should('contain', '1')
      })
    })
    
    // Verify Alice sees Bob's reaction
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().within(() => {
        cy.get('.reaction-badge').should('exist')
        cy.get('.reaction-badge').contains('❤️').should('exist')
        cy.get('.reaction-count').should('contain', '1')
      })
    })
    
    // Alice adds another reaction
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().trigger('mouseenter')
      cy.wait(500)
      cy.get('.add-reaction-button').click({ force: true })
    })
    
    // Select thumbs up
    cy.get('.emoji-picker').should('be.visible')
    cy.get('.emoji-picker .emoji-button').contains('👍').click()
    
    // Wait for sync
    cy.wait(3000)
    
    // Both should see both reactions
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().within(() => {
        cy.get('.reaction-badge').should('have.length', 2)
        cy.get('.reaction-badge').contains('❤️').should('exist')
        cy.get('.reaction-badge').contains('👍').should('exist')
      })
    })
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().within(() => {
        cy.get('.reaction-badge').should('have.length', 2)
        cy.get('.reaction-badge').contains('❤️').should('exist')
        cy.get('.reaction-badge').contains('👍').should('exist')
      })
    })
    
    // Take final screenshot
    cy.screenshot('reactions-synced-between-devices')
  })
})