describe('New Layout Screenshots', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('captures new unified layout', () => {
    // Wait for the simulation to load
    cy.waitForSimulation()
    
    // Take screenshot of new layout
    cy.captureUI('new-layout-initial')
    
    // Let simulation run to show unified event log in action
    cy.wait(8000)
    cy.captureUI('new-layout-with-unified-events')
    
    // Test responsive behavior
    cy.viewport(1200, 800)
    cy.wait(1000)
    cy.captureUI('new-layout-medium-screen')
    
    cy.viewport(768, 800)
    cy.wait(1000)
    cy.captureUI('new-layout-mobile')
    
    // Back to desktop for detailed view
    cy.viewport(1400, 900)
    cy.wait(2000)
    cy.captureUI('new-layout-desktop-detailed')
  })

  it('captures event log interaction', () => {
    cy.waitForSimulation()
    
    // Focus on the unified event log
    cy.get('.unified-event-log').scrollIntoView()
    cy.wait(5000) // Let events accumulate
    cy.captureUI('unified-event-log-detailed')
    
    // Test manual message creation
    cy.get('.device-panel').first().within(() => {
      cy.get('input[type="text"]').type('Testing new unified layout!')
      cy.get('button').contains('Send').click()
    })
    
    cy.wait(1000)
    cy.captureUI('after-manual-message-unified-log')
  })

  it('captures control panels', () => {
    cy.waitForSimulation()
    
    // Focus on the new compact controls
    cy.get('.controls-section').scrollIntoView()
    cy.captureUI('new-compact-controls')
    
    // Test frequency controls
    cy.get('.compact-frequency-controls').within(() => {
      cy.get('input[type="number"]').first().clear().type('60')
    })
    
    cy.wait(2000)
    cy.captureUI('controls-after-frequency-change')
  })
})