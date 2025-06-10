describe('Reset Functionality - Core Tests', () => {
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

  it('should reset messages and reload the page', () => {
    // Send a message to create some data
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Test message before reset')
      cy.get('.send-button').click()
    })

    // Verify message exists
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Test message before reset').should('be.visible')
    })

    // Click reset button
    cy.get('[data-testid="reset-button"]').click()

    // Wait for page reload
    cy.wait(5000)

    // Verify message is gone after reset
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.no-messages').should('be.visible')
      cy.contains('Test message before reset').should('not.exist')
    })

    // Verify we can send new messages after reset
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('New message after reset')
      cy.get('.send-button').click()
    })

    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('New message after reset').should('be.visible')
    })
  })

  it('should reset simulation time', () => {
    // Wait for some time to pass
    cy.wait(2000)
    
    // Verify time has advanced
    cy.get('[data-testid="current-time"]').should('not.contain', 'Current: 0s')

    // Reset
    cy.get('[data-testid="reset-button"]').click()
    cy.wait(5000)

    // Time should be back to 0
    cy.get('[data-testid="current-time"]').should('contain', 'Current: 0s')
  })

  it('should reset database stats', () => {
    // Send messages to create database entries
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Message 1')
      cy.get('.send-button').click()
    })

    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Message 2')
      cy.get('.send-button').click()
    })

    cy.wait(2000)

    // Reset
    cy.get('[data-testid="reset-button"]').click()
    cy.wait(5000)

    // Database stats should show 0 events
    cy.get('[data-testid="chat-alice"] .db-stats .db-value').first().should('contain', '0')
    cy.get('[data-testid="chat-bob"] .db-stats .db-value').first().should('contain', '0')
  })

  it('should reset UI controls to default state', () => {
    // Change some control settings
    cy.get('input[type="checkbox"]').first().uncheck({ force: true })
    
    // Reset
    cy.get('[data-testid="reset-button"]').click()
    cy.wait(5000)

    // UI controls should be back to defaults
    cy.get('input[type="checkbox"]').first().should('be.checked')
    
    // All main sections should be visible
    cy.get('.timeline-section').should('be.visible')
    cy.get('.network-section').should('be.visible')
    cy.get('.simulation-section').should('be.visible')
  })
})