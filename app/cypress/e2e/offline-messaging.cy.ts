describe('Offline Messaging Tests', () => {
  beforeEach(() => {
    cy.visit('/')
    // Wait for the app to load and initialize
    cy.get('[data-testid="simulation-app"]').should('be.visible')
    cy.get('[data-testid="chat-alice"]').should('be.visible')
    cy.get('[data-testid="chat-bob"]').should('be.visible')
    
    // Wait for devices to be initialized (check for online status)
    cy.get('[data-testid="chat-alice"]').contains('Online')
    cy.get('[data-testid="chat-bob"]').contains('Online')
  })

  it('should prevent message delivery when recipient is offline', () => {
    // Both devices start online
    cy.get('[data-testid="chat-alice"]').contains('Online')
    cy.get('[data-testid="chat-bob"]').contains('Online')
    
    // Bob sends a message while both are online
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Hello Alice, are you there?')
      cy.get('.send-button').click()
    })
    
    // Wait a moment for message processing
    cy.wait(1000)
    
    // Alice should receive the message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Hello Alice, are you there?').should('be.visible')
    })
    
    // Take Alice offline using the toggle switch
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Offline').should('be.visible')
    })
    
    // Record Alice's current message count
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.status-indicator.messages').invoke('text').as('aliceMessagesBefore')
    })
    
    // Bob sends another message while Alice is offline
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Alice, did you go offline?')
      cy.get('.send-button').click()
    })
    
    // Wait for potential message processing
    cy.wait(2000)
    
    // Alice should NOT receive the new message (message count shouldn't increase)
    cy.get('@aliceMessagesBefore').then((beforeCount) => {
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('.status-indicator.messages').should('contain', beforeCount as string)
        cy.contains('Alice, did you go offline?').should('not.exist')
      })
    })
    
    // Bring Alice back online
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Online').should('be.visible')
    })
    
    // Wait for reconnection
    cy.wait(1000)
    
    // Bob sends a welcome back message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Welcome back Alice!')
      cy.get('.send-button').click()
    })
    
    // Wait for message processing
    cy.wait(1500)
    
    // Alice should receive the welcome back message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Welcome back Alice!').should('be.visible')
    })
  })

  it('should prevent outgoing messages from offline devices from reaching other devices', () => {
    // Take Alice offline
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Offline').should('be.visible')
    })
    
    // Record Bob's current message count
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.status-indicator.messages').invoke('text').as('bobMessagesBefore')
    })
    
    // Alice tries to send a message while offline
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Hello from offline Alice!')
      cy.get('.send-button').click()
    })
    
    // Wait for potential message processing
    cy.wait(2000)
    
    // Bob should NOT receive Alice's message
    cy.get('@bobMessagesBefore').then((beforeCount) => {
      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('.status-indicator.messages').should('contain', beforeCount as string)
        cy.contains('Hello from offline Alice!').should('not.exist')
      })
    })
    
    // Alice's message should appear in her own chat (stored locally)
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Hello from offline Alice!').should('be.visible')
    })
    
    // Bring Alice back online
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Online').should('be.visible')
    })
    
    // Wait for reconnection
    cy.wait(1000)
    
    // Alice sends another message while online
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Now I am back online!')
      cy.get('.send-button').click()
    })
    
    // Wait for message processing
    cy.wait(1500)
    
    // Bob should receive this new message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Now I am back online!').should('be.visible')
    })
  })

  it('should handle both devices going offline independently', () => {
    // Take both devices offline
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Offline').should('be.visible')
    })
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Offline').should('be.visible')
    })
    
    // Record initial message counts
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.status-indicator.messages').invoke('text').as('aliceMessagesBefore')
    })
    
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.status-indicator.messages').invoke('text').as('bobMessagesBefore')
    })
    
    // Alice tries to send a message while offline
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Message from offline Alice')
      cy.get('.send-button').click()
    })
    
    // Bob tries to send a message while offline
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.message-input').type('Message from offline Bob')
      cy.get('.send-button').click()
    })
    
    // Wait for potential processing
    cy.wait(2000)
    
    // Neither should receive the other's message
    cy.get('@aliceMessagesBefore').then((aliceCount) => {
      cy.get('[data-testid="chat-alice"]').within(() => {
        // Alice should see her own message but not Bob's
        cy.contains('Message from offline Alice').should('be.visible')
        cy.contains('Message from offline Bob').should('not.exist')
      })
    })
    
    cy.get('@bobMessagesBefore').then((bobCount) => {
      cy.get('[data-testid="chat-bob"]').within(() => {
        // Bob should see his own message but not Alice's
        cy.contains('Message from offline Bob').should('be.visible')
        cy.contains('Message from offline Alice').should('not.exist')
      })
    })
    
    // Bring Alice back online (but leave Bob offline)
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Online').should('be.visible')
    })
    
    // Wait for reconnection
    cy.wait(1000)
    
    // Alice sends a message to offline Bob
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Message to offline Bob')
      cy.get('.send-button').click()
    })
    
    // Wait for processing
    cy.wait(1500)
    
    // Bob (still offline) should not receive Alice's message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Message to offline Bob').should('not.exist')
    })
    
    // Bring Bob back online
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Online').should('be.visible')
    })
    
    // Wait for reconnection
    cy.wait(1000)
    
    // Now Alice sends a message to online Bob
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('Welcome back Bob!')
      cy.get('.send-button').click()
    })
    
    // Wait for processing
    cy.wait(1500)
    
    // Bob should receive this message
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Welcome back Bob!').should('be.visible')
    })
  })

  it('should show correct status indicators when offline', () => {
    // Both devices start online with sync indicators
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.contains('Online').should('be.visible')
      cy.get('[data-testid="sync-indicator"]').should('be.visible')
    })
    
    // Take Alice offline
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Offline').should('be.visible')
      // Sync indicator should be hidden when offline
      cy.get('[data-testid="sync-indicator"]').should('not.exist')
    })
    
    // Bob should still be online with sync indicator
    cy.get('[data-testid="chat-bob"]').within(() => {
      cy.contains('Online').should('be.visible')
      cy.get('[data-testid="sync-indicator"]').should('be.visible')
    })
    
    // Bring Alice back online
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.toggle-switch').click()
      cy.contains('Online').should('be.visible')
      // Sync indicator should reappear
      cy.get('[data-testid="sync-indicator"]').should('be.visible')
    })
  })
})