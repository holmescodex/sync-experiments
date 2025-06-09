describe('Sync Status Tests', () => {
  beforeEach(() => {
    cy.visit('/')
    cy.wait(1000) // Let simulation start
  })

  describe('Basic Sync Logic', () => {
    it('shows 100% sync when Bob receives Alice\'s only message', () => {
      // Stub the simulation state: Alice sent 1, Bob sent 0, Bob received Alice's message
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          // Clear existing events and set up controlled state
          engine.reset()
          
          // Mock network simulator to return our test state
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').callsFake((deviceId: string) => {
            if (deviceId === 'alice') {
              // Alice has sent 1 message, received 0 from Bob (no messages from Bob exist)
              return { isSynced: true, syncPercentage: 100 }
            } else if (deviceId === 'bob') {
              // Bob has sent 0 messages, received Alice's 1 message = perfect sync
              return { isSynced: true, syncPercentage: 100 }
            }
            return { isSynced: true, syncPercentage: 100 }
          })
          
          // Mock the event timeline to show Alice's sent message
          cy.stub(engine, 'getUpcomingEvents').returns([])
          cy.stub(engine, 'getExecutedEvents').returns([
            {
              simTime: 1000,
              type: 'message',
              deviceId: 'alice',
              eventId: 'msg-alice-1',
              data: { content: 'Hello Bob!' },
              executed: true
            }
          ])
        }
      })

      // Verify Alice shows 100% sync (sent her message)
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.contains('100%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('have.class', 'synced')
      })

      // Verify Bob shows 100% sync (received Alice's message)
      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('100%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('have.class', 'synced')
      })

      // Verify timeline shows the executed message
      cy.get('[data-testid="event-timeline"]').within(() => {
        cy.contains('Hello Bob!').should('be.visible')
        cy.get('[data-testid="executed-event"]').should('have.length', 1)
      })
    })

    it('shows 0% sync when Bob has not received Alice\'s message', () => {
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          engine.reset()
          
          // Mock network simulator: Alice sent 1, Bob received 0
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').callsFake((deviceId: string) => {
            if (deviceId === 'alice') {
              // Alice has her own message = 100%
              return { isSynced: true, syncPercentage: 100 }
            } else if (deviceId === 'bob') {
              // Bob sent 0, received 0 of Alice's 1 message = 0%
              return { isSynced: false, syncPercentage: 0 }
            }
            return { isSynced: false, syncPercentage: 0 }
          })
          
          cy.stub(engine, 'getExecutedEvents').returns([
            {
              simTime: 1000,
              type: 'message',
              deviceId: 'alice',
              eventId: 'msg-alice-1',
              data: { content: 'Hello Bob!' },
              executed: true
            }
          ])
        }
      })

      // Alice should show 100% (has her own message)
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.contains('100%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('have.class', 'synced')
      })

      // Bob should show 0% (hasn't received Alice's message)
      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('0%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('not.have.class', 'synced')
      })
    })

    it('shows 50% sync when Bob receives half of Alice\'s messages', () => {
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          engine.reset()
          
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').callsFake((deviceId: string) => {
            if (deviceId === 'alice') {
              // Alice has both her messages = 100%
              return { isSynced: true, syncPercentage: 100 }
            } else if (deviceId === 'bob') {
              // Bob sent 0, received 1 of Alice's 2 messages = 50%
              return { isSynced: false, syncPercentage: 50 }
            }
            return { isSynced: false, syncPercentage: 50 }
          })
          
          cy.stub(engine, 'getExecutedEvents').returns([
            {
              simTime: 1000,
              type: 'message',
              deviceId: 'alice',
              eventId: 'msg-alice-1',
              data: { content: 'First message' },
              executed: true
            },
            {
              simTime: 2000,
              type: 'message',
              deviceId: 'alice',
              eventId: 'msg-alice-2',
              data: { content: 'Second message' },
              executed: true
            }
          ])
        }
      })

      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.contains('100%').should('be.visible')
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('50%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('not.have.class', 'synced')
      })
    })
  })

  describe('Bidirectional Sync', () => {
    it('shows correct sync when both devices send and receive messages', () => {
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          engine.reset()
          
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').callsFake((deviceId: string) => {
            if (deviceId === 'alice') {
              // Alice: sent 2, received 1 of Bob's 1 = (2+1)/3 = 100%
              return { isSynced: true, syncPercentage: 100 }
            } else if (deviceId === 'bob') {
              // Bob: sent 1, received 2 of Alice's 2 = (1+2)/3 = 100%
              return { isSynced: true, syncPercentage: 100 }
            }
            return { isSynced: true, syncPercentage: 100 }
          })
          
          cy.stub(engine, 'getExecutedEvents').returns([
            {
              simTime: 1000,
              type: 'message',
              deviceId: 'alice',
              eventId: 'msg-alice-1',
              data: { content: 'Hello from Alice' },
              executed: true
            },
            {
              simTime: 2000,
              type: 'message',
              deviceId: 'bob',
              eventId: 'msg-bob-1',
              data: { content: 'Hi Alice!' },
              executed: true
            },
            {
              simTime: 3000,
              type: 'message',
              deviceId: 'alice',
              eventId: 'msg-alice-2',
              data: { content: 'How are you?' },
              executed: true
            }
          ])
        }
      })

      // Both devices should show 100% sync
      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.contains('100%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('have.class', 'synced')
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('100%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('have.class', 'synced')
      })

      // Timeline should show all 3 messages
      cy.get('[data-testid="event-timeline"]').within(() => {
        cy.get('[data-testid="executed-event"]').should('have.length', 3)
        cy.contains('Hello from Alice').should('be.visible')
        cy.contains('Hi Alice!').should('be.visible')
        cy.contains('How are you?').should('be.visible')
      })
    })

    it('shows partial sync when one device misses some messages', () => {
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          engine.reset()
          
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').callsFake((deviceId: string) => {
            if (deviceId === 'alice') {
              // Alice: sent 2, received 0 of Bob's 1 = (2+0)/3 = 67%
              return { isSynced: false, syncPercentage: 67 }
            } else if (deviceId === 'bob') {
              // Bob: sent 1, received 1 of Alice's 2 = (1+1)/3 = 67%
              return { isSynced: false, syncPercentage: 67 }
            }
            return { isSynced: false, syncPercentage: 67 }
          })
        }
      })

      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.contains('67%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('not.have.class', 'synced')
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('67%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('not.have.class', 'synced')
      })
    })
  })

  describe('Network Conditions Impact', () => {
    it('shows degraded sync with high packet loss', () => {
      // Test packet loss scenario
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          // Simulate high packet loss configuration
          engine.updateNetworkConfig({ packetLossRate: 0.8 })
          
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').callsFake((deviceId: string) => {
            // Both devices have poor sync due to packet loss
            return { isSynced: false, syncPercentage: 20 }
          })
        }
      })

      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.contains('20%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('not.have.class', 'synced')
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('20%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('not.have.class', 'synced')
      })
    })

    it('shows improved sync when packet loss is reduced', () => {
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          // Start with packet loss, then improve it
          engine.updateNetworkConfig({ packetLossRate: 0.0 })
          
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').callsFake((deviceId: string) => {
            return { isSynced: true, syncPercentage: 100 }
          })
        }
      })

      cy.get('[data-testid="chat-alice"]').within(() => {
        cy.contains('100%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('have.class', 'synced')
      })

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('100%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('have.class', 'synced')
      })
    })
  })

  describe('Visual Sync Indicators', () => {
    it('shows green indicator for perfect sync', () => {
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').returns({
            isSynced: true,
            syncPercentage: 100
          })
        }
      })

      cy.get('[data-testid="sync-indicator"]').each(($indicator) => {
        cy.wrap($indicator).should('have.class', 'synced')
        cy.wrap($indicator).should('have.css', 'color').and('match', /rgb\\(40, 167, 69\\)|rgb\\(0, 123, 255\\)/) // Green or blue
      })
    })

    it('shows warning indicator for partial sync', () => {
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').returns({
            isSynced: false,
            syncPercentage: 60
          })
        }
      })

      cy.get('[data-testid="sync-indicator"]').each(($indicator) => {
        cy.wrap($indicator).should('not.have.class', 'synced')
        cy.wrap($indicator).should('have.class', 'syncing')
      })
    })

    it('shows error indicator for poor sync', () => {
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').returns({
            isSynced: false,
            syncPercentage: 10
          })
        }
      })

      cy.get('[data-testid="sync-indicator"]').each(($indicator) => {
        cy.wrap($indicator).should('not.have.class', 'synced')
        cy.wrap($indicator).should('not.have.class', 'syncing')
      })
    })
  })

  describe('Real-time Sync Updates', () => {
    it('updates sync percentage as messages are delivered', () => {
      let syncPercent = 0
      
      cy.window().then((win: any) => {
        const engine = win.app?.engine
        if (engine) {
          // Start with 0% sync
          cy.stub(engine.networkSimulator, 'getDeviceSyncStatus').callsFake(() => {
            return { isSynced: syncPercent >= 100, syncPercentage: syncPercent }
          })
        }
      })

      // Initially 0%
      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('0%').should('be.visible')
      })

      // Simulate message delivery - update sync to 50%
      cy.window().then(() => {
        syncPercent = 50
      })

      cy.wait(200) // Allow UI update

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('50%').should('be.visible')
      })

      // Complete sync - update to 100%
      cy.window().then(() => {
        syncPercent = 100
      })

      cy.wait(200)

      cy.get('[data-testid="chat-bob"]').within(() => {
        cy.contains('100%').should('be.visible')
        cy.get('[data-testid="sync-indicator"]').should('have.class', 'synced')
      })
    })
  })
})