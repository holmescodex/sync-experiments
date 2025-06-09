describe('Button Height Fix', () => {
  beforeEach(() => {
    cy.visit('/')
  })

  it('captures chat input with properly sized send button', () => {
    cy.waitForSimulation()
    
    // Focus on chat interfaces to show the input area clearly
    cy.get('.chat-apps').scrollIntoView()
    cy.captureUI('chat-input-button-height-fixed')
    
    // Type something to show active state
    cy.get('.chat-interface').first().within(() => {
      cy.get('.message-input').type('Testing button height...')
    })
    
    cy.captureUI('chat-input-with-text-and-button')
  })
})