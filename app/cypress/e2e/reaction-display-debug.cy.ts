describe('Reaction Display Debug', () => {
  it('debugs why reactions are not displaying', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for app to initialize
    cy.wait(3000)
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Test message for reactions')
      cy.get('.send-button').click()
    })
    
    // Wait for message to appear
    cy.wait(2000)
    
    // Find the message in Alice's chat
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().then($msg => {
        // Get the message ID from data attribute if available
        const msgText = $msg.text()
        cy.log('Found message:', msgText)
        
        // Hover to show reaction button
        cy.wrap($msg).trigger('mouseenter')
        cy.wait(500)
        
        // Click reaction button
        cy.wrap($msg).find('.add-reaction-button').click({ force: true })
      })
    })
    
    // Select emoji
    cy.get('.emoji-picker').should('be.visible')
    cy.get('.emoji-picker .emoji-button').contains('👍').click()
    
    // Wait for reaction to be processed
    cy.wait(3000)
    
    // Check console for errors
    cy.window().then((win) => {
      cy.log('Checking console for errors...')
    })
    
    // Check if reactions are in the DOM
    cy.get('[data-testid="chat-alice"]').within(() => {
      // Log what we find
      cy.get('.message.sent').first().then($msg => {
        const html = $msg.html()
        cy.log('Message HTML:', html)
        
        // Check for reaction elements
        cy.get('.message-reactions').should('exist')
        cy.get('.reaction-badge').should('exist')
      })
    })
    
    // Take screenshot
    cy.screenshot('reaction-display-state')
  })
})