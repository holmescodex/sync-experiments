describe('Backend Message API', () => {
  const ALICE_BACKEND = 'http://localhost:3001'
  const BOB_BACKEND = 'http://localhost:3003'
  
  // Skip visiting the app since we're testing backend directly
  before(() => {
    cy.log('Testing backend API directly')
  })

  it('should send and receive messages through backend API', () => {
    // Test Alice sending a message
    cy.request('POST', `${ALICE_BACKEND}/api/messages`, {
      content: 'Hello from Alice!'
    }).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body).to.have.property('id')
      expect(response.body.content).to.eq('Hello from Alice!')
      expect(response.body.author).to.eq('alice')
      
      const messageId = response.body.id

      // Get the message back
      cy.request(`${ALICE_BACKEND}/api/messages/${messageId}`).then((getResponse) => {
        expect(getResponse.status).to.eq(200)
        expect(getResponse.body.id).to.eq(messageId)
        expect(getResponse.body.content).to.eq('Hello from Alice!')
      })
    })
  })

  it('should retrieve multiple messages in order', () => {
    const timestamp = Date.now()

    // Send multiple messages
    cy.request('POST', `${ALICE_BACKEND}/api/messages`, {
      content: 'First message'
    })
    
    cy.wait(10) // Small delay to ensure ordering
    
    cy.request('POST', `${ALICE_BACKEND}/api/messages`, {
      content: 'Second message'
    })
    
    cy.wait(10)
    
    cy.request('POST', `${ALICE_BACKEND}/api/messages`, {
      content: 'Third message'
    })

    // Get all messages since timestamp
    cy.request(`${ALICE_BACKEND}/api/messages?since=${timestamp}`).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body.messages).to.have.length.at.least(3)
      
      const messages = response.body.messages
      expect(messages[0].content).to.include('First message')
      expect(messages[1].content).to.include('Second message') 
      expect(messages[2].content).to.include('Third message')
    })
  })

  it('should handle messages with attachments', () => {
    const attachment = {
      fileId: 'test-file-123',
      fileName: 'test.jpg',
      mimeType: 'image/jpeg',
      size: 1234
    }

    cy.request('POST', `${ALICE_BACKEND}/api/messages`, {
      content: 'Check out this image!',
      attachments: [attachment]
    }).then((response) => {
      expect(response.status).to.eq(200)
      expect(response.body.attachments).to.have.length(1)
      expect(response.body.attachments[0].fileId).to.eq('test-file-123')
    })
  })

  it('should isolate messages between devices', () => {
    // Alice sends a message
    cy.request('POST', `${ALICE_BACKEND}/api/messages`, {
      content: 'Alice private message'
    })

    // Bob sends a message
    cy.request('POST', `${BOB_BACKEND}/api/messages`, {
      content: 'Bob private message'
    })

    // Check Alice only sees her message
    cy.request(`${ALICE_BACKEND}/api/messages`).then((response) => {
      const aliceMessages = response.body.messages
      const hasAliceMessage = aliceMessages.some((m: any) => 
        m.content === 'Alice private message'
      )
      const hasBobMessage = aliceMessages.some((m: any) => 
        m.content === 'Bob private message'
      )
      
      expect(hasAliceMessage).to.be.true
      expect(hasBobMessage).to.be.false
    })

    // Check Bob only sees his message
    cy.request(`${BOB_BACKEND}/api/messages`).then((response) => {
      const bobMessages = response.body.messages
      const hasAliceMessage = bobMessages.some((m: any) => 
        m.content === 'Alice private message'
      )
      const hasBobMessage = bobMessages.some((m: any) => 
        m.content === 'Bob private message'
      )
      
      expect(hasAliceMessage).to.be.false
      expect(hasBobMessage).to.be.true
    })
  })
})