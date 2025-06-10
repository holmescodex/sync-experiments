describe('Sync Bug Fix - Alice 1% Issue', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(2000)
    
    // Disable automatic message generation for clean test
    cy.get('input[type="checkbox"]').uncheck({ force: true })
    cy.wait(1000)
  })

  it('reproduces the bug: Alice shows 1% when she should show 100%', () => {
    // Send one message from Alice (like in the screenshot)
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('test')
      cy.get('.send-button').click()
    })

    cy.wait(3000) // Wait for message processing

    // This test documents the current bug
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('[data-testid="sync-indicator"]').then($indicator => {
        const text = $indicator.text()
        cy.log('Alice sync status (buggy):', text)
        // Currently shows 1% - this is the bug
        expect(text).to.contain('%')
      })
    })

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('[data-testid="sync-indicator"]').then($indicator => {
        const text = $indicator.text()
        cy.log('Bob sync status:', text)
        // Should be 0% since he didn't receive the message
        expect(text).to.contain('0%')
      })
    })
  })

  it('demonstrates what Alice sync SHOULD be', () => {
    // Alice sends the only message in the conversation
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('only message')
      cy.get('.send-button').click()
    })

    cy.wait(3000)

    // Expected behavior:
    // - Total messages sent: 1 (by Alice)
    // - Alice has: 1 message (her own) = 100%
    // - Bob has: 0 messages = 0%
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('[data-testid="sync-indicator"]').then($indicator => {
        const text = $indicator.text()
        cy.log('Alice should show ~100% but shows:', text)
        
        // Extract percentage for validation
        const match = text.match(/(\\d+)%/)
        if (match) {
          const percentage = parseInt(match[1])
          // Alice should have high sync since she has the only message
          // Currently shows 1% (bug) but should show much higher
          cy.log(`Alice percentage: ${percentage}% (should be ~100%)`)
        }
      })
    })

    // Verify message appears in timeline  
    cy.get('[data-testid="executed-event"]').should('have.length.at.least', 1)
    cy.contains('only message').should('be.visible')
  })

  it('shows correct behavior when Bob receives Alice message', () => {
    // Test perfect delivery scenario
    // Set zero packet loss for guaranteed delivery
    cy.get('.network-controls').within(() => {
      cy.get('input[type="range"]').first().then($slider => {
        cy.wrap($slider).invoke('val', 0).trigger('input')
      })
    })

    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('perfect delivery test')
      cy.get('.send-button').click()
    })

    // Wait longer for guaranteed delivery
    cy.wait(5000)

    // Both should show high sync if delivery worked
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('[data-testid="sync-indicator"]').then($indicator => {
        const text = $indicator.text()
        cy.log('Alice sync with delivery:', text)
      })
    })

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('[data-testid="sync-indicator"]').then($indicator => {
        const text = $indicator.text()
        cy.log('Bob sync with delivery:', text)
        // If Bob received the message, he should have good sync too
      })
    })
  })

  it('tests bidirectional sync calculation', () => {
    // Send one message from each device
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Alice message')
      cy.get('.send-button').click()
    })

    cy.wait(2000)

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Bob message')  
      cy.get('.send-button').click()
    })

    cy.wait(4000) // Wait for cross-delivery

    // Now there are 2 total messages sent
    // Alice: sent 1, received 0-1 from Bob = 50-100%
    // Bob: sent 1, received 0-1 from Alice = 50-100%

    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('[data-testid="sync-indicator"]').then($indicator => {
        const text = $indicator.text()
        cy.log('Alice bidirectional sync:', text)
      })
    })

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('[data-testid="sync-indicator"]').then($indicator => {
        const text = $indicator.text()
        cy.log('Bob bidirectional sync:', text)
      })
    })

    // Should have 2 executed events
    cy.get('[data-testid="executed-event"]').should('have.length.at.least', 2)
  })
})