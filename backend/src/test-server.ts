// Simple test server that runs both Alice and Bob in one process
// This might be more stable than running two separate processes

import express from 'express'
import cors from 'cors'
import { messageRoutes } from './routes/messages'

const app = express()

// Middleware
app.use(cors())
app.use(express.json())

// Mount Alice routes
app.use('/api/alice', (req, res, next) => {
  (req as any).deviceId = 'alice'
  next()
}, messageRoutes)

// Mount Bob routes  
app.use('/api/bob', (req, res, next) => {
  (req as any).deviceId = 'bob'
  next()
}, messageRoutes)

// Combined health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    devices: ['alice', 'bob'],
    timestamp: Date.now()
  })
})

// Start server
const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Test server running on http://localhost:${port}`)
  console.log(`  Alice API: http://localhost:${port}/api/alice/messages`)
  console.log(`  Bob API:   http://localhost:${port}/api/bob/messages`)
})