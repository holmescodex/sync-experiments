describe('Cross-Device Message Debug', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for initial load
    cy.get('[data-testid="simulation-app"]').should('exist')
    cy.get('[data-testid="chat-alice"]').should('exist')
    cy.get('[data-testid="chat-bob"]').should('exist')
    
    // Wait for databases to initialize
    cy.wait(3000)
  })

  it('should demonstrate Alice to Bob message sync with debugging', () => {
    cy.log('=== Starting Alice to Bob Test ===')
    
    // Send message from Alice
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Debug: Hello Bob from Alice!')
    
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    cy.log('Message sent from Alice')
    
    // Verify message appears in Alice's chat immediately
    cy.get('[data-testid="chat-alice"] .message', { timeout: 5000 })
      .should('exist')
      .and('contain', 'Debug: Hello Bob from Alice!')
    
    cy.log('Message confirmed in Alice chat')
    
    // Check Alice's message count
    cy.get('[data-testid="chat-alice"] .status-indicator.messages')
      .should('contain', '1 messages')
    
    // Wait for sync (bloom filter + delivery)
    cy.log('Waiting for sync...')
    cy.wait(6000)
    
    // Check if message appears in Bob's chat
    cy.get('[data-testid="chat-bob"]').then($bobChat => {
      const messages = $bobChat.find('.message')
      cy.log(`Bob has ${messages.length} messages`)
      
      if (messages.length > 0) {
        cy.log('Bob received the message!')
        cy.get('[data-testid="chat-bob"] .message')
          .should('contain', 'Debug: Hello Bob from Alice!')
      } else {
        cy.log('Bob did not receive the message yet')
        
        // Check sync status
        cy.get('[data-testid="chat-bob"] [data-testid="sync-indicator"]').then($sync => {
          cy.log(`Bob sync status: ${$sync.text()}`)
        })
        
        // Check database stats
        cy.get('[data-testid="chat-bob"] .db-stats').then($stats => {
          cy.log(`Bob db stats: ${$stats.text()}`)
        })
      }
    })
    
    // Additional wait and check
    cy.wait(5000)
    cy.get('[data-testid="chat-bob"] .message', { timeout: 10000 })
      .should('exist')
      .and('contain', 'Debug: Hello Bob from Alice!')
  })

  it('should test basic message sending without sync expectations', () => {
    cy.log('=== Testing basic message sending ===')
    
    // Test Alice sending
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Basic test message from Alice')
    cy.get('[data-testid="chat-alice"] .send-button').click()
    
    // Verify Alice's message appears
    cy.get('[data-testid="chat-alice"] .message')
      .should('contain', 'Basic test message from Alice')
    
    // Test Bob sending  
    cy.get('[data-testid="chat-bob"] .message-input')
      .type('Basic test message from Bob')
    cy.get('[data-testid="chat-bob"] .send-button').click()
    
    // Verify Bob's message appears
    cy.get('[data-testid="chat-bob"] .message')
      .should('contain', 'Basic test message from Bob')
    
    cy.log('Both devices can send messages locally')
  })

  it('should check if backend adapters are being used', () => {
    cy.log('=== Checking backend adapter status ===')
    
    // Check browser console for backend detection messages
    cy.window().then((win) => {
      // We can't directly access console logs, but we can check the DOM
      // The backend adapter status might be reflected in the UI
    })
    
    // Send a message and see what happens
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Backend adapter test')
    cy.get('[data-testid="chat-alice"] .send-button').click()
    
    // Check if message appears with any special indicators
    cy.get('[data-testid="chat-alice"] .message')
      .should('contain', 'Backend adapter test')
    
    // Look for any backend-related status indicators
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.db-stats, .status-indicator').should('exist')
    })
  })
})