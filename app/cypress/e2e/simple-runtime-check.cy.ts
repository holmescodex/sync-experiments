describe('Simple Runtime Check', () => {
  it('should load the app without errors', () => {
    // Monitor console errors
    let consoleErrors = []
    cy.window().then((win) => {
      win.addEventListener('error', (e) => {
        consoleErrors.push(`Error: ${e.error.message}`)
      })
      win.addEventListener('unhandledrejection', (e) => {
        consoleErrors.push(`Unhandled Promise Rejection: ${e.reason}`)
      })
      // Override console.error to capture errors
      const originalError = win.console.error
      win.console.error = (...args) => {
        consoleErrors.push(`Console Error: ${args.join(' ')}`)
        originalError.apply(win.console, args)
      }
    })

    cy.visit('http://localhost:5176')
    
    // Wait for app to initialize
    cy.wait(5000)
    
    // Take screenshot of app state
    cy.screenshot('app-initial-state')
    
    // Check that main elements are present
    cy.get('[data-testid="simulation-app"]', { timeout: 10000 }).should('be.visible')
    
    // Wait for databases to initialize
    cy.wait(3000)
    
    // Check for chat interfaces
    cy.get('[data-testid="chat-alice"]').should('be.visible')
    cy.get('[data-testid="chat-bob"]').should('be.visible')
    
    // Check for file attachment buttons
    cy.get('.attach-button-inline').should('have.length.at.least', 2)
    
    // Try to interact with file attachment
    cy.get('.attach-button-inline').first().click()
    
    // Check if file input exists
    cy.get('input[type="file"]').should('exist')
    
    // Take screenshot after interaction
    cy.screenshot('app-after-interaction')
    
    // Check for errors
    cy.then(() => {
      if (consoleErrors.length > 0) {
        cy.log('Runtime errors detected:')
        consoleErrors.forEach(error => cy.log(error))
        throw new Error(`Runtime errors detected: ${consoleErrors.join('; ')}`)
      } else {
        cy.log('No runtime errors detected')
      }
    })
  })
})