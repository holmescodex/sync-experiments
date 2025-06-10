describe('Debug Sync Calculation', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(2000)
    
    // Disable automatic message generation
    cy.get('input[type="checkbox"]').uncheck({ force: true })
    cy.wait(1000)
  })

  it('debugs the exact scenario from screenshot', () => {
    // Send exactly one message like in the screenshot
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('test')
      cy.get('.send-button').click()
    })

    cy.wait(3000) // Wait for processing

    // Check browser console for debug logs
    cy.window().then((win) => {
      // The debug logs should show the actual values
      // Let's also check the sync status values
      
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible').then($el => {
          cy.log('Alice sync indicator text:', $el.text())
        })
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible').then($el => {
          cy.log('Bob sync indicator text:', $el.text())
        })
      })
    })

    // Verify the timeline shows the message
    cy.get('[data-testid="executed-event"]').should('have.length.at.least', 1)
    cy.contains('test').should('be.visible')

    // Expected calculations:
    // Total messages sent: 1 (Alice's "test")
    // Alice: own=1, received=0, total=1 → (1+0)/1 = 100%
    // Bob: own=0, received=0, total=1 → (0+0)/1 = 0%
    
    cy.log('Expected: Alice 100%, Bob 0%')
    cy.log('Actual: Both showing 1% (this is the bug)')
  })

  it('manually calculates what the sync should be', () => {
    // Let's think through this step by step:
    
    // 1. Alice sends "test" message
    cy.get('[data-testid="chat-alice"]').within(() => {
      cy.get('.message-input').type('calculation test')
      cy.get('.send-button').click()
    })

    cy.wait(3000)

    // 2. This should result in:
    //    - totalEventCount = 1 (one message sent)
    //    - Alice.ownEventCount = 1 (she sent the message)
    //    - Alice.knownEventCount = 0 (no messages from others)
    //    - Bob.ownEventCount = 0 (he sent nothing)
    //    - Bob.knownEventCount = 0 (didn't receive Alice's message)

    // 3. Sync calculations should be:
    //    - Alice: (1 + 0) / 1 = 100%
    //    - Bob: (0 + 0) / 1 = 0%

    // Let's verify the timeline to confirm one message was sent
    cy.get('[data-testid="executed-event"]').should('have.length', 1)
    
    // The bug seems to be that both devices show 1% instead of 100%/0%
    // This suggests either:
    // A) totalEventCount is wrong (maybe 100 instead of 1?)
    // B) ownEventCount is wrong (maybe 0 instead of 1?)
    // C) The calculation is wrong somewhere
    
    cy.task('log', 'If Alice shows 1%, that means (Alice events) / (total) = 0.01')
    cy.task('log', 'So either Alice events = 1 and total = 100, or similar ratio')
    cy.task('log', 'This suggests totalEventCount is being inflated somehow')
  })
})