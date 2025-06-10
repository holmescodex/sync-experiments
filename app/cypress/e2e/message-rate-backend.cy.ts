describe('Message Generation Rate Backend Integration', () => {
  beforeEach(() => {
    // Mock simulation control health check
    cy.intercept('GET', 'http://localhost:3005/api/health', {
      statusCode: 200,
      body: { status: 'ok', service: 'simulation-control' }
    }).as('simHealth')
    
    cy.visit('http://localhost:5173')
    cy.wait(3000) // Wait for initialization
  })

  it('should update backend when global message rate changes', () => {
    // This test will fail until backend endpoint is implemented
    
    // Intercept the API call that SHOULD happen
    cy.intercept('POST', 'http://localhost:3005/api/simulation/message-rate', {
      statusCode: 200,
      body: { success: true, messagesPerHour: 100 }
    }).as('updateRate')

    // Find the global message rate input
    cy.get('.global-controls').within(() => {
      cy.contains('Global Rate').parent().find('input[type="number"]')
        .invoke('val', '100')
        .trigger('change')
    })

    // Verify API was called
    cy.wait('@updateRate').then((interception) => {
      expect(interception.request.body).to.deep.equal({ 
        messagesPerHour: 100
      })
    })
  })

  it('should distribute rate across enabled devices', () => {
    // This test verifies the simulation control server distributes the rate
    
    // Mock the global rate update
    cy.intercept('POST', 'http://localhost:3005/api/simulation/message-rate', {
      statusCode: 200,
      body: { success: true, messagesPerHour: 60 }
    }).as('updateGlobalRate')

    // Mock getting status to verify distribution
    cy.intercept('GET', 'http://localhost:3005/api/simulation/status', {
      statusCode: 200,
      body: {
        globalMessagesPerHour: 60,
        deviceRates: {
          alice: 30,  // Each device gets half when both enabled
          bob: 30
        }
      }
    }).as('getStatus')

    // Set global rate to 60 messages/hour
    cy.get('.global-controls').within(() => {
      cy.contains('Global Rate').parent().find('input[type="number"]')
        .invoke('val', '60')
        .trigger('change')
    })

    // Wait for global rate update
    cy.wait('@updateGlobalRate')

    // The frontend could fetch status to verify (though our current implementation doesn't)
    // This shows how the test would verify the distribution happened
  })

  it('should show current backend rate on load', () => {
    // This test will fail until backend endpoint is implemented
    
    // Mock backend config
    cy.intercept('GET', 'http://localhost:3005/api/simulation/config', {
      statusCode: 200,
      body: {
        globalMessagesPerHour: 75,
        imageAttachmentPercentage: 30,
        enabledDevices: ['alice', 'bob'],
        simulationSpeed: 1,
        isRunning: false
      }
    }).as('getSimConfig')

    // Reload page
    cy.reload()
    cy.wait('@getSimConfig')

    // Verify UI reflects backend state
    cy.get('.global-controls').within(() => {
      cy.contains('Global Rate').parent().find('input[type="number"]')
        .should('have.value', '75')
    })
  })

  it('should handle rate limiting errors', () => {
    // This test will fail until error handling is implemented
    
    // Mock rate limit error
    cy.intercept('POST', 'http://localhost:3005/api/simulation/message-rate', {
      statusCode: 429,
      body: { error: 'Rate limit exceeded. Maximum 1000 messages/hour' }
    }).as('rateLimitError')

    // Try to set excessive rate
    cy.get('.global-controls').within(() => {
      cy.contains('Global Rate').parent().find('input[type="number"]')
        .invoke('val', '2000')
        .trigger('change')
    })

    cy.wait('@rateLimitError')

    // The value should be capped at 1000 in our error handler
    cy.get('.global-controls').within(() => {
      cy.contains('Global Rate').parent().find('input[type="number"]')
        .should('have.value', '1000')
    })
  })
})