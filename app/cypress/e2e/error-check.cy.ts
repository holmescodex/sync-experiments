describe('Error Check', () => {
  it('should load app and capture any errors', () => {
    const errors = []
    
    cy.window().then((win) => {
      // Capture all types of errors
      win.addEventListener('error', (e) => {
        errors.push(`JS Error: ${e.error?.message || e.message}`)
      })
      
      win.addEventListener('unhandledrejection', (e) => {
        errors.push(`Promise Rejection: ${e.reason}`)
      })
      
      const originalConsoleError = win.console.error
      win.console.error = (...args) => {
        errors.push(`Console Error: ${args.join(' ')}`)
        originalConsoleError.apply(win.console, args)
      }
      
      const originalConsoleWarn = win.console.warn
      win.console.warn = (...args) => {
        errors.push(`Console Warning: ${args.join(' ')}`)
        originalConsoleWarn.apply(win.console, args)
      }
    })

    cy.visit('http://localhost:5176')
    
    // Wait for initial load
    cy.wait(8000)
    
    // Take a screenshot to see current state
    cy.screenshot('error-check-state')
    
    // Try to find any main element
    cy.get('body').should('exist')
    cy.get('#root').should('exist')
    
    // Check if the app rendered
    cy.get('body').then(($body) => {
      if ($body.find('[data-testid="simulation-app"]').length > 0) {
        cy.log('App rendered successfully')
        cy.get('[data-testid="simulation-app"]').should('be.visible')
      } else {
        cy.log('App did not render - checking for error message')
        // Check if there's any error content
        cy.get('body').then(($el) => {
          cy.log('Body content:', $el.text())
        })
      }
    })
    
    // Report any captured errors
    cy.then(() => {
      if (errors.length > 0) {
        cy.log('Errors found:')
        errors.forEach(error => cy.log(error))
        
        // Don't fail the test - just log the errors
        cy.log(`Total errors: ${errors.length}`)
      } else {
        cy.log('No errors detected')
      }
    })
  })
})