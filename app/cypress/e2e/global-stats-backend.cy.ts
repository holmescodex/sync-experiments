describe('Global Stats Dashboard Backend Integration', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    cy.wait(3000) // Wait for initialization
  })

  it('should load global stats on page load', () => {
    // This test will fail until global stats endpoint is implemented
    
    // Mock global stats API
    cy.intercept('GET', 'http://localhost:3001/api/stats/global', {
      statusCode: 200,
      body: {
        totalMessages: 1234,
        totalEvents: 5678,
        totalFiles: 89,
        totalDataSize: 104857600, // 100MB
        activeDevices: 2,
        syncStatus: {
          alice: { syncPercentage: 100, lastSync: Date.now() - 5000 },
          bob: { syncPercentage: 98, lastSync: Date.now() - 3000 }
        },
        messageRate: {
          lastHour: 120,
          last24Hours: 2400,
          trend: 'increasing'
        },
        networkStats: {
          packetsExchanged: 45678,
          bytesTransferred: 10485760,
          averageLatency: 23
        }
      }
    }).as('globalStats')

    // Should fetch stats on load
    cy.wait('@globalStats')

    // Verify stats are displayed
    cy.get('.global-stats-panel').should('be.visible')
    cy.contains('Total Messages: 1,234').should('be.visible')
    cy.contains('Total Events: 5,678').should('be.visible')
    cy.contains('Active Devices: 2').should('be.visible')
    cy.contains('100 MB').should('be.visible') // Total data size
  })

  it('should update stats in real-time', () => {
    // This test will fail until real-time updates are implemented
    
    let statsCallCount = 0
    cy.intercept('GET', 'http://localhost:3001/api/stats/global', (req) => {
      statsCallCount++
      req.reply({
        statusCode: 200,
        body: {
          totalMessages: 1000 + (statsCallCount * 10),
          activeDevices: 2,
          messageRate: {
            lastMinute: statsCallCount * 2
          }
        }
      })
    }).as('statsUpdate')

    // Initial load
    cy.wait('@statsUpdate')

    // Wait for next update (should poll every 5 seconds)
    cy.wait(5500)
    cy.wait('@statsUpdate')

    // Stats should have updated
    cy.contains('Total Messages: 1,010').should('be.visible')
    
    // Wait for another update
    cy.wait(5500)
    cy.wait('@statsUpdate')
    
    cy.contains('Total Messages: 1,020').should('be.visible')
  })

  it('should show per-device breakdown', () => {
    // This test will fail until device breakdown is implemented
    
    cy.intercept('GET', 'http://localhost:3001/api/stats/global', {
      statusCode: 200,
      body: {
        deviceBreakdown: {
          alice: {
            messages: 567,
            events: 2345,
            files: 12,
            dataSize: 52428800, // 50MB
            online: true,
            lastActivity: Date.now() - 1000
          },
          bob: {
            messages: 432,
            events: 1890,
            files: 8,
            dataSize: 31457280, // 30MB
            online: true,
            lastActivity: Date.now() - 2000
          }
        }
      }
    }).as('deviceStats')

    cy.wait('@deviceStats')

    // Should show device cards
    cy.get('.device-stats-card').should('have.length', 2)

    // Alice stats
    cy.get('[data-device="alice"]').within(() => {
      cy.contains('567 messages').should('be.visible')
      cy.contains('2,345 events').should('be.visible')
      cy.contains('50 MB').should('be.visible')
      cy.get('.status-indicator.online').should('exist')
    })

    // Bob stats
    cy.get('[data-device="bob"]').within(() => {
      cy.contains('432 messages').should('be.visible')
      cy.contains('1,890 events').should('be.visible')
      cy.contains('30 MB').should('be.visible')
    })
  })

  it('should show sync matrix between devices', () => {
    // This test will fail until sync matrix is implemented
    
    cy.intercept('GET', 'http://localhost:3001/api/stats/global', {
      statusCode: 200,
      body: {
        syncMatrix: {
          alice: {
            bob: { percentage: 100, lastSync: Date.now() - 5000 },
            charlie: { percentage: 85, lastSync: Date.now() - 60000 }
          },
          bob: {
            alice: { percentage: 98, lastSync: Date.now() - 5000 },
            charlie: { percentage: 90, lastSync: Date.now() - 45000 }
          },
          charlie: {
            alice: { percentage: 85, lastSync: Date.now() - 60000 },
            bob: { percentage: 90, lastSync: Date.now() - 45000 }
          }
        }
      }
    }).as('syncMatrix')

    cy.wait('@syncMatrix')

    // Should show sync matrix
    cy.get('.sync-matrix').should('be.visible')

    // Check specific sync percentages
    cy.get('[data-from="alice"][data-to="bob"]').within(() => {
      cy.contains('100%').should('be.visible')
      cy.should('have.class', 'fully-synced')
    })

    cy.get('[data-from="alice"][data-to="charlie"]').within(() => {
      cy.contains('85%').should('be.visible')
      cy.should('have.class', 'partially-synced')
    })
  })

  it('should show performance metrics', () => {
    // This test will fail until performance tracking is implemented
    
    cy.intercept('GET', 'http://localhost:3001/api/stats/global', {
      statusCode: 200,
      body: {
        performance: {
          avgMessageLatency: 23,
          avgSyncLatency: 145,
          messageProcessingRate: 234, // messages/second
          eventProcessingRate: 567, // events/second
          cpuUsage: 12.5,
          memoryUsage: 256000000, // 256MB
          diskUsage: 1073741824 // 1GB
        }
      }
    }).as('performanceStats')

    cy.wait('@performanceStats')

    // Should show performance panel
    cy.get('.performance-metrics').should('be.visible')
    cy.contains('Message Latency: 23ms').should('be.visible')
    cy.contains('Processing: 234 msg/s').should('be.visible')
    cy.contains('CPU: 12.5%').should('be.visible')
    cy.contains('Memory: 256 MB').should('be.visible')
  })

  it('should export stats data', () => {
    // This test will fail until export is implemented
    
    cy.intercept('GET', 'http://localhost:3001/api/stats/export', {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="stats-export.json"'
      },
      body: {
        exportTime: Date.now(),
        stats: { /* full stats data */ }
      }
    }).as('exportStats')

    // Click export button
    cy.get('.global-stats-panel').within(() => {
      cy.get('[data-testid="export-stats"]').click()
    })

    // Should trigger download
    cy.wait('@exportStats')
    
    // Verify download started (Cypress doesn't actually download files)
    cy.get('.download-notification').should('contain', 'Stats exported')
  })

  it('should handle stats loading errors', () => {
    // This test will fail until error handling is implemented
    
    cy.intercept('GET', 'http://localhost:3001/api/stats/global', {
      statusCode: 500,
      body: { error: 'Failed to aggregate stats' }
    }).as('statsError')

    cy.reload()
    cy.wait('@statsError')

    // Should show error state
    cy.get('.global-stats-panel').within(() => {
      cy.contains('Failed to load stats').should('be.visible')
      cy.get('[data-testid="retry-stats"]').should('be.visible')
    })

    // Mock successful retry
    cy.intercept('GET', 'http://localhost:3001/api/stats/global', {
      statusCode: 200,
      body: { totalMessages: 1000 }
    }).as('statsRetry')

    // Click retry
    cy.get('[data-testid="retry-stats"]').click()
    cy.wait('@statsRetry')

    // Should show stats
    cy.contains('Total Messages: 1,000').should('be.visible')
  })
})