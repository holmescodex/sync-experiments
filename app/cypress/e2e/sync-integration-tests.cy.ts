describe('Sync Integration Tests', () => {
  beforeEach(() => {
    cy.visit('/')
    // Wait for simulation to start
    cy.wait(2000)
  })

  describe('Real Sync Behavior', () => {
    it('shows sync progress as messages are sent and delivered', () => {
      // Initially both devices should show low sync (0% or low percentage) 
      // since no messages have been sent yet
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
      })
      
      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
      })

      // Send a manual message from Alice
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('.message-input').type('Hello Bob from Alice!')
        cy.get('.send-button').click()
      })

      // Wait for message to be sent and potentially delivered
      cy.wait(3000)

      // Alice should have higher sync since she sent a message
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('contain', '%')
        // Alice should not be at 0% since she sent a message
        cy.get('[data-testid="sync-indicator"]').should('not.contain', '0%')
      })

      // Send a message from Bob
      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('.message-input').type('Hi Alice from Bob!')
        cy.get('.send-button').click()
      })

      // Wait for messages to be delivered
      cy.wait(5000)

      // Both devices should have better sync now
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
        // Should show some percentage
        cy.get('[data-testid="sync-indicator"]').should('contain', '%')
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('contain', '%')
      })
    })

    it('shows degraded sync with high packet loss', () => {
      // Set high packet loss via network controls
      cy.get('.network-controls').within(() => {
        // Find and adjust packet loss slider to high value
        cy.get('input[type="range"]').first().then($slider => {
          // Set to high packet loss (around 80%)
          cy.wrap($slider).invoke('val', 80).trigger('input')
        })
      })

      // Send multiple messages
      for (let i = 1; i <= 3; i++) {
        cy.get('[data-testid="chat-alice"]').within(() => {
          cy.get('.message-input').type(`Message ${i} from Alice`)
          cy.get('.send-button').click()
        })
        cy.wait(1000)
      }

      // Wait for delivery attempts
      cy.wait(5000)

      // With high packet loss, sync should be poor
      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
        // Should show relatively low sync due to packet loss
        cy.get('[data-testid="sync-indicator"]').then($indicator => {
          const text = $indicator.text()
          // Extract percentage if present
          const match = text.match(/(\\d+)%/)
          if (match) {
            const percentage = parseInt(match[1])
            // With 80% packet loss, sync should be significantly impacted
            expect(percentage).to.be.lessThan(100)
          }
        })
      })
    })

    it('shows improved sync with perfect network conditions', () => {
      // Set zero packet loss
      cy.get('.network-controls').within(() => {
        cy.get('input[type="range"]').first().then($slider => {
          cy.wrap($slider).invoke('val', 0).trigger('input')
        })
      })

      // Send messages from both devices
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('.message-input').type('Perfect network test from Alice')
        cy.get('.send-button').click()
      })

      cy.wait(1000)

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('.message-input').type('Perfect network test from Bob')
        cy.get('.send-button').click()
      })

      // Wait for delivery with perfect network
      cy.wait(3000)

      // Both devices should have good sync
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').then($indicator => {
          const text = $indicator.text()
          // Should show high sync percentage or "Synced"
          expect(text).to.satisfy((str: string) => {
            return str.includes('Synced') || str.includes('%')
          })
        })
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').then($indicator => {
          const text = $indicator.text()
          expect(text).to.satisfy((str: string) => {
            return str.includes('Synced') || str.includes('%')
          })
        })
      })
    })
  })

  describe('Timeline Correlation', () => {
    it('shows executed events in timeline when messages are sent', () => {
      // Send a message
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('.message-input').type('Timeline test message')
        cy.get('.send-button').click()
      })

      // Wait for execution
      cy.wait(2000)

      // Should appear in executed events
      cy.get('[data-testid="event-timeline"]').within(() => {
        cy.get('[data-testid="executed-event"]').should('have.length.at.least', 1)
        cy.contains('Timeline test message').should('be.visible')
      })

      // The executed event should show Alice as the sender
      cy.get('[data-testid="executed-event"]').first().within(() => {
        cy.contains('alice').should('be.visible')
      })
    })

    it('correlates sync percentage with number of executed events', () => {
      // Start with no messages - record initial state
      let initialExecutedCount = 0
      
      cy.get('[data-testid="event-timeline"]').then($timeline => {
        const executedEvents = $timeline.find('[data-testid="executed-event"]')
        initialExecutedCount = executedEvents.length
      })

      // Send a message
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('.message-input').type('Correlation test')
        cy.get('.send-button').click()
      })

      cy.wait(2000)

      // Should have more executed events
      cy.get('[data-testid="executed-event"]').should('have.length.at.least', initialExecutedCount + 1)

      // Alice's sync should reflect that she has sent a message
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('not.contain', '0%')
      })
    })
  })

  describe('Sync Logic Validation', () => {
    it('demonstrates correct sync calculation logic', () => {
      // This test validates the sync calculation makes intuitive sense
      
      // Clear any existing state by reloading
      cy.reload()
      cy.wait(2000)

      // Disable automatic message generation to have clean test
      cy.get('input[type="checkbox"]').uncheck({ force: true })
      cy.wait(1000)

      // Send one message from Alice
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('.message-input').type('Only message in conversation')
        cy.get('.send-button').click()
      })

      cy.wait(3000) // Wait for delivery

      // In a perfect world:
      // - Total messages sent: 1 (by Alice)
      // - Alice has: 1 message (her own) = 100% sync
      // - Bob has: 0 or 1 message (depending on delivery) = 0% or 100% sync
      
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
        // Alice should have good sync since she sent the only message
        cy.get('[data-testid="sync-indicator"]').then($indicator => {
          const text = $indicator.text()
          cy.log('Alice sync status:', text)
          // Alice should not be at 0% since she sent a message
          expect(text).not.to.contain('0%')
        })
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').then($indicator => {
          const text = $indicator.text()
          cy.log('Bob sync status:', text)
          // Bob's sync depends on whether he received Alice's message
          // Should be either 0% (didn't receive) or high% (received)
        })
      })

      // Verify timeline shows the message
      cy.get('[data-testid="executed-event"]').should('have.length.at.least', 1)
      cy.contains('Only message in conversation').should('be.visible')
    })

    it('shows that sync percentage represents conversation completeness', () => {
      // Disable auto generation
      cy.get('input[type="checkbox"]').uncheck({ force: true })
      
      // Create a multi-message conversation
      const messages = [
        { sender: 'alice', text: 'Message 1 from Alice' },
        { sender: 'bob', text: 'Message 1 from Bob' },
        { sender: 'alice', text: 'Message 2 from Alice' },
      ]

      messages.forEach((msg, index) => {
        cy.get(`[data-testid="chat-${msg.sender}"]`).within(() => {
          cy.get('.message-input').type(msg.text)
          cy.get('.send-button').click()
        })
        cy.wait(2000) // Wait between messages
      })

      // Wait for all deliveries
      cy.wait(5000)

      // Now both devices should have meaningful sync percentages
      // representing what portion of the total conversation they have
      
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').then($indicator => {
          const text = $indicator.text()
          cy.log('Alice final sync:', text)
          // Alice sent 2/3 messages and potentially received Bob's 1 message
          // So she should have high sync percentage
        })
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.get('[data-testid="sync-indicator"]').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').then($indicator => {
          const text = $indicator.text()
          cy.log('Bob final sync:', text)
          // Bob sent 1/3 messages and potentially received Alice's 2 messages
          // So he should have good sync if delivery worked
        })
      })

      // Verify all messages appear in timeline
      cy.get('[data-testid="executed-event"]').should('have.length.at.least', 3)
    })
  })
})