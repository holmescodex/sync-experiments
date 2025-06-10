describe('Reaction UI Debug', () => {
  it('shows reactions with always-visible buttons', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for initialization
    cy.wait(2000)
    
    // Add CSS to always show reaction buttons
    cy.window().then((win) => {
      const doc = win.document
      const style = doc.createElement('style')
      style.innerHTML = `
        .add-reaction-button { 
          opacity: 1 !important; 
          visibility: visible !important;
        }
      `
      doc.head.appendChild(style)
    })
    
    // Send some messages
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hello Bob! Check out these reaction buttons →')
      cy.get('.send-button').click()
    })
    
    cy.wait(1500)
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('← Hey Alice! The buttons look great!')
      cy.get('.send-button').click()
    })
    
    cy.wait(1500)
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Let me send another message to test layout')
      cy.get('.send-button').click()
    })
    
    cy.wait(1500)
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('And one more from me too!')
      cy.get('.send-button').click()
    })
    
    // Wait for messages to sync
    cy.wait(3000)
    
    // Take screenshot showing all reaction buttons
    cy.screenshot('1-all-reaction-buttons-visible', { capture: 'viewport' })
    
    // Zoom in on just the chat interfaces
    cy.get('.chat-apps').screenshot('2-chat-interfaces-with-buttons')
    
    // Add some reactions
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    cy.wait(500)
    
    // Take screenshot with emoji picker
    cy.get('.emoji-picker').should('be.visible')
    cy.screenshot('3-emoji-picker-position', { capture: 'viewport' })
    
    // Select a reaction
    cy.get('.emoji-picker .emoji-button').contains('❤️').click()
    
    cy.wait(1500)
    
    // Add more reactions
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    cy.get('.emoji-picker .emoji-button').contains('👍').click()
    
    cy.wait(1000)
    
    // Add another reaction to same message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    cy.get('.emoji-picker .emoji-button').contains('😂').click()
    
    cy.wait(1000)
    
    // Alice adds to existing reaction
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().find('.reaction-badge').contains('❤️').click()
    })
    
    cy.wait(1500)
    
    // Final screenshots
    cy.screenshot('4-messages-with-reactions', { capture: 'viewport' })
    cy.get('.chat-apps').screenshot('5-final-chat-view')
    
    // Mobile view
    cy.viewport(375, 812)
    cy.wait(500)
    cy.screenshot('6-mobile-view-with-reactions', { capture: 'viewport' })
  })
})