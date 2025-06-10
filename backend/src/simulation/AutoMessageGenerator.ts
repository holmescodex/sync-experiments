// Using global fetch (available in Node 18+)

export class AutoMessageGenerator {
  private deviceId: string
  private messagesPerHour: number
  private imageAttachmentPercentage: number
  private isRunning: boolean = false
  private timer?: NodeJS.Timeout
  private backendUrl: string
  
  // Common message patterns
  private readonly messageTemplates = [
    "Hey, how's it going?",
    "Did you see that article I sent?",
    "Running a bit late, be there soon",
    "Thanks for the help earlier!",
    "Let's catch up this weekend",
    "Just finished the project",
    "Coffee tomorrow?",
    "That's hilarious 😂",
    "Can you send me the details?",
    "Sounds good to me",
    "I'll check and get back to you",
    "Meeting moved to 3pm",
    "Great work on the presentation!",
    "Any updates on this?",
    "Looking forward to it",
    "Just saw your message",
    "That makes sense",
    "I agree completely",
    "When works for you?",
    "No problem at all"
  ]
  
  constructor(deviceId: string, messagesPerHour: number = 30, imageAttachmentPercentage: number = 30) {
    this.deviceId = deviceId
    this.messagesPerHour = messagesPerHour
    this.imageAttachmentPercentage = imageAttachmentPercentage
    this.backendUrl = deviceId === 'alice' ? 'http://localhost:3001' : 'http://localhost:3002'
  }
  
  start() {
    if (this.isRunning) return
    
    this.isRunning = true
    console.log(`[AutoMessageGenerator] Starting for ${this.deviceId} at ${this.messagesPerHour} messages/hour`)
    
    // Schedule messages
    this.scheduleNextMessage()
  }
  
  stop() {
    this.isRunning = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = undefined
    }
    console.log(`[AutoMessageGenerator] Stopped for ${this.deviceId}`)
  }
  
  setMessagesPerHour(rate: number) {
    this.messagesPerHour = rate
    console.log(`[AutoMessageGenerator] ${this.deviceId} rate changed to ${rate} messages/hour`)
    
    // Reschedule if running
    if (this.isRunning && this.timer) {
      clearTimeout(this.timer)
      this.scheduleNextMessage()
    }
  }
  
  setImageAttachmentPercentage(percentage: number) {
    this.imageAttachmentPercentage = percentage
  }
  
  private scheduleNextMessage() {
    if (!this.isRunning || this.messagesPerHour === 0) return
    
    // Calculate delay until next message
    const messagesPerMs = this.messagesPerHour / (60 * 60 * 1000)
    const avgDelayMs = 1 / messagesPerMs
    
    // Add some randomness (±30%)
    const randomFactor = 0.7 + Math.random() * 0.6
    const delayMs = avgDelayMs * randomFactor
    
    this.timer = setTimeout(() => {
      this.sendMessage()
      this.scheduleNextMessage()
    }, delayMs)
  }
  
  private async sendMessage() {
    // Pick a random message
    const content = this.messageTemplates[Math.floor(Math.random() * this.messageTemplates.length)]
    
    // Determine if we should add an attachment
    const shouldAddAttachment = Math.random() * 100 < this.imageAttachmentPercentage
    
    const messageData: any = { content }
    
    if (shouldAddAttachment) {
      // Simulate an image attachment
      messageData.attachments = [{
        id: `auto-${Date.now()}`,
        name: `image-${Math.floor(Math.random() * 1000)}.jpg`,
        mimeType: 'image/jpeg',
        size: Math.floor(Math.random() * 1000000) + 100000 // 100KB - 1MB
      }]
    }
    
    try {
      console.log(`[AutoMessageGenerator] ${this.deviceId} attempting to send message to ${this.backendUrl}`)
      
      const response = await fetch(`${this.backendUrl}/api/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(messageData)
      })
      
      if (response.ok) {
        const result = await response.json()
        console.log(`[AutoMessageGenerator] ${this.deviceId} sent: "${content}"${shouldAddAttachment ? ' [with attachment]' : ''} - ID: ${result.id}`)
      } else {
        const errorText = await response.text()
        console.error(`[AutoMessageGenerator] ${this.deviceId} failed to send message:`, response.status, errorText)
      }
    } catch (error: any) {
      console.error(`[AutoMessageGenerator] ${this.deviceId} error sending message:`, error.message || error)
    }
  }
}