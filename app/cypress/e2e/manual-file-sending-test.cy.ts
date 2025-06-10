describe('Manual File Sending Test', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5176')
    cy.wait(2000) // Allow app to initialize
  })

  it('should test file attachment UI functionality', () => {
    // Take screenshot of initial state
    cy.screenshot('file-sending-initial-state')
    
    // Check that file attachment buttons are present
    cy.get('[data-testid="chat-alice"] .attach-button-inline').should('be.visible')
    cy.get('[data-testid="chat-bob"] .attach-button-inline').should('be.visible')
    
    // Create a test file for upload
    const fileName = 'test-image.jpg'
    cy.fixture('test-images/small.jpg', 'base64').then((fileContent) => {
      // Convert base64 to blob
      const blob = Cypress.Blob.base64StringToBlob(fileContent, 'image/jpeg')
      const testFile = new File([blob], fileName, { type: 'image/jpeg' })
      
      // Simulate file selection for Alice's chat
      cy.get('[data-testid="chat-alice"] input[type="file"]').then(input => {
        const dataTransfer = new DataTransfer()
        dataTransfer.items.add(testFile)
        input[0].files = dataTransfer.files
        
        // Trigger change event
        cy.wrap(input).trigger('change', { force: true })
      })
    })
    
    // Wait for file to be processed
    cy.wait(1000)
    
    // Check that file preview appears
    cy.get('[data-testid="chat-alice"] .file-preview').should('be.visible')
    cy.get('[data-testid="chat-alice"] .file-preview-item').should('contain', fileName)
    
    // Take screenshot showing file preview
    cy.screenshot('file-sending-with-preview')
    
    // Add a message to send with the file
    cy.get('[data-testid="chat-alice"] .message-input').type('Here is a test image')
    
    // Check that send button is enabled
    cy.get('[data-testid="chat-alice"] .send-button').should('not.be.disabled')
    
    // Take screenshot before sending
    cy.screenshot('file-sending-ready-to-send')
    
    // Click send button and monitor for errors
    let consoleErrors = []
    cy.window().then((win) => {
      win.console.error = (...args) => {
        consoleErrors.push(args.join(' '))
      }
    })
    
    cy.get('[data-testid="chat-alice"] .send-button').click()
    
    // Wait for message to be processed
    cy.wait(2000)
    
    // Take screenshot after sending
    cy.screenshot('file-sending-after-send')
    
    // Check that message appears in chat
    cy.get('[data-testid="chat-alice"] .message').should('contain', 'Here is a test image')
    
    // Check for console errors
    cy.then(() => {
      if (consoleErrors.length > 0) {
        cy.log('Console errors detected:', consoleErrors)
      }
    })
  })

  it('should test file attachment removal', () => {
    // Create a test file for upload
    const fileName = 'test-document.txt'
    const testFile = new File(['Test content'], fileName, { type: 'text/plain' })
    
    // Simulate file selection for Bob's chat
    cy.get('[data-testid="chat-bob"] input[type="file"]').then(input => {
      const dataTransfer = new DataTransfer()
      dataTransfer.items.add(testFile)
      input[0].files = dataTransfer.files
      
      // Trigger change event
      cy.wrap(input).trigger('change', { force: true })
    })
    
    // Wait for file to be processed
    cy.wait(1000)
    
    // Check that file preview appears
    cy.get('[data-testid="chat-bob"] .file-preview').should('be.visible')
    cy.get('[data-testid="chat-bob"] .file-preview-item').should('contain', fileName)
    
    // Take screenshot showing file preview
    cy.screenshot('file-removal-with-preview')
    
    // Click remove button
    cy.get('[data-testid="chat-bob"] .file-remove-btn').click()
    
    // Check that file preview disappears
    cy.get('[data-testid="chat-bob"] .file-preview').should('not.exist')
    
    // Take screenshot after removal
    cy.screenshot('file-removal-after-remove')
  })

  it('should test multiple file attachments', () => {
    // Create multiple test files
    const files = [
      new File(['Test content 1'], 'doc1.txt', { type: 'text/plain' }),
      new File(['Test content 2'], 'doc2.txt', { type: 'text/plain' }),
    ]
    
    // Simulate multiple file selection for Alice's chat
    cy.get('[data-testid="chat-alice"] input[type="file"]').then(input => {
      const dataTransfer = new DataTransfer()
      files.forEach(file => dataTransfer.items.add(file))
      input[0].files = dataTransfer.files
      
      // Trigger change event
      cy.wrap(input).trigger('change', { force: true })
    })
    
    // Wait for files to be processed
    cy.wait(1000)
    
    // Check that both files appear in preview
    cy.get('[data-testid="chat-alice"] .file-preview-item').should('have.length', 2)
    cy.get('[data-testid="chat-alice"] .file-preview-header').should('contain', 'Attachments (2)')
    
    // Take screenshot showing multiple files
    cy.screenshot('multiple-files-preview')
  })
})