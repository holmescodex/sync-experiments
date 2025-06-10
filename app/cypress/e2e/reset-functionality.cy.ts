describe('Reset Functionality', () => {
  beforeEach(() => {
    // Handle uncaught exceptions to avoid jimp/import issues
    cy.on('uncaught:exception', (err, runnable) => {
      // Ignore specific import errors that don't affect reset functionality
      if (err.message.includes('jimp') || err.message.includes('default')) {
        return false
      }
      return true
    })
    
    cy.visit('http://localhost:5173')
    cy.wait(3000) // Wait for app initialization
  })

  it('should reset all simulation data when reset button is clicked', () => {
    // First, generate some data by sending messages
    cy.log('Setting up initial data...')
    
    // Send a message from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Message before reset from Alice')
      cy.get('.send-button').click()
    })

    // Send a message from Bob
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Message before reset from Bob')
      cy.get('.send-button').click()
    })

    // Wait for messages to appear and timeline to update
    cy.wait(3000)

    // Verify we have some data before reset
    cy.log('Verifying initial state has data...')
    
    // Check that messages exist
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Message before reset from Alice').should('be.visible')
    })
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Message before reset from Bob').should('be.visible')
    })

    // Check that simulation time has advanced (messages take time to process)
    cy.get('[data-testid="current-time"]').should('not.contain', 'Current: 0s')
    
    // Wait a bit more for potential timeline events from auto-generation
    cy.wait(2000)

    // Now perform the reset
    cy.log('Performing reset...')
    cy.get('[data-testid="reset-button"]').click()

    // Wait for page to reload (the reset function calls window.location.reload())
    cy.wait(5000) // Give time for reload and reinitialization

    // Verify everything is reset after reload
    cy.log('Verifying reset state...')

    // Messages should be cleared
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.no-messages').should('be.visible')
      cy.contains('Message before reset from Alice').should('not.exist')
    })

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.no-messages').should('be.visible')
      cy.contains('Message before reset from Bob').should('not.exist')
    })

    // Simulation time should be reset to 0
    cy.get('[data-testid="current-time"]').should('contain', 'Current: 0s')

    // Database stats should show 0 events
    cy.get('[data-testid="chat-alice"] .db-stats .db-value').first().should('contain', '0')
    cy.get('[data-testid="chat-bob"] .db-stats .db-value').first().should('contain', '0')

    // Sync percentages should be reset
    cy.get('[data-testid="chat-alice"] [data-testid="sync-indicator"]').should('be.visible')
    cy.get('[data-testid="chat-bob"] [data-testid="sync-indicator"]').should('be.visible')
  })

  it('should reset and allow new data to be created normally', () => {
    // Add some initial data
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Initial message')
      cy.get('.send-button').click()
    })

    cy.wait(1000)

    // Reset
    cy.get('[data-testid="reset-button"]').click()
    cy.wait(5000) // Wait for reload

    // Verify we can create new data after reset
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Message after reset')
      cy.get('.send-button').click()
    })

    // New message should appear
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Message after reset').should('be.visible')
      cy.contains('Initial message').should('not.exist')
    })
  })

  it('should reset backend databases when connected to backend APIs', () => {
    // This test verifies that backend databases are also cleared
    // We can't easily verify the backend state directly in Cypress,
    // but we can verify the reset behavior works end-to-end

    // Add data
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Backend test message')
      cy.get('.send-button').click()
    })

    cy.wait(2000)

    // Reset
    cy.get('[data-testid="reset-button"]').click()
    cy.wait(5000)

    // After reset, any new messages should work correctly
    // This indirectly tests that backend state was properly reset
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Post-reset backend message')
      cy.get('.send-button').click()
    })

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Post-reset backend message').should('be.visible')
    })

    // Database stats should reflect only new data
    cy.get('[data-testid="chat-bob"] .db-stats .db-value').first().should('contain', '1')
  })

  it('should maintain UI controls state after reset', () => {
    // Change some control settings
    cy.get('input[type="checkbox"]').first().uncheck({ force: true })
    
    // Reset
    cy.get('[data-testid="reset-button"]').click()
    cy.wait(5000)

    // UI controls should be back to defaults
    cy.get('input[type="checkbox"]').first().should('be.checked')
    
    // Speed controls should be at default
    cy.get('.speed-controls').should('be.visible')
    
    // All sections should be visible and functional
    cy.get('.timeline-section').should('be.visible')
    cy.get('.network-section').should('be.visible')
    cy.get('.simulation-section').should('be.visible')
  })
})