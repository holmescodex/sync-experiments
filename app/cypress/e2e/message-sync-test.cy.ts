describe('Message Sync Between Devices', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for initial load
    cy.get('[data-testid="simulation-app"]').should('exist')
    cy.get('[data-testid="chat-alice"]').should('exist')
    cy.get('[data-testid="chat-bob"]').should('exist')
    
    // Wait for databases to initialize
    cy.wait(2000)
  })

  it('should sync messages from Alice to Bob', () => {
    // Type a message as Alice
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Hello Bob from Alice!')
    
    // Send the message
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    // Verify message appears in Alice's chat (sent)
    cy.get('[data-testid="chat-alice"] .message.sent')
      .should('exist')
      .within(() => {
        cy.get('.message-content').should('contain', 'Hello Bob from Alice!')
      })
    
    // Wait for sync to happen (bloom filter exchange + message delivery)
    // With 2-second bloom filter intervals, we need to wait at least that long
    cy.wait(5000)
    
    // Verify message appears in Bob's chat (received)
    cy.get('[data-testid="chat-bob"] .message.received')
      .should('exist')
      .within(() => {
        cy.get('.message-content').should('contain', 'Hello Bob from Alice!')
      })
    
    // Verify sync status shows 100%
    cy.get('[data-testid="chat-bob"] [data-testid="sync-indicator"]')
      .should('contain', 'Synced')
  })

  it('should sync messages from Bob to Alice', () => {
    // Type a message as Bob
    cy.get('[data-testid="chat-bob"] .message-input')
      .type('Hi Alice, this is Bob!')
    
    // Send the message
    cy.get('[data-testid="chat-bob"] .send-button')
      .click()
    
    // Verify message appears in Bob's chat (sent)
    cy.get('[data-testid="chat-bob"] .message.sent')
      .should('exist')
      .within(() => {
        cy.get('.message-content').should('contain', 'Hi Alice, this is Bob!')
      })
    
    // Wait for sync
    cy.wait(5000)
    
    // Verify message appears in Alice's chat (received)
    cy.get('[data-testid="chat-alice"] .message.received')
      .should('exist')
      .within(() => {
        cy.get('.message-content').should('contain', 'Hi Alice, this is Bob!')
      })
  })

  it('should sync multiple messages bidirectionally', () => {
    // Alice sends first
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Message 1 from Alice')
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    // Bob sends second
    cy.get('[data-testid="chat-bob"] .message-input')
      .type('Message 1 from Bob')
    cy.get('[data-testid="chat-bob"] .send-button')
      .click()
    
    // Alice sends another
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Message 2 from Alice')
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    // Wait for sync
    cy.wait(6000)
    
    // Verify Alice sees all messages
    cy.get('[data-testid="chat-alice"] .message').should('have.length', 3)
    cy.get('[data-testid="chat-alice"] .message.sent').should('have.length', 2)
    cy.get('[data-testid="chat-alice"] .message.received').should('have.length', 1)
    
    // Verify Bob sees all messages
    cy.get('[data-testid="chat-bob"] .message').should('have.length', 3)
    cy.get('[data-testid="chat-bob"] .message.sent').should('have.length', 1)
    cy.get('[data-testid="chat-bob"] .message.received').should('have.length', 2)
    
    // Verify both show as synced
    cy.get('[data-testid="chat-alice"] [data-testid="sync-indicator"]')
      .should('contain', 'Synced')
    cy.get('[data-testid="chat-bob"] [data-testid="sync-indicator"]')
      .should('contain', 'Synced')
  })

  it('should handle sync with network delays', () => {
    // Add some network latency
    cy.get('.network-controls input[type="range"]').first()
      .invoke('val', 50) // 50% packet loss
      .trigger('change')
    
    // Send message from Alice
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Message with network issues')
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    // Wait longer for sync due to packet loss
    cy.wait(10000)
    
    // Message should eventually arrive despite packet loss
    cy.get('[data-testid="chat-bob"] .message.received', { timeout: 15000 })
      .should('exist')
      .within(() => {
        cy.get('.message-content').should('contain', 'Message with network issues')
      })
  })

  it('should update message count in real-time', () => {
    // Check initial message counts
    cy.get('[data-testid="chat-alice"] .status-indicator.messages')
      .should('contain', '0 messages')
    cy.get('[data-testid="chat-bob"] .status-indicator.messages')
      .should('contain', '0 messages')
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"] .message-input')
      .type('Test message count')
    cy.get('[data-testid="chat-alice"] .send-button')
      .click()
    
    // Alice should immediately show 1 message
    cy.get('[data-testid="chat-alice"] .status-indicator.messages')
      .should('contain', '1 messages')
    
    // Wait for sync
    cy.wait(5000)
    
    // Bob should now also show 1 message
    cy.get('[data-testid="chat-bob"] .status-indicator.messages')
      .should('contain', '1 messages')
  })
})