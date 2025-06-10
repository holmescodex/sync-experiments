describe('Manual File Transfer - Alice to Bob E2E Test', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.get('[data-testid="simulation-app"]').should('be.visible')
    cy.wait(2000)
    
    // Disable automatic generation to ensure clean test
    cy.get('[data-testid="device-controls-alice"]').within(() => {
      cy.get('input[type="checkbox"]').uncheck({ force: true })
    })
    cy.get('[data-testid="device-controls-bob"]').within(() => {
      cy.get('input[type="checkbox"]').uncheck({ force: true })
    })
    cy.wait(1000)
  })

  it('should enable Alice to manually send a file to Bob through the complete P2P workflow', () => {
    cy.log('=== Complete Manual File Transfer E2E Test ===')
    
    // Phase 1: Verify basic infrastructure
    cy.log('Phase 1: Verifying chat infrastructure')
    cy.get('[data-testid="chat-alice"]').should('be.visible')
    cy.get('[data-testid="chat-bob"]').should('be.visible')
    
    // Phase 2: Test basic message sending first
    cy.log('Phase 2: Testing basic message functionality')
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Basic infrastructure test')
      cy.get('.send-button').click()
    })
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Basic infrastructure test', { timeout: 8000 }).should('be.visible')
    })
    cy.log(' Basic messaging infrastructure works')
    
    // Phase 3: Test file attachment UI
    cy.log('Phase 3: Testing file attachment UI')
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.attach-button-inline').should('be.visible').click()
      
      cy.get('input[type="file"]').selectFile({
        contents: Cypress.Buffer.from('sample-image-data-for-e2e-test'),
        fileName: 'sample-image.jpg',
        mimeType: 'image/jpeg'
      }, { force: true })
    })
    
    cy.wait(3000) // Wait for file processing
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.file-preview', { timeout: 10000 }).should('be.visible')
      cy.contains('sample-image.jpg').should('be.visible')
      cy.contains('Attachments (1)').should('be.visible')
    })
    cy.log(' File attachment UI is working')
    
    // Phase 4: Send message with file attachment
    cy.log('Phase 4: Sending message with file attachment')
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').clear().type('Alice to Bob: File transfer test')
      cy.get('.send-button').should('not.be.disabled').click()
    })
    
    // Phase 5: Verify message appears in Alice's chat with attachment
    cy.log('Phase 5: Verifying message with attachment in Alice chat')
    cy.get('[data-testid="chat-alice"]').within(() => {
      // First ensure the message exists in the DOM
      cy.contains('Alice to Bob: File transfer test', { timeout: 15000 }).should('exist')
      
      // Scroll to the message to make it visible
      cy.contains('Alice to Bob: File transfer test').scrollIntoView()
      
      // Now check visibility
      cy.contains('Alice to Bob: File transfer test').should('be.visible')
      
      // Verify attachment is present
      cy.contains('Alice to Bob: File transfer test').parent().parent().within(() => {
        cy.get('.message-attachments', { timeout: 5000 }).should('be.visible')
        cy.get('.attachment').should('be.visible')
      })
    })
    cy.log(' Message with attachment appears in Alice chat')
    
    // Phase 6: Verify event timeline shows file attachment indicator
    cy.log('Phase 6: Verifying event timeline shows file attachment')
    cy.get('[data-testid="event-timeline"]').within(() => {
      cy.contains('Alice to Bob: File transfer test').should('be.visible')
      cy.get('.attachment-indicator, .file-intent-indicator').should('be.visible')
    })
    cy.log(' Event timeline shows file attachment indicator')
    
    // Phase 7: Wait for P2P sync to Bob
    cy.log('Phase 7: Waiting for P2P synchronization to Bob')
    cy.get('[data-testid="chat-bob"]', { timeout: 20000 }).within(() => {
      cy.contains('Alice to Bob: File transfer test').should('be.visible')
    })
    cy.log(' Bob received the message via P2P sync')
    
    // Phase 8: Verify Bob sees the file attachment
    cy.log('Phase 8: Verifying Bob can see the file attachment')
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Alice to Bob: File transfer test').parent().parent().within(() => {
        cy.get('.message-attachments').should('be.visible')
        cy.get('.attachment').should('be.visible')
      })
    })
    cy.log(' Bob can see the file attachment')
    
    // Phase 9: Verify database stats show file transfer events
    cy.log('Phase 9: Verifying database stats show file transfer')
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.database-activity').within(() => {
        cy.get('.db-value').first().invoke('text').then(text => {
          const eventCount = parseInt(text)
          expect(eventCount).to.be.greaterThan(1) // Message + file chunks
        })
      })
    })
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.database-activity').within(() => {
        cy.get('.db-value').first().invoke('text').then(text => {
          const eventCount = parseInt(text)
          expect(eventCount).to.be.greaterThan(1) // Should have received the events
        })
      })
    })
    cy.log(' Database stats confirm file transfer events')
    
    // Phase 10: Verify successful synchronization status
    cy.log('Phase 10: Verifying synchronization status')
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('[data-testid="sync-indicator"]').should('contain', 'Synced')
    })
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('[data-testid="sync-indicator"]').should('contain', 'Synced')
    })
    cy.log(' Sync status shows successful synchronization')
    
    cy.log('<� COMPLETE MANUAL FILE TRANSFER E2E TEST PASSED!')
    cy.log(' Alice successfully sent a file to Bob through P2P sync')
    cy.log(' File attachments work end-to-end in the UI')
    cy.log(' Event timeline correctly shows file attachment indicators')
    cy.log(' Database shows proper file chunking and transfer')
    cy.log(' P2P synchronization successfully delivered the file')
  })

  it('should handle multiple file attachments', () => {
    cy.log('=== Testing Multiple File Attachments ===')
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.attach-button-inline').click()
      
      cy.get('input[type="file"]').selectFile([
        {
          contents: Cypress.Buffer.from('first-file-data'),
          fileName: 'document1.pdf',
          mimeType: 'application/pdf'
        },
        {
          contents: Cypress.Buffer.from('second-file-data'),
          fileName: 'image2.jpg',
          mimeType: 'image/jpeg'
        }
      ], { force: true })
    })
    
    cy.wait(3000)
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Attachments (2)').should('be.visible')
      cy.contains('document1.pdf').should('be.visible')
      cy.contains('image2.jpg').should('be.visible')
      
      cy.get('.message-input').type('Multiple files test')
      cy.get('.send-button').click()
    })
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Multiple files test', { timeout: 15000 }).should('exist')
      cy.contains('Multiple files test').scrollIntoView()
      cy.contains('Multiple files test').should('be.visible')
      cy.get('.attachment').should('have.length', 2)
    })
    
    cy.get('[data-testid="chat-bob"]', { timeout: 20000 }).within(() => {
      cy.contains('Multiple files test').should('be.visible')
      cy.get('.attachment').should('have.length', 2)
    })
    
    cy.log(' Multiple file attachments work correctly')
  })

  it('should allow file removal before sending', () => {
    cy.log('=== Testing File Removal ===')
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.attach-button-inline').click()
      cy.get('input[type="file"]').selectFile({
        contents: Cypress.Buffer.from('removable-file'),
        fileName: 'removeme.jpg',
        mimeType: 'image/jpeg'
      }, { force: true })
    })
    
    cy.wait(2000)
    
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('removeme.jpg').should('be.visible')
      cy.get('.file-remove-btn').click()
      cy.contains('removeme.jpg').should('not.exist')
      cy.get('.file-preview').should('not.exist')
    })
    
    cy.log(' File removal works correctly')
  })
})