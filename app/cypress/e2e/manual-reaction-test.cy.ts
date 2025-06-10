describe('Manual Reaction Test', () => {
  it('tests reactions on manually sent messages', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for initialization
    cy.wait(3000)
    
    // Clear any existing messages by waiting
    cy.wait(2000)
    
    // Send a manual message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').clear().type('Test message for reactions')
      cy.get('.send-button').click()
    })
    
    // Wait for message to appear in Alice's chat
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').should('contain', 'Test message for reactions')
    })
    
    // Wait for sync
    cy.wait(5000)
    
    // Check if Bob received the message
    cy.get('[data-testid="chat-bob"]').within(() => {
      // Check for any received messages
      cy.get('.message.received').then($msgs => {
        console.log('Bob has', $msgs.length, 'received messages')
        if ($msgs.length > 0) {
          // Find the test message
          cy.get('.message.received').each(($msg) => {
            const text = $msg.text()
            console.log('Message text:', text)
            if (text.includes('Test message for reactions')) {
              // Hover over the message
              cy.wrap($msg).trigger('mouseenter')
              cy.wait(500)
              
              // Click add reaction button
              cy.wrap($msg).find('.add-reaction-button').click({ force: true })
            }
          })
        }
      })
    })
    
    // Wait for emoji picker
    cy.get('.emoji-picker', { timeout: 10000 }).should('be.visible')
    
    // Select a heart emoji
    cy.get('.emoji-picker .emoji-button').contains('❤️').click()
    
    // Wait for reaction to process
    cy.wait(3000)
    
    // Check if reaction appears on Bob's side
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.reaction-badge').should('exist')
      cy.get('.reaction-badge').contains('❤️').should('exist')
    })
    
    // Take screenshot
    cy.screenshot('manual-reaction-test')
  })
})