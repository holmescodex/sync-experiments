describe('Final Visual Test', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for initial load
    cy.get('[data-testid="simulation-app"]').should('exist')
    cy.get('[data-testid="chat-alice"]').should('exist')
    cy.get('[data-testid="chat-bob"]').should('exist')
    
    // Wait for initialization
    cy.wait(3000)
  })

  it('should demonstrate correct message display with no duplicates', () => {
    // Send multiple messages from both devices
    
    // Alice sends first message
    cy.get('[data-testid="chat-alice"] .message-input').type('Hello from Alice!')
    cy.get('[data-testid="chat-alice"] .send-button').click()
    cy.wait(500)
    
    // Bob sends a message
    cy.get('[data-testid="chat-bob"] .message-input').type('Hi Alice, this is Bob')
    cy.get('[data-testid="chat-bob"] .send-button').click()
    cy.wait(500)
    
    // Alice sends another message
    cy.get('[data-testid="chat-alice"] .message-input').type('How are you doing?')
    cy.get('[data-testid="chat-alice"] .send-button').click()
    cy.wait(500)
    
    // Bob sends a final message
    cy.get('[data-testid="chat-bob"] .message-input').type('I am doing great, thanks!')
    cy.get('[data-testid="chat-bob"] .send-button').click()
    
    // Wait for all messages to settle
    cy.wait(2000)
    
    // Take a screenshot to show the final state
    cy.screenshot('final-message-display', { 
      capture: 'viewport',
      overwrite: true 
    })
    
    // Verify message counts
    cy.get('[data-testid="chat-alice"] .message').then($messages => {
      cy.log(`Alice sees ${$messages.length} messages`)
      
      // Count sent vs received
      const sent = $messages.filter('.sent').length
      const received = $messages.filter('.received').length
      cy.log(`Alice: ${sent} sent, ${received} received`)
    })
    
    cy.get('[data-testid="chat-bob"] .message').then($messages => {
      cy.log(`Bob sees ${$messages.length} messages`)
      
      // Count sent vs received
      const sent = $messages.filter('.sent').length
      const received = $messages.filter('.received').length
      cy.log(`Bob: ${sent} sent, ${received} received`)
    })
    
    // Verify no duplicates by checking unique message contents
    const uniqueMessages = new Set<string>()
    cy.get('[data-testid="chat-alice"] .message .message-content').each($el => {
      uniqueMessages.add($el.text())
    }).then(() => {
      cy.log(`Unique messages in Alice's chat: ${uniqueMessages.size}`)
      expect(uniqueMessages.size).to.equal(2, 'Alice should see exactly 2 unique messages')
    })
  })
})