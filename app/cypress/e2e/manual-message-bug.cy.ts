describe('Manual Message Duplication Bug', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(1000) // Wait for app to load
  })

  it('should not create duplicate messages when sending manually', () => {
    // Stop automatic message generation by setting frequency to 0
    cy.get('.device-control').contains('alice').parent().find('.freq-input').clear().type('0')
    cy.get('.device-control').contains('bob').parent().find('.freq-input').clear().type('0')
    cy.wait(500)

    const testMessage = 'This is a test message for duplication bug'
    
    // Send a manual message from Alice
    cy.get('.chat-interface').first()
      .find('.message-input')
      .should('be.visible')
      .type(testMessage)
    
    cy.get('.chat-interface').first()
      .find('.send-button')
      .click()

    // Verify the message appears exactly once in Alice's chat
    cy.get('.chat-interface').first()
      .find('.message')
      .should('have.length', 1)
    
    cy.get('.chat-interface').first()
      .should('contain.text', testMessage)
    
    // Count exact occurrences of the message text in Alice's chat
    cy.get('.chat-interface').first()
      .find('.message-content')
      .contains(testMessage)
      .should('have.length', 1)
  })

  it('should handle multiple manual messages without duplication', () => {
    // Stop automatic generation
    cy.get('.device-control').contains('alice').parent().find('.freq-input').clear().type('0')
    cy.get('.device-control').contains('bob').parent().find('.freq-input').clear().type('0')
    cy.wait(500)

    const messages = [
      'First manual message',
      'Second manual message', 
      'Third manual message'
    ]

    messages.forEach((message, index) => {
      // Send message from Alice
      cy.get('.chat-interface').first()
        .find('.message-input')
        .clear()
        .type(message)
      
      cy.get('.chat-interface').first()
        .find('.send-button')
        .click()

      // Wait a bit for any potential duplicates to appear
      cy.wait(200)

      // Verify total message count is correct (no duplicates)
      cy.get('.chat-interface').first()
        .find('.message')
        .should('have.length', index + 1)
      
      // Verify this specific message appears exactly once
      cy.get('.chat-interface').first()
        .find('.message-content')
        .contains(message)
        .should('have.length', 1)
    })

    // Final verification: should have exactly 3 messages total
    cy.get('.chat-interface').first()
      .find('.message')
      .should('have.length', 3)
  })

  it('should not duplicate messages between manual send and simulation event log', () => {
    // Stop automatic generation
    cy.get('.device-control').contains('alice').parent().find('.freq-input').clear().type('0')
    cy.get('.device-control').contains('bob').parent().find('.freq-input').clear().type('0')
    cy.wait(500)

    const testMessage = 'Manual message sync test'
    
    // Send manual message from Alice
    cy.get('.chat-interface').first()
      .find('.message-input')
      .type(testMessage)
    
    cy.get('.chat-interface').first()
      .find('.send-button')
      .click()

    // Wait for any potential duplicates
    cy.wait(300)

    // Message should appear exactly once in Alice's chat
    cy.get('.chat-interface').first()
      .find('.message-content')
      .contains(testMessage)
      .should('have.length', 1)

    // Verify Alice's message count is exactly 1
    cy.get('.chat-interface').first()
      .find('.message')
      .should('have.length', 1)
  })
})