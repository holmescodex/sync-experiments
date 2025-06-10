describe('Reaction Feature Demo', () => {
  it('demonstrates the reaction feature', () => {
    cy.visit('/')
    cy.viewport(1200, 800)
    
    // Wait for initialization
    cy.wait(3000)
    
    // Send initial messages
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hey Bob! Check out this awesome reaction feature! 🎉')
      cy.get('.send-button').click()
    })
    
    cy.wait(1500)
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Wow Alice! That looks really cool!')
      cy.get('.send-button').click()
    })
    
    cy.wait(1500)
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('You can react to any message with emojis')
      cy.get('.send-button').click()
    })
    
    // Wait for sync
    cy.wait(3000)
    
    // Screenshot the messages
    cy.screenshot('1-messages-sent', { capture: 'viewport' })
    
    // Add CSS to force show reaction buttons
    cy.document().then(doc => {
      const style = doc.createElement('style')
      style.innerHTML = `
        .add-reaction-button { 
          opacity: 1 !important; 
          display: block !important;
        }
        .message:hover .add-reaction-button {
          opacity: 1 !important;
        }
      `
      doc.head.appendChild(style)
    })
    
    cy.wait(500)
    cy.screenshot('2-reaction-buttons-visible', { capture: 'viewport' })
    
    // Bob reacts to Alice's first message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    // Wait for emoji picker
    cy.get('.emoji-picker', { timeout: 5000 }).should('be.visible')
    cy.screenshot('3-emoji-picker-open', { capture: 'viewport' })
    
    // Select heart emoji
    cy.get('.emoji-picker .quick-reactions .emoji-button').contains('❤️').click()
    
    cy.wait(2000)
    cy.screenshot('4-first-reaction-added', { capture: 'viewport' })
    
    // Alice reacts to Bob's message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    cy.get('.emoji-picker .quick-reactions .emoji-button').contains('👍').click()
    
    cy.wait(1000)
    
    // Bob adds another reaction
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    cy.get('.emoji-picker .quick-reactions .emoji-button').contains('🔥').click()
    
    cy.wait(1000)
    
    // Alice adds to Bob's existing reaction
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().within(() => {
        // Click on the heart reaction to add to it
        cy.get('.reaction-badge').contains('❤️').click()
      })
    })
    
    cy.wait(2000)
    cy.screenshot('5-multiple-reactions', { capture: 'viewport' })
    
    // Show emoji categories
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.received').last().find('.add-reaction-button').click({ force: true })
    })
    
    cy.get('.emoji-picker .emoji-category').contains('Food').click()
    cy.wait(500)
    cy.screenshot('6-emoji-picker-food-category', { capture: 'viewport' })
    
    // Search for emojis
    cy.get('.emoji-picker .emoji-search').clear().type('cake')
    cy.wait(500)
    cy.screenshot('7-emoji-search', { capture: 'viewport' })
    
    // Select cake emoji
    cy.get('.emoji-picker .emoji-button').contains('🎂').click()
    
    cy.wait(2000)
    
    // Final overview
    cy.screenshot('8-final-reactions-overview', { capture: 'fullPage' })
    
    // Close-up of chat interfaces
    cy.get('.chat-grid').screenshot('9-chat-interfaces-closeup')
  })
})