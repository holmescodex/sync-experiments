describe('Message Ownership Debug', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for initial load
    cy.get('[data-testid="simulation-app"]').should('exist')
    cy.get('[data-testid="chat-alice"]').should('exist')
    cy.get('[data-testid="chat-bob"]').should('exist')
    
    // Wait for backends to initialize
    cy.wait(3000)
  })

  it('should debug message ownership properties', () => {
    // Enable console logging
    cy.window().then((win) => {
      win.console.log = (...args) => {
        // Log to Cypress console
        cy.log('Console:', args.join(' '))
        // Keep original logging
        console.log(...args)
      }
    })
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Test ownership')
    
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    // Wait for message to appear
    cy.wait(2000)
    
    // Check the DOM for message classes
    cy.get('[data-testid="chat-alice"] .message').then($messages => {
      cy.log(`Found ${$messages.length} messages in Alice's chat`)
      
      $messages.each((index, element) => {
        const $el = Cypress.$(element)
        const classes = $el.attr('class')
        const content = $el.find('.message-content').text()
        const author = $el.find('.message-author').text()
        
        cy.log(`Message ${index}: classes="${classes}", content="${content}", author="${author}"`)
      })
    })
    
    // Check console logs for backend adapter behavior
    cy.window().then((win) => {
      // Try to access React internals to check message state
      const reactFiber = Object.keys(win).find(key => key.startsWith('__reactFiber'))
      if (reactFiber) {
        cy.log('Found React fiber key:', reactFiber)
      }
    })
    
    // Make another API call to see what the backend returns
    cy.request('GET', 'http://localhost:3001/api/messages').then((response) => {
      cy.log('Backend response:', JSON.stringify(response.body))
      
      if (response.body.messages && response.body.messages.length > 0) {
        response.body.messages.forEach((msg, idx) => {
          cy.log(`Message ${idx}: author="${msg.author}", id="${msg.id}"`)
        })
      }
    })
  })

  it('should compare deviceId with message author', () => {
    // Send message from Alice
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Alice test message')
    cy.get('[data-testid="chat-alice"] .send-button').click()
    
    cy.wait(2000)
    
    // Send message from Bob
    cy.get('[data-testid="chat-bob"] .message-input')
      .type('Bob test message')
    cy.get('[data-testid="chat-bob"] .send-button').click()
    
    cy.wait(2000)
    
    // Check both backends
    cy.request('GET', 'http://localhost:3001/api/messages').then((response) => {
      cy.log('Alice backend messages:')
      response.body.messages.forEach(msg => {
        cy.log(`- author: "${msg.author}", content: "${msg.content}"`)
      })
    })
    
    cy.request('GET', 'http://localhost:3002/api/messages').then((response) => {
      cy.log('Bob backend messages:')
      response.body.messages.forEach(msg => {
        cy.log(`- author: "${msg.author}", content: "${msg.content}"`)
      })
    })
  })
})

// Remove the custom command as 'task' already exists