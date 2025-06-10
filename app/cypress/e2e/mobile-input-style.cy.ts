describe('Mobile-Style Input Layout', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(1000) // Wait for app to load
  })

  it('should display attachment button inside message input field', () => {
    // Check that input container exists with proper structure in first chat interface
    cy.get('.chat-interface').first().within(() => {
      cy.get('.input-container').should('exist').and('be.visible')
      
      // Check that attachment button is inside the input container
      cy.get('.input-container').within(() => {
        cy.get('.attach-button-inline')
          .should('exist')
          .and('be.visible')
          .and('contain.text', '📎')
          .and('have.attr', 'title', 'Attach file')
      })
    })
  })

  it('should have properly styled input field like mobile apps', () => {
    cy.get('.chat-interface').first().within(() => {
      // Check input container styling
      cy.get('.input-container')
        .should('have.css', 'border-radius', '24px')
        .should('have.css', 'background-color')
      
      // Check message input has no border and proper padding
      cy.get('.message-input')
        .should('have.css', 'border-width', '0px')
        .should('have.css', 'background-color', 'rgba(0, 0, 0, 0)')
        .should('have.css', 'padding-right', '48px') // Space for attachment button
    })
  })

  it('should have circular send button aligned with input', () => {
    cy.get('.chat-interface').first().within(() => {
      // Check send button is circular and properly sized
      cy.get('.send-button')
        .should('have.css', 'border-radius', '50%')
        .should('have.css', 'width', '48px')
        .should('have.css', 'height', '48px')
    })
  })

  it('should show focus styles when input is focused', () => {
    cy.get('.chat-interface').first().within(() => {
      // Focus the input and check container gets focus styles
      cy.get('.message-input').focus()
      
      cy.get('.input-container')
        .should('have.css', 'border-color', 'rgb(0, 123, 255)')
        .should('have.css', 'background-color', 'rgb(255, 255, 255)')
    })
  })

  it('should allow clicking attachment button to open file dialog', () => {
    cy.get('.chat-interface').first().within(() => {
      // Click the inline attachment button
      cy.get('.attach-button-inline').click()
      
      // Note: We can't actually test file dialog opening in Cypress,
      // but we can verify the button is clickable and doesn't cause errors
      cy.get('.attach-button-inline').should('be.visible')
    })
  })

  it('should have hover effects on attachment button', () => {
    cy.get('.chat-interface').first().within(() => {
      // Hover over attachment button and check style changes
      cy.get('.attach-button-inline')
        .trigger('mouseover')
        .should('have.css', 'color', 'rgb(0, 123, 255)')
    })
  })

  it('should have proper mobile-style layout spacing', () => {
    cy.get('.chat-interface').first().within(() => {
      // Check chat input has proper padding and gap
      cy.get('.chat-input')
        .should('have.css', 'padding', '12px 16px')
        .should('have.css', 'gap', '12px') // 0.75rem = 12px
    })
  })

  it('should maintain responsive design', () => {
    // Test different viewport sizes
    cy.viewport(375, 667) // iPhone SE
    cy.get('.chat-interface').first().within(() => {
      cy.get('.input-container').should('be.visible')
      cy.get('.attach-button-inline').should('be.visible')
      cy.get('.send-button').should('be.visible')
    })
    
    cy.viewport(768, 1024) // iPad
    cy.get('.chat-interface').first().within(() => {
      cy.get('.input-container').should('be.visible')
      cy.get('.attach-button-inline').should('be.visible')
      cy.get('.send-button').should('be.visible')
    })
  })

  it('should show disabled state for send button when input is empty', () => {
    cy.get('.chat-interface').first().within(() => {
      // Initially send button should be disabled
      cy.get('.send-button').should('be.disabled')
      
      // Type message and button should be enabled
      cy.get('.message-input').type('Hello')
      cy.get('.send-button').should('not.be.disabled')
      
      // Clear message and button should be disabled again
      cy.get('.message-input').clear()
      cy.get('.send-button').should('be.disabled')
    })
  })
})