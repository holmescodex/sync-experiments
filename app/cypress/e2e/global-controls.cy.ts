describe('Global Controls', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(1000) // Wait for app to load
  })

  it('should display global message rate and image percentage controls', () => {
    // Check that the Message Generation section exists
    cy.contains('Message Generation').should('be.visible')
    
    // Check Global Rate control
    cy.contains('Global Rate').should('be.visible')
    cy.get('.control-group').contains('Global Rate').parent()
      .find('input[type="number"]').should('have.value', '50')
    cy.contains('msg/hr').should('be.visible')
    
    // Check Images percentage control
    cy.contains('Images').should('be.visible')
    cy.get('.control-group').contains('Images').parent()
      .find('input[type="number"]').should('have.value', '30')
    cy.contains('%').should('be.visible')
  })

  it('should allow changing global message rate', () => {
    // Change global rate
    cy.get('.control-group').contains('Global Rate').parent()
      .find('input[type="number"]')
      .clear()
      .type('100')
      .should('have.value', '100')
  })

  it('should allow changing image attachment percentage', () => {
    // Change image percentage
    cy.get('.control-group').contains('Images').parent()
      .find('input[type="number"]')
      .clear()
      .type('50')
      .should('have.value', '50')
  })

  it('should display device enable/disable toggles', () => {
    cy.contains('Device Enable/Disable').should('be.visible')
    
    // Check device toggles exist and are enabled
    cy.get('.device-toggle').contains('alice').find('input[type="checkbox"]')
      .should('be.checked')
    
    cy.get('.device-toggle').contains('bob').find('input[type="checkbox"]')
      .should('be.checked')
  })

  it('should allow toggling devices on/off', () => {
    // Toggle alice off
    cy.get('.device-toggle').contains('alice').click()
    cy.get('.device-toggle').contains('alice').find('input[type="checkbox"]')
      .should('not.be.checked')
    
    // Toggle alice back on
    cy.get('.device-toggle').contains('alice').click()
    cy.get('.device-toggle').contains('alice').find('input[type="checkbox"]')
      .should('be.checked')
  })

  it('should have properly styled controls', () => {
    // Check control styling classes exist
    cy.get('.global-controls').should('exist')
    cy.get('.control-group').should('have.length', 2)
    cy.get('.control-input-group').should('have.length', 2)
    cy.get('.device-toggles').should('exist')
    
    // Check responsive layout (2x2 grid for global controls)
    cy.get('.global-controls').should('have.css', 'display', 'grid')
  })

  it('should handle edge values correctly', () => {
    // Test minimum values
    cy.get('.control-group').contains('Global Rate').parent()
      .find('input[type="number"]')
      .clear()
      .type('0')
      .should('have.value', '0')
    
    cy.get('.control-group').contains('Images').parent()
      .find('input[type="number"]')
      .clear()
      .type('0')
      .should('have.value', '0')
    
    // Test maximum values
    cy.get('.control-group').contains('Global Rate').parent()
      .find('input[type="number"]')
      .clear()
      .type('3600')
      .should('have.value', '3600')
    
    cy.get('.control-group').contains('Images').parent()
      .find('input[type="number"]')
      .clear()
      .type('100')
      .should('have.value', '100')
  })

  it('should affect message generation when controls are changed', () => {
    // Start with both devices enabled and some message rate
    cy.get('.control-group').contains('Global Rate').parent()
      .find('input[type="number"]')
      .clear()
      .type('120') // High rate for faster testing
    
    // Wait a bit and check that messages are being generated
    cy.wait(3000)
    
    // Check that timeline shows some activity
    cy.get('.timeline-event').should('exist')
    
    // Disable both devices
    cy.get('.device-toggle').contains('alice').click()
    cy.get('.device-toggle').contains('bob').click()
    
    // Verify devices are disabled
    cy.get('.device-toggle').contains('alice').find('input[type="checkbox"]')
      .should('not.be.checked')
    cy.get('.device-toggle').contains('bob').find('input[type="checkbox"]')
      .should('not.be.checked')
  })
})