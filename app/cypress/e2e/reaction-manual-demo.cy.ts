describe('Reaction Manual Demo', () => {
  it('manually adds reactions to demonstrate UI', () => {
    cy.visit('/')
    cy.viewport(1400, 900)
    
    // Wait for initialization
    cy.wait(3000)
    
    // Send messages without waiting for sync
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hello Bob! Check out reactions!')
      cy.get('.send-button').click()
    })
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Hi Alice! This is cool!')
      cy.get('.send-button').click()
    })
    
    cy.wait(1000)
    
    // Inject test reactions directly into the DOM for demonstration
    cy.window().then((win) => {
      const doc = win.document
      
      // Add styles to show reaction buttons and inject test reactions
      const style = doc.createElement('style')
      style.innerHTML = `
        .add-reaction-button { 
          opacity: 1 !important; 
          visibility: visible !important;
        }
        
        /* Add test reactions for demo */
        .test-reactions {
          display: flex;
          gap: 4px;
          margin-top: 6px;
        }
        
        .test-reaction {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          padding: 4px 8px;
          background: rgba(0, 0, 0, 0.05);
          border: 1px solid transparent;
          border-radius: 16px;
          font-size: 13px;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        
        .message.sent .test-reaction {
          background: rgba(255, 255, 255, 0.2);
          border-color: rgba(255, 255, 255, 0.3);
        }
        
        .test-reaction.own {
          background: #007AFF;
          color: white;
        }
        
        .test-count {
          font-size: 12px;
          font-weight: 600;
          opacity: 0.8;
        }
      `
      doc.head.appendChild(style)
      
      // Add test reactions to messages
      const messages = doc.querySelectorAll('.message-bubble')
      
      // Add reactions to first message (Alice's)
      if (messages[0]) {
        const reactionsDiv = doc.createElement('div')
        reactionsDiv.className = 'test-reactions'
        reactionsDiv.innerHTML = `
          <div class="test-reaction">
            <span>❤️</span>
            <span class="test-count">2</span>
          </div>
          <div class="test-reaction">
            <span>👍</span>
            <span class="test-count">1</span>
          </div>
          <div class="test-reaction own">
            <span>🔥</span>
            <span class="test-count">1</span>
          </div>
        `
        messages[0].appendChild(reactionsDiv)
      }
      
      // Add reactions to Bob's message
      if (messages[2]) {
        const reactionsDiv = doc.createElement('div')
        reactionsDiv.className = 'test-reactions'
        reactionsDiv.innerHTML = `
          <div class="test-reaction own">
            <span>😊</span>
            <span class="test-count">1</span>
          </div>
          <div class="test-reaction">
            <span>🎉</span>
            <span class="test-count">2</span>
          </div>
        `
        messages[2].appendChild(reactionsDiv)
      }
    })
    
    cy.wait(1000)
    
    // Take screenshots
    cy.screenshot('1-messages-with-test-reactions', { capture: 'viewport' })
    cy.get('.chat-apps').screenshot('2-chat-interfaces-reactions')
    
    // Show emoji picker
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message').first().find('.add-reaction-button').click({ force: true })
    })
    
    cy.wait(500)
    
    cy.get('body').then($body => {
      if ($body.find('.emoji-picker').length > 0) {
        cy.screenshot('3-emoji-picker-demo', { capture: 'viewport' })
      }
    })
    
    // Close-up of just chats
    cy.get('.chat-grid').screenshot('4-reaction-ui-final')
  })
})