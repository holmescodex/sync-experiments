describe('Networking Phase Screenshots', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('captures networking interface with three columns', () => {
    // Wait for the simulation to load
    cy.waitForSimulation()
    
    // Take screenshot of initial networking layout
    cy.captureUI('networking-layout-initial')
    
    // Let simulation run to generate network events
    cy.wait(8000)
    cy.captureUI('networking-layout-with-events')
    
    // Test network controls
    cy.get('.network-controls').within(() => {
      // Adjust packet loss
      cy.get('input[type="range"]').first().invoke('val', 20).trigger('input')
      
      // Adjust latency  
      cy.get('input[type="range"]').eq(1).invoke('val', 200).trigger('input')
    })
    
    cy.wait(2000)
    cy.captureUI('networking-with-packet-loss')
    
    // Test event filtering
    cy.get('.event-filters').within(() => {
      cy.get('input[type="checkbox"]').eq(1).uncheck() // Uncheck bloom filters
    })
    
    cy.captureUI('networking-filtered-events')
  })

  it('captures sync status and cross-device messaging', () => {
    cy.waitForSimulation()
    
    // Wait for some automatic events to generate
    cy.wait(5000)
    
    // Send manual message from Alice
    cy.get('.chat-interface').first().within(() => {
      cy.get('.message-input').type('Hello Bob from Alice!')
      cy.get('.send-button').click()
    })
    
    cy.wait(2000)
    
    // Send manual message from Bob
    cy.get('.chat-interface').eq(1).within(() => {
      cy.get('.message-input').type('Hello Alice from Bob!')
      cy.get('.send-button').click()
    })
    
    cy.wait(3000)
    cy.captureUI('cross-device-messaging')
    
    // Focus on sync status indicators
    cy.get('.chat-grid').scrollIntoView()
    cy.captureUI('sync-status-indicators')
  })

  it('captures network activity with packet loss', () => {
    cy.waitForSimulation()
    
    // Set high packet loss rate
    cy.get('.network-controls').within(() => {
      cy.get('input[type="range"]').first().invoke('val', 80).trigger('input')
    })
    
    // Generate more activity
    cy.get('.chat-interface').first().within(() => {
      cy.get('.message-input').type('Message 1')
      cy.get('.send-button').click()
    })
    
    cy.wait(1000)
    
    cy.get('.chat-interface').eq(1).within(() => {
      cy.get('.message-input').type('Message 2')
      cy.get('.send-button').click()
    })
    
    cy.wait(1000)
    
    cy.get('.chat-interface').first().within(() => {
      cy.get('.message-input').type('Message 3')
      cy.get('.send-button').click()
    })
    
    cy.wait(5000)
    cy.captureUI('high-packet-loss-scenario')
    
    // Focus on network statistics
    cy.get('.network-stats').scrollIntoView()
    cy.captureUI('network-statistics-detailed')
  })

  it('captures network event details', () => {
    cy.waitForSimulation()
    
    // Let events accumulate
    cy.wait(10000)
    
    // Focus on network events list
    cy.get('.network-events').scrollIntoView()
    cy.captureUI('network-events-detailed')
    
    // Test different latency settings
    cy.get('.network-controls').within(() => {
      cy.get('input[type="range"]').eq(1).invoke('val', 500).trigger('input') // High latency
      cy.get('input[type="range"]').eq(2).invoke('val', 100).trigger('input') // High jitter
    })
    
    cy.wait(3000)
    cy.captureUI('high-latency-network')
  })

  it('captures responsive networking layout', () => {
    cy.waitForSimulation()
    
    // Let some events generate
    cy.wait(5000)
    
    // Test medium screen
    cy.viewport(1200, 800)
    cy.wait(1000)
    cy.captureUI('networking-medium-screen')
    
    // Test mobile layout
    cy.viewport(768, 800)
    cy.wait(1000)
    cy.captureUI('networking-mobile-layout')
    
    // Back to desktop
    cy.viewport(1400, 900)
    cy.wait(1000)
    cy.captureUI('networking-desktop-final')
  })
})