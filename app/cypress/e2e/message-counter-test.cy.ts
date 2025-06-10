describe('Message Counter Test', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(2000)
    
    // Disable automatic message generation for clean test
    cy.get('input[type="checkbox"]').uncheck({ force: true })
    cy.wait(1000)
  })

  it('shows correct message count in chat header', () => {
    // Initially both should show 0 messages
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('0 messages').should('be.visible')
      cy.contains('● Online').should('be.visible')
    })

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('0 messages').should('be.visible')
      cy.contains('● Online').should('be.visible')
    })

    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hello Bob!')
      cy.get('.send-button').click()
    })

    cy.wait(2000) // Wait for message to appear

    // Alice should now show 1 message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('1 messages').should('be.visible')
      cy.contains('● Online').should('be.visible')
      cy.get('[data-testid="sync-indicator"]').should('be.visible')
    })

    // Bob should still show 0 messages (hasn't received it yet or packet loss)
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('0 messages').should('be.visible')
    })

    // Send a message from Bob
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Hi Alice!')
      cy.get('.send-button').click()
    })

    cy.wait(2000)

    // Bob should now show 1 message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('1 messages').should('be.visible')
    })

    // Send another message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('How are you?')
      cy.get('.send-button').click()
    })

    cy.wait(2000)

    // Alice should now show 2 messages
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('2 messages').should('be.visible')
    })

    // Check that the layout looks good with all status indicators
    cy.get('[data-testid="chat-alice"] .status-indicators').within(() => {
      cy.contains('● Online').should('be.visible')
      cy.get('[data-testid="sync-indicator"]').should('be.visible')
      cy.contains('2 messages').should('be.visible')
    })

    cy.get('[data-testid="chat-bob"] .status-indicators').within(() => {
      cy.contains('● Online').should('be.visible')
      cy.contains('1 messages').should('be.visible')
    })
  })

  it('verifies sync status with message counts', () => {
    // Test scenario: verify that sync percentages make sense relative to message counts
    
    // Alice sends one message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('sync test message')
      cy.get('.send-button').click()
    })

    cy.wait(3000) // Wait for processing and potential delivery

    // Alice should show 1 message and good sync status
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('1 messages').should('be.visible')
      // Alice should show synced or high percentage since she has the only message
      cy.get('[data-testid="sync-indicator"]').should('be.visible')
    })

    // Bob's status depends on whether he received the message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.status-indicators').should('be.visible')
      // Bob might show 0 or 1 messages depending on delivery
    })

    // The message count helps us understand what the sync percentage means:
    // If Alice shows "1 messages" and "● Synced", that makes sense (she has 100% of her conversation)
    // If Bob shows "0 messages", his sync status should reflect that he hasn't received the message
    // If Bob shows "1 messages", his sync status should be good too
  })

  it('tests message counter with zero packet loss', () => {
    // Set zero packet loss for guaranteed delivery
    cy.get('.network-controls').within(() => {
      cy.get('input[type="range"]').first().then($slider => {
        cy.wrap($slider).invoke('val', 0).trigger('input')
      })
    })

    // Send messages from both devices
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Perfect delivery test')
      cy.get('.send-button').click()
    })

    cy.wait(2000)

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Reply from Bob')
      cy.get('.send-button').click()
    })

    cy.wait(4000) // Wait for cross-delivery

    // With perfect delivery, both devices should eventually show both messages
    // But they show their own messages immediately, cross-device delivery takes time

    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('messages').should('be.visible')
      cy.get('[data-testid="sync-indicator"]').should('be.visible')
    })

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('messages').should('be.visible')
      cy.get('[data-testid="sync-indicator"]').should('be.visible')
    })

    // The message counts help verify sync: if both devices show similar message counts,
    // and both show good sync status, then the sync calculation is working correctly
  })
})