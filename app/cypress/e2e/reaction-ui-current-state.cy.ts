describe('Current UI State with Reactions', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.viewport(1400, 800)
  })

  it('captures the current app state', () => {
    // Wait for app to initialize
    cy.wait(2000)
    
    // Take initial screenshot
    cy.screenshot('initial-state', { capture: 'fullPage' })
    
    // Send some messages manually
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hello Bob! This is a test message with reactions! 🎉')
      cy.get('.send-button').click()
    })
    
    cy.wait(2000)
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Hi Alice! Let me react to your message!')
      cy.get('.send-button').click()
    })
    
    // Wait for messages to appear
    cy.wait(3000)
    
    // Try to add a reaction - hover over message
    cy.get('[data-testid="chat-bob"]').within(() => {
      // Force show the add reaction button
      cy.get('.message.received').first().then($message => {
        // Inject CSS to make reaction button visible
        cy.document().then(doc => {
          const style = doc.createElement('style')
          style.innerHTML = '.add-reaction-button { opacity: 1 !important; }'
          doc.head.appendChild(style)
        })
      })
    })
    
    cy.wait(1000)
    cy.screenshot('messages-with-reaction-button', { capture: 'fullPage' })
    
    // Click add reaction button
    cy.get('[data-testid="chat-bob"] .message.received').first().within(() => {
      cy.get('.add-reaction-button').click({ force: true })
    })
    
    cy.wait(1000)
    
    // Check if emoji picker is visible
    cy.get('body').then($body => {
      if ($body.find('.emoji-picker').length > 0) {
        cy.screenshot('emoji-picker-visible', { capture: 'fullPage' })
        
        // Click a heart emoji if available
        cy.get('.emoji-picker .emoji-button').first().click({ force: true })
        cy.wait(2000)
      }
    })
    
    // Final screenshot
    cy.screenshot('final-state-with-reactions', { capture: 'fullPage' })
  })
  
  it('captures mobile responsive view', () => {
    cy.viewport(375, 667) // iPhone 6/7/8 size
    cy.wait(2000)
    cy.screenshot('mobile-view', { capture: 'fullPage' })
  })
})