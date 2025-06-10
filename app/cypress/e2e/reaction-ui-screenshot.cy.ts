describe('Reaction UI Screenshots', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.viewport(1400, 800)
  })

  it('captures reaction functionality in action', () => {
    // Wait for app to initialize
    cy.wait(2000)
    
    // Enable automatic message generation for both devices
    cy.get('[data-testid="frequency-alice"]').clear().type('60')
    cy.get('[data-testid="frequency-bob"]').clear().type('60')
    
    // Wait for some messages to appear
    cy.wait(5000)
    
    // Manually send messages from both devices
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hey Bob! Check out this cool reaction feature! 🎉')
      cy.get('.send-button').click()
    })
    
    cy.wait(1000)
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Wow Alice, that looks amazing! Let me try reacting to your message')
      cy.get('.send-button').click()
    })
    
    // Wait for messages to sync
    cy.wait(3000)
    
    // Add reactions by hovering and clicking
    cy.get('[data-testid="chat-bob"]').within(() => {
      // Find Alice's message (received) and add reaction
      cy.get('.message.received').first().within(() => {
        cy.get('.message-bubble').trigger('mouseover')
        cy.get('.add-reaction-button').should('be.visible').click({ force: true })
      })
    })
    
    // Wait for emoji picker to appear
    cy.get('.emoji-picker').should('be.visible')
    
    // Take screenshot with emoji picker open
    cy.screenshot('emoji-picker-open', { capture: 'viewport' })
    
    // Select a heart emoji
    cy.get('.emoji-picker .emoji-button').contains('❤️').click()
    
    cy.wait(2000)
    
    // Add more reactions from Alice
    cy.get('[data-testid="chat-alice"]').within(() => {
      // Find Bob's message and add reaction
      cy.get('.message.received').first().within(() => {
        cy.get('.message-bubble').trigger('mouseover')
        cy.get('.add-reaction-button').click({ force: true })
      })
    })
    
    // Select thumbs up
    cy.get('.emoji-picker .emoji-button').contains('👍').click()
    
    cy.wait(1000)
    
    // Add another reaction to the same message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.received').first().within(() => {
        cy.get('.message-bubble').trigger('mouseover')
        cy.get('.add-reaction-button').click({ force: true })
      })
    })
    
    // Select fire emoji
    cy.get('.emoji-picker .emoji-button').contains('🔥').click()
    
    cy.wait(2000)
    
    // Bob adds more reactions to Alice's message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().within(() => {
        cy.get('.message-bubble').trigger('mouseover')
        cy.get('.add-reaction-button').click({ force: true })
      })
    })
    
    cy.get('.emoji-picker .emoji-button').contains('🎉').click()
    
    cy.wait(1000)
    
    // Click on existing reaction to add to it
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').first().within(() => {
        cy.get('.reaction-badge').contains('❤️').click()
      })
    })
    
    cy.wait(2000)
    
    // Take final screenshot showing messages with multiple reactions
    cy.screenshot('messages-with-reactions', { capture: 'viewport' })
    
    // Take a close-up of just the chat interfaces
    cy.get('.chat-grid').screenshot('chat-interfaces-with-reactions')
    
    // Show emoji picker categories
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message.sent').last().within(() => {
        cy.get('.message-bubble').trigger('mouseover')
        cy.get('.add-reaction-button').click({ force: true })
      })
    })
    
    // Click through categories
    cy.get('.emoji-picker .emoji-category').contains('Hearts').click()
    cy.wait(500)
    cy.screenshot('emoji-picker-hearts-category', { capture: 'viewport' })
    
    cy.get('.emoji-picker .emoji-category').contains('Food').click()
    cy.wait(500)
    cy.screenshot('emoji-picker-food-category', { capture: 'viewport' })
    
    // Search functionality
    cy.get('.emoji-picker .emoji-search').type('smile')
    cy.wait(500)
    cy.screenshot('emoji-picker-search', { capture: 'viewport' })
    
    // Close emoji picker
    cy.get('.emoji-picker .emoji-close').click()
    
    // Final overview
    cy.wait(1000)
    cy.screenshot('reaction-feature-complete', { capture: 'fullPage' })
  })
  
  it('captures mobile view with reactions', () => {
    cy.viewport(375, 812) // iPhone X size
    
    // Send a message and add reactions
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Mobile reaction test!')
      cy.get('.send-button').click()
    })
    
    cy.wait(3000)
    
    // Add reaction on mobile
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message.received').first().within(() => {
        cy.get('.message-bubble').trigger('touchstart')
        cy.get('.add-reaction-button').click({ force: true })
      })
    })
    
    cy.get('.emoji-picker').should('be.visible')
    cy.screenshot('mobile-emoji-picker', { capture: 'viewport' })
    
    cy.get('.emoji-picker .emoji-button').contains('😊').click()
    
    cy.wait(2000)
    cy.screenshot('mobile-with-reactions', { capture: 'viewport' })
  })
})