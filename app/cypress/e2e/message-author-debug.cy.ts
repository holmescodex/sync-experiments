describe('Message Author and Color Debug', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for initial load
    cy.get('[data-testid="simulation-app"]').should('exist')
    cy.get('[data-testid="chat-alice"]').should('exist')
    cy.get('[data-testid="chat-bob"]').should('exist')
    
    // Wait for databases to initialize
    cy.wait(3000)
  })

  it('should display sent messages in blue and show authors correctly', () => {
    cy.log('=== Testing message colors and authors ===')
    
    // Send message from Alice
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Hello from Alice')
    
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    // Check Alice's view - should be blue (sent)
    cy.get('[data-testid="chat-alice"] .message').first().within(() => {
      // Message should have 'sent' class
      cy.root().should('have.class', 'sent')
      
      // Message bubble should be blue
      cy.get('.message-bubble')
        .should('have.css', 'background-color', 'rgb(0, 123, 255)') // #007bff
      
      // Should NOT show author for own messages
      cy.get('.message-author').should('not.exist')
      
      // Content should be visible
      cy.get('.message-content').should('contain', 'Hello from Alice')
    })
    
    // Wait for potential sync
    cy.wait(5000)
    
    // Send message from Bob
    cy.get('[data-testid="chat-bob"] .message-input')
      .type('Hello from Bob')
    
    cy.get('[data-testid="chat-bob"] .send-button')
      .click()
    
    // Check Bob's view - should be blue (sent)
    cy.get('[data-testid="chat-bob"] .message').first().within(() => {
      // Message should have 'sent' class
      cy.root().should('have.class', 'sent')
      
      // Message bubble should be blue
      cy.get('.message-bubble')
        .should('have.css', 'background-color', 'rgb(0, 123, 255)')
      
      // Should NOT show author for own messages
      cy.get('.message-author').should('not.exist')
    })
    
    // If sync works, check received messages
    cy.get('body').then($body => {
      // Check if Alice received Bob's message
      if ($body.find('[data-testid="chat-alice"] .message.received').length > 0) {
        cy.log('Alice received Bob\'s message')
        
        cy.get('[data-testid="chat-alice"] .message.received').first().within(() => {
          // Should show author
          cy.get('.message-author').should('contain', 'bob')
          
          // Message bubble should be gray
          cy.get('.message-bubble')
            .should('have.css', 'background-color', 'rgb(233, 236, 239)') // #e9ecef
        })
      }
      
      // Check if Bob received Alice's message
      if ($body.find('[data-testid="chat-bob"] .message.received').length > 0) {
        cy.log('Bob received Alice\'s message')
        
        cy.get('[data-testid="chat-bob"] .message.received').first().within(() => {
          // Should show author
          cy.get('.message-author').should('contain', 'alice')
          
          // Message bubble should be gray
          cy.get('.message-bubble')
            .should('have.css', 'background-color', 'rgb(233, 236, 239)')
        })
      }
    })
  })

  it('should check message properties in console', () => {
    // This test will help us debug by logging message properties
    cy.window().then((win) => {
      // Send a message and intercept console logs
      const consoleSpy = cy.spy(win.console, 'log')
      
      // Send message from Alice
      cy.get('[data-testid="chat-alice"] .message-input')
        .type('Debug message')
      
      cy.get('[data-testid="chat-alice"] .send-button')
        .click()
      
      // Wait for any console logs
      cy.wait(2000)
      
      // Check what was logged
      cy.wrap(consoleSpy).then((spy) => {
        const calls = spy.getCalls()
        calls.forEach((call) => {
          const args = call.args.join(' ')
          if (args.includes('Manual message') || args.includes('BackendAdapter')) {
            cy.log('Console:', args)
          }
        })
      })
    })
  })
})