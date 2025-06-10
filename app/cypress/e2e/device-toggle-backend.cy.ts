describe('Device Toggle Backend Integration', () => {
  beforeEach(() => {
    // Mock simulation control health check
    cy.intercept('GET', 'http://localhost:3005/api/health', {
      statusCode: 200,
      body: { status: 'ok', service: 'simulation-control' }
    }).as('simHealth')
    
    cy.visit('http://localhost:5173')
    cy.wait(3000) // Wait for initialization
  })

  it('should update backend when device is enabled/disabled', () => {
    // This test will fail until backend endpoint is implemented
    
    // Intercept the API call that SHOULD happen
    cy.intercept('POST', 'http://localhost:3005/api/devices/alice/enabled', {
      statusCode: 200,
      body: { success: true, enabled: false }
    }).as('toggleAlice')

    // Find Alice's toggle in the event controls
    cy.get('.device-toggles').within(() => {
      // Toggle Alice off
      cy.get('label').contains('alice').parent().find('input[type="checkbox"]').uncheck()
    })

    // Verify API was called
    cy.wait('@toggleAlice').then((interception) => {
      expect(interception.request.body).to.deep.equal({ enabled: false })
    })

    // Toggle back on
    cy.intercept('POST', 'http://localhost:3005/api/devices/alice/enabled', {
      statusCode: 200,
      body: { success: true, enabled: true }
    }).as('toggleAliceOn')

    cy.get('.device-toggles').within(() => {
      cy.get('label').contains('alice').parent().find('input[type="checkbox"]').check()
    })

    cy.wait('@toggleAliceOn').then((interception) => {
      expect(interception.request.body).to.deep.equal({ enabled: true })
    })
  })

  it('should reflect backend state on page load', () => {
    // This test will fail until backend endpoint is implemented
    
    // Mock simulation config where Alice is disabled
    cy.intercept('GET', 'http://localhost:3005/api/simulation/config', {
      statusCode: 200,
      body: {
        globalMessagesPerHour: 50,
        imageAttachmentPercentage: 30,
        enabledDevices: ['bob'], // Alice not in list means disabled
        simulationSpeed: 1,
        isRunning: false
      }
    }).as('getSimConfig')

    // Reload page
    cy.reload()
    cy.wait('@getSimConfig')

    // Verify UI reflects backend state - Alice should be unchecked
    cy.get('.device-toggles').within(() => {
      cy.get('label').contains('alice').parent().find('input[type="checkbox"]')
        .should('not.be.checked')
    })
  })

  it('should handle backend errors gracefully', () => {
    // This test will fail until error handling is implemented
    
    // Mock backend error
    cy.intercept('POST', 'http://localhost:3005/api/devices/alice/enabled', {
      statusCode: 500,
      body: { error: 'Internal server error' }
    }).as('toggleError')

    // Try to toggle
    cy.get('.device-toggles').within(() => {
      cy.get('label').contains('alice').parent().find('input[type="checkbox"]').click()
    })

    cy.wait('@toggleError')
    
    // For now, just verify the error request was made
    // In a real implementation, the UI would show an error and revert the toggle
  })
})