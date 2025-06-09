/// <reference types="cypress" />

// Custom Cypress commands for our simulation app

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Take a screenshot of the current UI state
       */
      captureUI(name: string): Chainable<void>
      
      /**
       * Wait for simulation to load and stabilize
       */
      waitForSimulation(): Chainable<void>
    }
  }
}

Cypress.Commands.add('captureUI', (name: string) => {
  cy.screenshot(name, { 
    capture: 'viewport',
    overwrite: true 
  })
})

Cypress.Commands.add('waitForSimulation', () => {
  // Wait for React app to load
  cy.get('[data-testid="simulation-app"]', { timeout: 10000 }).should('be.visible')
  
  // Wait for chat interfaces to initialize
  cy.get('.chat-interface', { timeout: 5000 }).should('have.length', 2)
  
  // Wait a moment for initial events to generate
  cy.wait(2000)
})