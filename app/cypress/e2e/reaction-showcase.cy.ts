describe('Reaction Feature Showcase', () => {
  it('demonstrates polished reaction functionality', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for app initialization
    cy.wait(3000)
    
    // Scroll to chat section
    cy.get('.simulation-section').scrollIntoView()
    cy.wait(500)
    
    // Send some messages for the demo
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hey Bob! Just launched the new reaction feature! 🎉')
      cy.get('.send-button').click()
    })
    
    cy.wait(2000)
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Wow Alice, this looks amazing! Can\'t wait to try it')
      cy.get('.send-button').click()
    })
    
    cy.wait(2000)
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Try reacting to any message with the emoji button')
      cy.get('.send-button').click()
    })
    
    cy.wait(3000)
    
    // Screenshot the initial conversation
    cy.get('.chat-apps').screenshot('1-initial-conversation')
    
    // Bob reacts to Alice's first message
    cy.get('[data-testid="chat-bob"]').within(() => {
      // Hover to show reaction button
      cy.get('.message.received').first().trigger('mouseenter')
      cy.wait(500)
      
      // Click reaction button
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    // Wait for emoji picker
    cy.get('.emoji-picker').should('be.visible')
    cy.wait(500)
    
    // Take screenshot with emoji picker open
    cy.screenshot('2-emoji-picker-open', { capture: 'viewport' })
    
    // Select heart emoji
    cy.get('.emoji-picker .emoji-button').contains('❤️').click()
    
    cy.wait(2000)
    
    // Alice reacts to Bob's message with thumbs up
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.received').first().trigger('mouseenter')
      cy.wait(300)
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    cy.get('.emoji-picker .emoji-button').contains('👍').click()
    
    cy.wait(1500)
    
    // Bob adds another reaction to Alice's message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().trigger('mouseenter')
      cy.get('.message.received').first().find('.add-reaction-button').click({ force: true })
    })
    
    cy.get('.emoji-picker .emoji-button').contains('🔥').click()
    
    cy.wait(1500)
    
    // Alice joins Bob's heart reaction
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().find('.reaction-badge').contains('❤️').click()
    })
    
    cy.wait(2000)
    
    // Screenshot showing reactions
    cy.get('.chat-apps').screenshot('3-messages-with-reactions')
    cy.screenshot('4-full-app-with-reactions', { capture: 'viewport' })
    
    // Show different emoji categories
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.received').last().trigger('mouseenter')
      cy.get('.message.received').last().find('.add-reaction-button').click({ force: true })
    })
    
    // Click through categories
    cy.get('.emoji-picker .emoji-category').contains('Food').click()
    cy.wait(300)
    cy.screenshot('5-food-emojis', { capture: 'viewport' })
    
    cy.get('.emoji-picker .emoji-search').type('pizza')
    cy.wait(300)
    cy.screenshot('6-emoji-search', { capture: 'viewport' })
    
    cy.get('.emoji-picker .emoji-button').contains('🍕').click()
    
    cy.wait(2000)
    
    // Final polished view
    cy.get('.chat-apps').screenshot('7-final-reaction-showcase')
    
    // Mobile responsive
    cy.viewport(375, 812)
    cy.wait(500)
    cy.get('.chat-apps').scrollIntoView()
    cy.screenshot('8-mobile-reactions', { capture: 'viewport' })
  })
})