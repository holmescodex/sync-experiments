describe('Backend Message Deduplication Test', () => {
  beforeEach(() => {
    cy.visit('http://localhost:5173')
    
    // Wait for initial load
    cy.get('[data-testid="simulation-app"]').should('exist')
    cy.get('[data-testid="chat-alice"]').should('exist')
    
    // Wait for initialization
    cy.wait(3000)
  })

  it('should handle backend message flow without duplicates', () => {
    const testMessage = 'Unique test ' + Date.now()
    
    // Enable console capture
    cy.window().then((win) => {
      const logs: string[] = []
      const originalLog = win.console.log
      win.console.log = (...args) => {
        const logStr = args.join(' ')
        logs.push(logStr)
        originalLog.apply(console, args)
      }
      
      // Store logs on window for later access
      (win as any).testLogs = logs
    })
    
    // Send a message
    cy.get('[data-testid="chat-alice"] .message-input').type(testMessage)
    cy.get('[data-testid="chat-alice"] .send-button').click()
    
    // Wait for all operations
    cy.wait(5000)
    
    // Check console logs
    cy.window().then((win) => {
      const logs = (win as any).testLogs as string[]
      cy.log('=== Console Logs Analysis ===')
      
      // Filter relevant logs
      const relevantLogs = logs.filter(log => 
        log.includes('[ChatInterface]') || 
        log.includes('[BackendAdapter]') ||
        log.includes('temp-') ||
        log.includes('Replaced')
      )
      
      relevantLogs.forEach((log, idx) => {
        cy.log(`Log ${idx}: ${log}`)
      })
      
      // Check for specific patterns
      const tempMessageLogs = logs.filter(log => log.includes('temp-'))
      const replacementLogs = logs.filter(log => log.includes('Replaced'))
      const backendIdLogs = logs.filter(log => log.includes('got ID:'))
      
      cy.log(`Temp message logs: ${tempMessageLogs.length}`)
      cy.log(`Replacement logs: ${replacementLogs.length}`)
      cy.log(`Backend ID logs: ${backendIdLogs.length}`)
    })
    
    // Check DOM state
    cy.get('[data-testid="chat-alice"] .message').then($messages => {
      cy.log('=== DOM Analysis ===')
      cy.log(`Total messages: ${$messages.length}`)
      
      // Check each message
      $messages.each((idx, el) => {
        const $msg = Cypress.$(el)
        const content = $msg.find('.message-content').text()
        const classes = $msg.attr('class')
        
        if (content.includes(testMessage)) {
          cy.log(`Message ${idx}: "${content}", classes="${classes}"`)
          
          // Try to find any data attributes that might help identify the message
          const attributes = Array.from(el.attributes)
            .map(attr => `${attr.name}="${attr.value}"`)
            .join(', ')
          cy.log(`Attributes: ${attributes}`)
        }
      })
      
      // Count instances of our test message
      const testMessageCount = $messages.filter(`:contains("${testMessage}")`).length
      expect(testMessageCount).to.equal(1, 'Test message should appear exactly once')
    })
  })

  it('should check if backend returns duplicates', () => {
    // Try to directly check what the backend returns
    cy.request({
      method: 'GET',
      url: 'http://localhost:3001/api/messages',
      failOnStatusCode: false
    }).then((response) => {
      if (response.status === 200) {
        cy.log('Backend is running, checking messages')
        const messages = response.body.messages || []
        cy.log(`Backend has ${messages.length} messages`)
        
        // Group messages by content to find duplicates
        const contentGroups = messages.reduce((acc: any, msg: any) => {
          const key = msg.content
          if (!acc[key]) acc[key] = []
          acc[key].push(msg)
          return acc
        }, {})
        
        // Check for duplicates
        Object.entries(contentGroups).forEach(([content, msgs]: [string, any[]]) => {
          if (msgs.length > 1) {
            cy.log(`DUPLICATE: "${content}" appears ${msgs.length} times`)
            msgs.forEach((msg, idx) => {
              cy.log(`  - ID: ${msg.id}, timestamp: ${msg.timestamp}`)
            })
          }
        })
      } else {
        cy.log('Backend not running, skipping backend check')
      }
    })
  })
})