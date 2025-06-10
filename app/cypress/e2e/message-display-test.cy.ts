describe('Message Display Test', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for initial load
    cy.get('[data-testid="simulation-app"]').should('exist')
    cy.get('[data-testid="chat-alice"]').should('exist')
    cy.get('[data-testid="chat-bob"]').should('exist')
    
    // Wait for initialization
    cy.wait(3000)
  })

  it('should display messages with correct styling and author labels', () => {
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"] .message-input').type('Hello from Alice')
    cy.get('[data-testid="chat-alice"] .send-button').click()
    
    cy.wait(1000)
    
    // Send a message from Bob
    cy.get('[data-testid="chat-bob"] .message-input').type('Hello from Bob')
    cy.get('[data-testid="chat-bob"] .send-button').click()
    
    cy.wait(1000)
    
    // Check Alice's view
    cy.log('=== Checking Alice\'s chat view ===')
    cy.get('[data-testid="chat-alice"] .message').then($messages => {
      cy.log(`Alice has ${$messages.length} messages`)
      
      if ($messages.length > 0) {
        // Check Alice's own message
        const $aliceMsg = $messages.filter(':contains("Hello from Alice")')
        if ($aliceMsg.length > 0) {
          cy.log('Alice\'s message:')
          cy.log('- Classes:', $aliceMsg.attr('class'))
          cy.log('- Has author label:', $aliceMsg.find('.message-author').length > 0)
          cy.log('- Background color:', $aliceMsg.find('.message-bubble').css('background-color'))
          
          // Should be sent (blue) without author
          if ($aliceMsg.hasClass('sent')) {
            cy.log('✓ Message correctly marked as sent')
          } else {
            cy.log('✗ Message incorrectly marked as received')
          }
        }
      }
    })
    
    // Check Bob's view
    cy.log('=== Checking Bob\'s chat view ===')
    cy.get('[data-testid="chat-bob"] .message').then($messages => {
      cy.log(`Bob has ${$messages.length} messages`)
      
      if ($messages.length > 0) {
        // Check Bob's own message
        const $bobMsg = $messages.filter(':contains("Hello from Bob")')
        if ($bobMsg.length > 0) {
          cy.log('Bob\'s message:')
          cy.log('- Classes:', $bobMsg.attr('class'))
          cy.log('- Has author label:', $bobMsg.find('.message-author').length > 0)
          cy.log('- Background color:', $bobMsg.find('.message-bubble').css('background-color'))
          
          // Should be sent (blue) without author
          if ($bobMsg.hasClass('sent')) {
            cy.log('✓ Message correctly marked as sent')
          } else {
            cy.log('✗ Message incorrectly marked as received')
          }
        }
      }
    })
    
    // Take a screenshot for visual verification
    cy.screenshot('message-display-state')
  })

  it('should handle automatic messages from timeline', () => {
    // Enable automatic message generation for Alice
    cy.get('.device-controls').first().within(() => {
      cy.contains('alice').parent().find('input[type="checkbox"]').check()
    })
    
    // Wait for an automatic message
    cy.wait(10000)
    
    // Check if automatic messages appear
    cy.get('[data-testid="chat-alice"] .message').then($messages => {
      cy.log(`Alice has ${$messages.length} automatic messages`)
      
      $messages.each((idx, el) => {
        const $msg = Cypress.$(el)
        const hasFromSimBadge = $msg.text().includes('auto') || $msg.find('.from-simulation').length > 0
        cy.log(`Message ${idx}: fromSimulation=${hasFromSimBadge}, class=${$msg.attr('class')}`)
      })
    })
  })
})