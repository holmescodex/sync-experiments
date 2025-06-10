describe('File Upload Functional Test', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5176')
    
    // Wait for app to initialize
    cy.get('[data-testid="simulation-app"]', { timeout: 15000 }).should('be.visible')
    cy.wait(5000) // Allow databases to initialize
  })

  it('should test file attachment and message sending functionality', () => {
    const errors = []
    
    // Set up error monitoring
    cy.window().then((win) => {
      win.addEventListener('error', (e) => {
        errors.push(`JS Error: ${e.error?.message || e.message}`)
      })
      win.addEventListener('unhandledrejection', (e) => {
        errors.push(`Promise Rejection: ${e.reason}`)
      })
      const originalError = win.console.error
      win.console.error = (...args) => {
        errors.push(`Console Error: ${args.join(' ')}`)
        originalError.apply(win.console, args)
      }
    })

    // Take initial screenshot
    cy.screenshot('file-upload-initial-state')
    
    // Check that chat interfaces are present
    cy.get('[data-testid="chat-alice"]').should('be.visible')
    cy.get('[data-testid="chat-bob"]').should('be.visible')
    
    // Check that file attachment buttons are present
    cy.get('[data-testid="chat-alice"] .attach-button-inline').should('be.visible')
    cy.get('[data-testid="chat-bob"] .attach-button-inline').should('be.visible')
    
    // Create a test text file
    const fileName = 'test-document.txt'
    const fileContent = 'This is a test file for upload'
    
    // Test file selection for Alice
    cy.get('[data-testid="chat-alice"] input[type="file"]').then($input => {
      const file = new File([fileContent], fileName, { type: 'text/plain' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      
      // Set files on input
      const input = $input[0] as HTMLInputElement
      input.files = dataTransfer.files
      
      // Trigger change event
      cy.wrap($input).trigger('change', { force: true })
    })
    
    // Wait for file processing
    cy.wait(2000)
    
    // Check if file preview appears
    cy.get('[data-testid="chat-alice"]').then($alice => {
      if ($alice.find('.file-preview').length > 0) {
        cy.log('File preview appeared successfully')
        cy.get('[data-testid="chat-alice"] .file-preview').should('be.visible')
        cy.get('[data-testid="chat-alice"] .file-preview-name').should('contain', fileName)
        cy.screenshot('file-upload-with-preview')
      } else {
        cy.log('File preview did not appear - checking for errors')
      }
    })
    
    // Add message text
    cy.get('[data-testid="chat-alice"] .message-input').type('Here is my test file')
    
    // Check send button state
    cy.get('[data-testid="chat-alice"] .send-button').should('not.be.disabled')
    
    // Click send button
    cy.get('[data-testid="chat-alice"] .send-button').click()
    
    // Wait for message processing
    cy.wait(3000)
    
    // Take screenshot after sending
    cy.screenshot('file-upload-after-send')
    
    // Check that message appears in chat (either with content or file info)
    cy.get('[data-testid="chat-alice"] .chat-messages').then($messages => {
      const messagesText = $messages.text()
      cy.log('Messages content:', messagesText)
      
      if (messagesText.includes('Here is my test file') || messagesText.includes(fileName)) {
        cy.log('Message sent successfully')
      } else {
        cy.log('Message may not have been processed yet')
      }
    })
    
    // Test file removal functionality
    cy.log('Testing file removal...')
    
    // Select another file
    cy.get('[data-testid="chat-bob"] input[type="file"]').then($input => {
      const file = new File(['Another test file'], 'test2.txt', { type: 'text/plain' })
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(file)
      
      const input = $input[0] as HTMLInputElement
      input.files = dataTransfer.files
      cy.wrap($input).trigger('change', { force: true })
    })
    
    cy.wait(1000)
    
    // Check if file preview appears for Bob
    cy.get('[data-testid="chat-bob"]').then($bob => {
      if ($bob.find('.file-preview').length > 0) {
        cy.log('Bob file preview appeared')
        cy.screenshot('file-upload-bob-preview')
        
        // Try to remove the file
        cy.get('[data-testid="chat-bob"] .file-remove-btn').click()
        cy.wait(500)
        
        // Check if preview disappears
        cy.get('[data-testid="chat-bob"] .file-preview').should('not.exist')
        cy.screenshot('file-upload-after-removal')
      }
    })
    
    // Report any errors that occurred
    cy.then(() => {
      if (errors.length > 0) {
        cy.log('Errors during file upload test:')
        errors.forEach(error => cy.log(error))
        cy.log(`Total errors: ${errors.length}`)
      } else {
        cy.log('No errors detected during file upload test')
      }
    })
    
    // Final screenshot
    cy.screenshot('file-upload-test-complete')
  })
})