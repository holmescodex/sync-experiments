describe('UI Screenshots', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('captures current UI layout', () => {
    // Wait for the simulation to load
    cy.waitForSimulation()
    
    // Take screenshot of initial state
    cy.captureUI('current-layout-initial')
    
    // Let simulation run for a few seconds to show events
    cy.wait(5000)
    
    // Take screenshot with events populated
    cy.captureUI('current-layout-with-events')
    
    // Interact with controls to show different states
    cy.get('button').contains('Pause').click()
    cy.captureUI('current-layout-paused')
    
    // Test different speed settings
    cy.get('button').contains('Resume').click()
    cy.get('input[type="number"]').clear().type('10')
    cy.wait(2000)
    cy.captureUI('current-layout-fast-speed')
  })

  it('captures event log states', () => {
    cy.waitForSimulation()
    
    // Focus on event log section
    cy.get('.timeline-section').scrollIntoView()
    cy.captureUI('event-log-section')
    
    // Let more events accumulate
    cy.wait(10000)
    cy.captureUI('event-log-with-many-events')
  })

  it('captures device panels', () => {
    cy.waitForSimulation()
    
    // Focus on device panels
    cy.get('.devices-section').scrollIntoView()
    cy.captureUI('device-panels-section')
    
    // Try manual message input
    cy.get('.device-panel').first().within(() => {
      cy.get('input[type="text"]').type('Test manual message')
      cy.get('button').contains('Send').click()
    })
    
    cy.wait(1000)
    cy.captureUI('device-panels-after-manual-message')
  })
})