describe('Debug Manual File Transfer', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('[data-testid="simulation-app"]').should('be.visible')
    
    // Disable automatic generation
    cy.get('[data-testid="device-controls-alice"]').within(() => {
      cy.get('input[type="checkbox"]').uncheck({ force: true })
    })
    cy.get('[data-testid="device-controls-bob"]').within(() => {
      cy.get('input[type="checkbox"]').uncheck({ force: true })
    })
    
    cy.wait(1000)
  })

  it('should debug the basic message sending flow', () => {
    cy.log('=== Debug Basic Message Flow ===')
    
    // Step 1: Check initial state
    cy.get('[data-testid="chat-alice"]').should('be.visible')
    
    // Step 2: Try sending a simple text message first (no files)
    cy.log('Sending simple text message')
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Simple test message')
      cy.get('.send-button').click()
    })
    
    // Step 3: Wait and check if text message appears
    cy.wait(2000)
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Simple test message').should('be.visible')
    })
    
    // Step 4: Now try with a file
    cy.log('Now testing with file attachment')
    cy.get('[data-testid="chat-alice"]').within(() => {
      // Click attach button
      cy.get('.attach-button-inline').click()
      
      // Select file
      cy.get('input[type="file"]').selectFile({
        contents: Cypress.Buffer.from('test-file-data'),
        fileName: 'test.jpg',
        mimeType: 'image/jpeg'
      }, { force: true })
      
      // Wait for file to be processed
      cy.wait(1000)
      
      // Check if file preview appears
      cy.get('.file-preview', { timeout: 5000 }).should('be.visible')
      cy.contains('test.jpg').should('be.visible')
      
      // Type message
      cy.get('.message-input').type('Message with file')
      
      // Send
      cy.get('.send-button').click()
    })
    
    // Step 5: Check if message with file appears
    cy.wait(3000)
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Message with file', { timeout: 10000 }).should('be.visible')
    })
    
    cy.log('✅ Debug test completed')
  })

  it('should debug the file attachment UI', () => {
    cy.log('=== Debug File Attachment UI ===')
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      // Test file input
      cy.get('.attach-button-inline').should('be.visible').click()
      
      cy.get('input[type="file"]').should('exist')
      
      // Try to attach a file
      cy.get('input[type="file"]').selectFile({
        contents: Cypress.Buffer.from('debug-file'),
        fileName: 'debug.jpg',
        mimeType: 'image/jpeg'
      }, { force: true })
      
      // Check file processing
      cy.wait(2000)
      
      // Log what we can see
      cy.get('body').then($body => {
        if ($body.find('.file-preview').length > 0) {
          cy.log('✅ File preview found')
          cy.get('.file-preview').should('be.visible')
        } else {
          cy.log('❌ No file preview found')
        }
        
        if ($body.find('.file-preview-item').length > 0) {
          cy.log('✅ File preview item found')
        } else {
          cy.log('❌ No file preview item found')
        }
      })
    })
  })
})