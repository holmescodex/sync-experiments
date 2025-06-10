describe('Duplicate Message Test', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for initial load
    cy.get('[data-testid="simulation-app"]').should('exist')
    cy.get('[data-testid="chat-alice"]').should('exist')
    cy.get('[data-testid="chat-bob"]').should('exist')
    
    // Wait for initialization
    cy.wait(3000)
  })

  it('should not show duplicate messages when Alice sends a message', () => {
    const testMessage = 'Test message ' + Date.now()
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"] .message-input').type(testMessage)
    cy.get('[data-testid="chat-alice"] .send-button').click()
    
    // Wait for optimistic update
    cy.wait(500)
    
    // Count messages immediately after sending
    cy.get('[data-testid="chat-alice"] .message').then($messages => {
      const initialCount = $messages.length
      cy.log(`Initial message count: ${initialCount}`)
      
      // Count how many times our test message appears
      const testMessageCount = $messages.filter(`:contains("${testMessage}")`).length
      cy.log(`Test message appears ${testMessageCount} times initially`)
    })
    
    // Wait for backend polling to potentially add duplicate
    cy.wait(3000)
    
    // Count messages after polling
    cy.get('[data-testid="chat-alice"] .message').then($messages => {
      const finalCount = $messages.length
      cy.log(`Final message count: ${finalCount}`)
      
      // Count how many times our test message appears
      const testMessageInstances = $messages.filter(`:contains("${testMessage}")`)
      const testMessageCount = testMessageInstances.length
      cy.log(`Test message appears ${testMessageCount} times after polling`)
      
      // Log details about each instance
      testMessageInstances.each((idx, el) => {
        const $msg = Cypress.$(el)
        cy.log(`Instance ${idx + 1}: id="${$msg.attr('data-message-id')}", class="${$msg.attr('class')}"`)
      })
      
      // Assert that the message appears exactly once
      expect(testMessageCount).to.equal(1, 'Message should appear exactly once, not duplicated')
    })
    
    // Also check the message counter
    cy.get('[data-testid="chat-alice"] .status-indicator.messages').then($indicator => {
      const text = $indicator.text()
      cy.log(`Message counter shows: ${text}`)
    })
  })

  it('should track message IDs to prevent duplicates', () => {
    // Send multiple messages quickly
    const messages = [
      'First message ' + Date.now(),
      'Second message ' + Date.now(),
      'Third message ' + Date.now()
    ]
    
    messages.forEach(msg => {
      cy.get('[data-testid="chat-alice"] .message-input').type(msg)
      cy.get('[data-testid="chat-alice"] .send-button').click()
      cy.wait(100)
    })
    
    // Wait for all optimistic updates
    cy.wait(1000)
    
    // Count initial messages
    cy.get('[data-testid="chat-alice"] .message').then($messages => {
      const initialCount = $messages.length
      cy.log(`Initial count after sending 3 messages: ${initialCount}`)
    })
    
    // Wait for backend polling
    cy.wait(3000)
    
    // Final count
    cy.get('[data-testid="chat-alice"] .message').then($messages => {
      const finalCount = $messages.length
      cy.log(`Final count after polling: ${finalCount}`)
      
      // Check each test message appears exactly once
      messages.forEach(msg => {
        const count = $messages.filter(`:contains("${msg}")`).length
        cy.log(`"${msg}" appears ${count} times`)
        expect(count).to.equal(1, `Message "${msg}" should appear exactly once`)
      })
    })
  })
})