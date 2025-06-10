describe('Image Attachment Rate Backend Integration', () => {
  beforeEach(() => {
    // Mock simulation control health check
    cy.intercept('GET', 'http://localhost:3005/api/health', {
      statusCode: 200,
      body: { status: 'ok', service: 'simulation-control' }
    }).as('simHealth')
    
    cy.visit('http://localhost:5173')
    cy.wait(3000) // Wait for initialization
  })

  it('should update backend when attachment percentage changes', () => {
    // This test will fail until backend endpoint is implemented
    
    // Intercept the API call that SHOULD happen
    cy.intercept('POST', 'http://localhost:3005/api/simulation/attachment-rate', {
      statusCode: 200,
      body: { success: true, imageAttachmentPercentage: 50 }
    }).as('updateAttachmentRate')

    // Find the attachment rate input
    cy.get('.global-controls').within(() => {
      cy.contains('Images').parent().find('input[type="number"]')
        .invoke('val', '50')
        .trigger('change')
    })

    // Verify API was called
    cy.wait('@updateAttachmentRate').then((interception) => {
      expect(interception.request.body).to.deep.equal({ 
        imageAttachmentPercentage: 50
      })
    })
  })

  it('should apply to all devices when global rate changes', () => {
    // This test verifies the simulation control server handles the global rate
    
    // Intercept the global update
    cy.intercept('POST', 'http://localhost:3005/api/simulation/attachment-rate', {
      statusCode: 200,
      body: { success: true, imageAttachmentPercentage: 75 }
    }).as('updateGlobalAttachment')

    // Change attachment rate
    cy.get('.global-controls').within(() => {
      cy.contains('Images').parent().find('input[type="number"]')
        .invoke('val', '75')
        .trigger('change')
    })

    // Verify global update was called
    cy.wait('@updateGlobalAttachment').then((interception) => {
      expect(interception.request.body).to.deep.equal({ 
        imageAttachmentPercentage: 75 
      })
    })
  })

  it('should load current rate from backend on startup', () => {
    // This test will fail until backend endpoint is implemented
    
    // Mock backend configuration
    cy.intercept('GET', 'http://localhost:3005/api/simulation/config', {
      statusCode: 200,
      body: { 
        globalMessagesPerHour: 50,
        imageAttachmentPercentage: 40,
        enabledDevices: ['alice', 'bob'],
        simulationSpeed: 1,
        isRunning: false
      }
    }).as('getConfig')

    // Reload page
    cy.reload()
    cy.wait('@getConfig')

    // Verify UI reflects backend state
    cy.get('.global-controls').within(() => {
      cy.contains('Images').parent().find('input[type="number"]')
        .should('have.value', '40')
    })
  })

  it('should validate attachment rate limits', () => {
    // This test will fail until validation is implemented
    
    // Mock validation error for rates over 100%
    cy.intercept('POST', 'http://localhost:3005/api/simulation/attachment-rate', (req) => {
      if (req.body.imageAttachmentPercentage > 100) {
        req.reply({
          statusCode: 400,
          body: { error: 'Attachment rate cannot exceed 100%' }
        })
      } else {
        req.reply({
          statusCode: 200,
          body: { success: true }
        })
      }
    }).as('validateRate')

    // Try to set invalid rate (this would require modifying the input max)
    // For now, test the max value
    cy.get('.global-controls').within(() => {
      cy.contains('Images').parent().find('input[type="number"]')
        .invoke('val', '100')
        .trigger('change')
    })

    cy.wait('@validateRate')

    // Should succeed at 100%
    cy.get('.global-controls').within(() => {
      cy.contains('Images').parent().find('input[type="number"]')
        .should('have.value', '100')
    })
  })
})