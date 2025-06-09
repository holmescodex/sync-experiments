describe('Clean UI Screenshots', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('captures cleaned up layout', () => {
    // Wait for the simulation to load
    cy.waitForSimulation()
    
    // Take screenshot of clean layout
    cy.captureUI('clean-layout-initial')
    
    // Let simulation run to show chat messages accumulating
    cy.wait(10000)
    cy.captureUI('clean-layout-with-chat-messages')
    
    // Test manual message sending
    cy.get('.chat-interface').first().within(() => {
      cy.get('.message-input').type('Hello from the new clean UI!')
      cy.get('.send-button').click()
    })
    
    cy.wait(1000)
    cy.captureUI('clean-layout-after-manual-message')
    
    // Test responsive design
    cy.viewport(1200, 800)
    cy.wait(1000)
    cy.captureUI('clean-layout-medium-screen')
    
    cy.viewport(768, 800)
    cy.wait(1000)
    cy.captureUI('clean-layout-mobile')
  })

  it('captures event timeline details', () => {
    cy.waitForSimulation()
    
    // Let events accumulate
    cy.wait(8000)
    
    // Focus on event timeline
    cy.get('.event-log-with-controls').scrollIntoView()
    cy.captureUI('clean-event-timeline-detailed')
    
    // Test frequency controls
    cy.get('.device-control').first().within(() => {
      cy.get('.freq-input').clear().type('120')
    })
    
    cy.wait(2000)
    cy.captureUI('event-timeline-after-frequency-change')
  })

  it('captures chat interface details', () => {
    cy.waitForSimulation()
    
    // Let some messages accumulate
    cy.wait(5000)
    
    // Send manual messages to both
    cy.get('.chat-interface').eq(0).within(() => {
      cy.get('.message-input').type('Manual message from Alice')
      cy.get('.send-button').click()
    })
    
    cy.wait(500)
    
    cy.get('.chat-interface').eq(1).within(() => {
      cy.get('.message-input').type('Manual message from Bob')
      cy.get('.send-button').click()
    })
    
    cy.wait(3000)
    cy.captureUI('chat-interfaces-with-mixed-messages')
    
    // Focus on one chat interface
    cy.get('.chat-interface').first().scrollIntoView()
    cy.captureUI('single-chat-interface-detailed')
  })
})