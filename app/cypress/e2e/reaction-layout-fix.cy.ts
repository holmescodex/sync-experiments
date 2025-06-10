describe('Reaction Feature Layout', () => {
  it('shows chat interfaces with reactions', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for initialization
    cy.wait(3000)
    
    // Scroll to chat interfaces
    cy.get('.chat-grid').scrollIntoView()
    cy.wait(500)
    
    // Take screenshot of just the chat area
    cy.get('.chat-apps').screenshot('chat-interfaces-initial', { 
      overwrite: true,
      clip: { x: 0, y: 0, width: 1400, height: 600 }
    })
    
    // Send messages
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hello! Testing reactions 🎉')
      cy.get('.send-button').click()
    })
    
    cy.wait(2000)
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Great! Let me react to that')
      cy.get('.send-button').click()
    })
    
    cy.wait(3000)
    
    // Take screenshot showing messages
    cy.get('.chat-apps').screenshot('chat-with-messages', { overwrite: true })
    
    // Force show reaction buttons with CSS
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
    
    cy.wait(500)
    cy.get('.chat-apps').screenshot('chat-with-reaction-buttons', { overwrite: true })
    
    // Try to open emoji picker
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().then($msg => {
        cy.wrap($msg).find('.add-reaction-button').click({ force: true })
      })
    })
    
    cy.wait(1000)
    
    // Check if emoji picker exists and take screenshot
    cy.get('body').then($body => {
      if ($body.find('.emoji-picker').length > 0) {
        // Get viewport screenshot to show emoji picker
        cy.screenshot('emoji-picker-displayed', { capture: 'viewport' })
        
        // Select some emojis
        cy.get('.emoji-picker').within(() => {
          cy.get('.emoji-button').eq(0).click() // First emoji
        })
        
        cy.wait(2000)
        
        // Screenshot with reaction
        cy.get('.chat-apps').screenshot('chat-with-reaction', { overwrite: true })
      } else {
        cy.log('Emoji picker not found')
      }
    })
    
    // Full page overview
    cy.screenshot('full-page-overview', { capture: 'fullPage' })
  })
})